"""
Agent 2 - Solution Agent.

Important design decision for your report: if the institution supplies an
official answer key, USE IT. Generating a model answer when a real one exists
is strictly worse. This agent therefore has two modes:

  official_key -> pass the real answer through, and only generate the
                  acceptable variants and common errors around it.
  generated    -> synthesise a model answer from the rubric.

Saying this out loud in your defence shows judgement rather than
LLM-for-everything reflex.
"""

from typing import Optional
from schemas import Rubric, ModelAnswer
from llm.client import LLMClient

SYSTEM = """SOLUTION_AGENT
You produce the reference material an examiner needs to mark an answer.

Given a question and its rubric, produce:
- answer_text: a concise model answer that would score full marks.
- acceptable_variants: other phrasings/approaches that also deserve credit,
  including partially-correct routes.
- common_errors: mistakes students typically make on this question.

Write in the same language as the question (Urdu question -> Urdu answer).
Be concise. Do not pad.

Reply with JSON only, no prose, no code fences:
{"answer_text":"...","acceptable_variants":["..."],"common_errors":["..."]}"""


class SolutionAgent:
    def __init__(self, client: LLMClient):
        self.client = client

    def build(self, rubric: Rubric,
              official_answer_key: Optional[str] = None) -> ModelAnswer:
        criteria_block = "\n".join(
            f"- [{c.criterion_id}] ({c.marks} marks) {c.description}"
            for c in rubric.criteria
        )
        if official_answer_key and official_answer_key.strip():
            user = (f"Language: {rubric.language}\n"
                    f"Question: {rubric.question_text}\n"
                    f"Rubric:\n{criteria_block}\n\n"
                    f"OFFICIAL ANSWER KEY (authoritative - reproduce it as "
                    f"answer_text, do not rewrite it):\n{official_answer_key}\n\n"
                    f"Produce only the acceptable_variants and common_errors "
                    f"around this official answer.")
            source = "official_key"
        else:
            user = (f"Language: {rubric.language}\n"
                    f"Question: {rubric.question_text}\n"
                    f"Rubric:\n{criteria_block}\n\n"
                    f"No official key exists. Synthesise the model answer.")
            source = "generated"

        data = self.client.complete_json(SYSTEM, user)
        answer_text = data.get("answer_text", "")
        if source == "official_key" and official_answer_key:
            # Never let the model paraphrase an authoritative key.
            answer_text = official_answer_key
        return ModelAnswer(
            question_id=rubric.question_id,
            answer_text=answer_text,
            acceptable_variants=data.get("acceptable_variants", []) or [],
            common_errors=data.get("common_errors", []) or [],
            source=source,
        )