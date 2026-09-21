"""
Agent 1 - Rubric Agent.

NOT a database lookup. It PARSES the official marking scheme (free text, as
the exam board writes it) into a structured, machine-checkable rubric:
discrete criteria, marks per criterion, acceptable variants.

That parsing step is what makes it an agent rather than a SELECT statement -
and it is what you say when the panel asks.
"""

from typing import List, Optional
from schemas import Rubric, RubricCriterion
from llm.client import LLMClient

SYSTEM = """RUBRIC_AGENT
You convert an examiner's marking scheme into a structured rubric.

Rules:
- Split the scheme into discrete, independently checkable criteria.
- The criteria marks MUST sum exactly to the question's maximum marks.
- Preserve the scheme's own wording in each description; do not invent
  requirements the examiner did not write.
- If the scheme is vague, still produce criteria, but keep descriptions
  close to the original wording rather than elaborating.
- For Urdu questions, write descriptions in Urdu.

Reply with JSON only, no prose, no code fences:
{"criteria":[{"criterion_id":"c1","description":"...","marks":2.0,
"keywords":["..."],"acceptable_variants":["..."]}]}"""


class RubricAgent:
    def __init__(self, client: LLMClient):
        self.client = client

    def build(self, question_id: str, question_text: str, max_marks: float,
              language: str, marking_scheme_text: Optional[str]) -> Rubric:
        if not marking_scheme_text or not marking_scheme_text.strip():
            # No official scheme: derive criteria from the question itself.
            source = "generated"
            scheme_block = ("NO OFFICIAL SCHEME SUPPLIED. Derive reasonable "
                            "criteria from the question and its mark value.")
        else:
            source = "official_scheme"
            scheme_block = marking_scheme_text

        user = (f"Language: {language}\n"
                f"Question ({max_marks} marks): {question_text}\n\n"
                f"Marking scheme:\n{scheme_block}")

        data = self.client.complete_json(SYSTEM, user)
        criteria = [
            RubricCriterion(
                criterion_id=c.get("criterion_id", f"c{i+1}"),
                description=c.get("description", ""),
                marks=float(c.get("marks", 0.0)),
                keywords=c.get("keywords", []) or [],
                acceptable_variants=c.get("acceptable_variants", []) or [],
            )
            for i, c in enumerate(data.get("criteria", []))
        ]
        criteria = _rebalance(criteria, max_marks)

        return Rubric(
            question_id=question_id,
            question_text=question_text,
            max_marks=max_marks,
            language=language,
            criteria=criteria,
            source=source,
        )


def _rebalance(criteria: List[RubricCriterion],
              max_marks: float) -> List[RubricCriterion]:
    """Rescale criteria marks proportionally so they sum exactly to max_marks.

    The prompt asks the model to make its criteria sum correctly, but LLMs
    round and drift. Enforce the invariant in code rather than trusting it.
    """
    total = sum(c.marks for c in criteria)
    if not criteria or total <= 0:
        return criteria
    scale = max_marks / total
    for c in criteria:
        c.marks = round(c.marks * scale, 2)
    drift = round(max_marks - sum(c.marks for c in criteria), 2)
    if drift:
        criteria[-1].marks = round(criteria[-1].marks + drift, 2)
    return criteria