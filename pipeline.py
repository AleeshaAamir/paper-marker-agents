"""
The marking pipeline: AnswerSegment in, Evaluation out.

Order of operations, and the reason for each gate:

  1. Pre-flight gates   - empty answer / OCR below the language floor.
                          Never let the AI mark text it cannot read; a
                          confident mark on garbage is worse than no mark.
  2. Rubric Agent       - marking scheme -> structured criteria.
  3. Solution Agent     - reference answer + acceptable variants.
  4. Evaluation Agent   - run N times (self-consistency).
  5. Consistency gate   - runs disagree -> human review.
  6. Critic Agent       - audit the winning run for unsupported marks.
  7. Confidence gate    - low confidence -> human review.

Every gate sets a flag rather than silently changing a mark. The teacher's
portal shows the flags; nothing is hidden from the human in the loop.
"""

from statistics import median
from typing import Optional, List

import config
from schemas import (AnswerSegment, Evaluation, Status, Flag)
from llm.client import LLMClient
from agents.rubric_agent import RubricAgent
from agents.solution_agent import SolutionAgent
from agents.evaluation_agent import EvaluationAgent
from agents.critic_agent import CriticAgent
from sanitize import detect_injection


class MarkingPipeline:
    def __init__(self, client: LLMClient, use_critic: bool = True,
                 self_consistency_runs: int = config.SELF_CONSISTENCY_RUNS):
        self.client = client
        self.rubric_agent = RubricAgent(client)
        self.solution_agent = SolutionAgent(client)
        self.evaluation_agent = EvaluationAgent(client)
        self.critic_agent = CriticAgent(client) if use_critic else None
        self.runs = max(1, self_consistency_runs)

    def mark(self, segment: AnswerSegment,
             marking_scheme_text: Optional[str] = None,
             official_answer_key: Optional[str] = None,
             question_text: str = "") -> Evaluation:

        flags: List[str] = []

        # --- 1. pre-flight gates -----------------------------------------
        if len(segment.ocr_text.strip()) < config.MIN_ANSWER_CHARS:
            return self._halt(segment, Status.UNREADABLE, [Flag.EMPTY_ANSWER])

        floor = config.OCR_CONFIDENCE_FLOOR_BY_LANG.get(
            segment.language, config.OCR_CONFIDENCE_FLOOR)
        if segment.ocr_confidence < floor:
            return self._halt(segment, Status.NEEDS_MANUAL_REVIEW,
                              [Flag.LOW_OCR_CONFIDENCE])

        if detect_injection(segment.ocr_text):
            flags.append(Flag.PROMPT_INJECTION_SUSPECTED)
        if segment.language == "ur":
            flags.append(Flag.URDU_LOW_RESOURCE)

        # --- 2 & 3. reference material -----------------------------------
        rubric = self.rubric_agent.build(
            question_id=segment.question_id,
            question_text=question_text or segment.question_id,
            max_marks=segment.max_marks,
            language=segment.language,
            marking_scheme_text=marking_scheme_text)

        model_answer = self.solution_agent.build(rubric, official_answer_key)

        # --- 4. evaluation, repeated -------------------------------------
        attempts = []
        for run_index in range(self.runs):
            scores, confidence, suspicious = self.evaluation_agent.evaluate(
                segment, rubric, model_answer, seed=run_index)
            attempts.append((sum(s.awarded for s in scores), scores,
                             confidence, suspicious))

        totals = [a[0] for a in attempts]

        # --- 5. consistency gate -----------------------------------------
        if self.runs > 1 and (max(totals) - min(totals)) > config.SELF_CONSISTENCY_TOLERANCE:
            flags.append(Flag.INCONSISTENT_RUNS)

        # Take the median run, not the mean: medians resist one wild outlier.
        target = median(totals)
        best = min(attempts, key=lambda a: abs(a[0] - target))
        total, scores, confidence, suspicious = best
        if suspicious:
            flags.append(Flag.PROMPT_INJECTION_SUSPECTED)

        # --- 6. critic ----------------------------------------------------
        if self.critic_agent is not None:
            verdict, reasons = self.critic_agent.review(segment, rubric, scores)
            if verdict == "revise":
                flags.append(Flag.CRITIC_REJECTED)
                for reason in reasons[:3]:
                    flags.append(f"CRITIC: {reason}")

        # --- 7. confidence gate -------------------------------------------
        if confidence < config.MODEL_CONFIDENCE_FLOOR:
            flags.append(Flag.LOW_MODEL_CONFIDENCE)

        needs_human = any(f in flags for f in (
            Flag.INCONSISTENT_RUNS, Flag.CRITIC_REJECTED,
            Flag.LOW_MODEL_CONFIDENCE, Flag.PROMPT_INJECTION_SUSPECTED))
        status = Status.NEEDS_MANUAL_REVIEW if needs_human else Status.AI_SCORED

        return Evaluation(
            segment_id=segment.segment_id,
            question_id=segment.question_id,
            anon_uuid=segment.anon_uuid,
            scores=scores,
            total_awarded=round(min(total, segment.max_marks), 2),
            max_marks=segment.max_marks,
            overall_confidence=round(confidence, 3),
            status=status,
            flags=flags,
            model_id=self.client.model_id,
            rubric_source=rubric.source,
        )

    def _halt(self, segment: AnswerSegment, status: str,
              flags: List[str]) -> Evaluation:
        """Stop before marking. No marks are invented for unreadable work."""
        return Evaluation(
            segment_id=segment.segment_id,
            question_id=segment.question_id,
            anon_uuid=segment.anon_uuid,
            scores=[], total_awarded=0.0, max_marks=segment.max_marks,
            overall_confidence=0.0, status=status, flags=flags,
            model_id=self.client.model_id, rubric_source="none")