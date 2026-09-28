"""
Agent 4 - Critic Agent.

This is the agent that earns the word "multi-agent" in your project title.

It re-reads the Evaluation Agent's output and checks it against the student's
actual text, looking for the specific failure mode of LLM markers:
awarding marks for content that is not there. Its main tool is the evidence
span - if the quoted span does not appear in the student's answer, the mark
was hallucinated.

Half of this check is done in plain Python (span verification), which is
cheap, deterministic, and demonstrates that you did not just add another
prompt and call it an agent.
"""

from typing import List, Tuple
from schemas import AnswerSegment, Rubric, CriterionScore
from llm.client import LLMClient
from sanitize import wrap_student_text, GUARD_INSTRUCTION

SYSTEM = f"""CRITIC_AGENT
You audit another examiner's marking. You do not re-mark from scratch.

Check for:
- Marks awarded for content that does not appear in the student's answer.
- Justifications that contradict the evidence span.
- Criteria marked as satisfied where the evidence is only superficially
  similar (keyword match without understanding).
- Marks withheld for content that IS present (over-harsh marking).

{GUARD_INSTRUCTION}

Reply with JSON only, no prose, no code fences:
{{"verdict":"accept"|"revise","reasons":["..."],"adjusted_total":null|number}}"""


class CriticAgent:
    def __init__(self, client: LLMClient):
        self.client = client

    def review(self, segment: AnswerSegment, rubric: Rubric,
               scores: List[CriterionScore]) -> Tuple[str, List[str]]:
        """Returns (verdict, reasons). verdict is 'accept' or 'revise'."""
        # --- deterministic check first: do the evidence spans actually exist?
        reasons = _verify_spans(segment.ocr_text, scores)
        if reasons:
            return "revise", reasons

        wrapped, _ = wrap_student_text(segment.ocr_text)
        marking_block = "\n".join(
            f"- [{s.criterion_id}] {s.awarded}/{s.max_marks} "
            f"| evidence: \"{s.evidence_span}\" | reason: {s.justification}"
            for s in scores
        )
        user = (f"Question: {rubric.question_text}\n\n"
                f"Marking under review:\n{marking_block}\n\n"
                f"Student's answer:\n{wrapped}")

        data = self.client.complete_json(SYSTEM, user)
        verdict = data.get("verdict", "accept")
        return ("revise" if verdict == "revise" else "accept",
                data.get("reasons", []) or [])


def _normalise(text: str) -> str:
    return " ".join(text.lower().split())


def _verify_spans(ocr_text: str, scores: List[CriterionScore]) -> List[str]:
    """
    A non-empty evidence span that does not occur in the student's text means
    the mark was invented. Cheap, deterministic hallucination detection.
    """
    haystack = _normalise(ocr_text)
    problems = []
    for s in scores:
        if s.awarded <= 0 or not s.evidence_span.strip():
            continue
        needle = _normalise(s.evidence_span)
        if len(needle) < 4:
            continue
        if needle not in haystack:
            problems.append(
                f"Criterion {s.criterion_id}: evidence span not found in the "
                f"student's answer - {s.awarded} mark(s) may be unsupported.")
    return problems