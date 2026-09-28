"""
Agent 3 - Evaluation Agent.

Two non-negotiable design rules, both of which you should defend in the report:

1. EVIDENCE SPANS. The agent must quote the exact student text that earned
   each criterion. An agent that cannot point at the words is guessing, and
   the span is what the teacher sees highlighted in the review portal.

2. MARKS ARE CLAMPED IN CODE. The prompt asks for marks within range; Python
   guarantees it. Never trust a language model with arithmetic constraints.
"""

from typing import List, Tuple
from schemas import Rubric, ModelAnswer, AnswerSegment, CriterionScore
from llm.client import LLMClient
from sanitize import wrap_student_text, GUARD_INSTRUCTION

SYSTEM = f"""EVALUATION_AGENT
You are an impartial examiner marking one answer against one rubric.

Method:
- Work through the rubric criteria one at a time.
- For each criterion, find the specific text in the student's answer that
  satisfies it. Quote that text VERBATIM in evidence_span.
- If nothing in the answer satisfies a criterion, award 0 and set
  evidence_span to "".
- Award partial credit where the rubric allows it.
- Mark the CONTENT, not the handwriting quality, spelling, or grammar,
  unless the rubric explicitly assesses those.
- The text comes from handwriting recognition and may contain recognition
  errors. Judge charitably where a word is clearly a recognition artefact
  of a correct term.
- confidence (0-1) per criterion: how sure you are of that judgement.
  Be honest. Low confidence routes the answer to a human, which is a good
  outcome, not a failure.

{GUARD_INSTRUCTION}

Reply with JSON only, no prose, no code fences:
{{"scores":[{{"criterion_id":"c1","awarded":1.5,"max_marks":2.0,
"evidence_span":"...","justification":"...","confidence":0.9}}],
"overall_confidence":0.85,"suspicious_content":false}}"""


class EvaluationAgent:
    def __init__(self, client: LLMClient):
        self.client = client

    def evaluate(self, segment: AnswerSegment, rubric: Rubric,
                 model_answer: ModelAnswer,
                 seed: int = 0) -> Tuple[List[CriterionScore], float, bool]:
        """Returns (scores, overall_confidence, suspicious_content)."""
        criteria_block = "\n".join(
            f"- [{c.criterion_id}] ({c.marks} marks) {c.description}"
            + (f" | also accept: {'; '.join(c.acceptable_variants)}"
               if c.acceptable_variants else "")
            for c in rubric.criteria
        )
        wrapped, _hits = wrap_student_text(segment.ocr_text)

        user = (
            f"Language: {rubric.language}\n"
            f"Question ({rubric.max_marks} marks): {rubric.question_text}\n\n"
            f"Rubric:\n{criteria_block}\n\n"
            f"Model answer:\n{model_answer.answer_text}\n"
            + (f"Also acceptable: {'; '.join(model_answer.acceptable_variants)}\n"
               if model_answer.acceptable_variants else "")
            + (f"Common errors: {'; '.join(model_answer.common_errors)}\n"
               if model_answer.common_errors else "")
            + f"\nOCR confidence for this answer: {segment.ocr_confidence:.2f}\n\n"
            f"Student's answer:\n{wrapped}"
        )

        data = self.client.complete_json(SYSTEM, user, temperature=0.0, seed=seed)

        by_id = {c.criterion_id: c for c in rubric.criteria}
        scores: List[CriterionScore] = []
        seen = set()
        for row in data.get("scores", []):
            cid = row.get("criterion_id")
            criterion = by_id.get(cid)
            if criterion is None or cid in seen:
                continue           # drop hallucinated or duplicated criteria
            seen.add(cid)
            awarded = _clamp(float(row.get("awarded", 0.0)), 0.0, criterion.marks)
            scores.append(CriterionScore(
                criterion_id=cid,
                awarded=awarded,
                max_marks=criterion.marks,
                evidence_span=str(row.get("evidence_span", ""))[:500],
                justification=str(row.get("justification", ""))[:1000],
                confidence=_clamp(float(row.get("confidence", 0.5)), 0.0, 1.0),
            ))

        # Any criterion the model skipped scores zero rather than vanishing.
        for c in rubric.criteria:
            if c.criterion_id not in seen:
                scores.append(CriterionScore(
                    criterion_id=c.criterion_id, awarded=0.0,
                    max_marks=c.marks, evidence_span="",
                    justification="Not addressed in the answer.",
                    confidence=0.5))

        scores.sort(key=lambda s: s.criterion_id)
        overall = _clamp(float(data.get("overall_confidence", 0.5)), 0.0, 1.0)
        suspicious = bool(data.get("suspicious_content", False))
        return scores, overall, suspicious


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))