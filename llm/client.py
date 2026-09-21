"""
LLM provider abstraction.

Phase 0 is not resolved yet (external API vs on-premise model), so nothing
in the pipeline talks to a provider directly. Swap the client, keep the
agents. StubLLM lets you build and test the whole pipeline offline today.

OpenAICompatibleClient works unchanged against:
  - Ollama          (http://localhost:11434/v1)   <- on-premise, data stays in
  - vLLM / LM Studio / llama.cpp server
  - any OpenAI-compatible hosted API
"""

from abc import ABC, abstractmethod
import json
import re
from typing import Optional


class LLMClient(ABC):
    model_id: str = "unknown"

    @abstractmethod
    def complete(self, system: str, user: str, temperature: float = 0.0,
                 seed: Optional[int] = None) -> str:
        ...

    def complete_json(self, system: str, user: str, temperature: float = 0.0,
                      seed: Optional[int] = None) -> dict:
        """Call the model and parse JSON out of the reply, tolerating fences."""
        raw = self.complete(system, user, temperature=temperature, seed=seed)
        return extract_json(raw)


def extract_json(raw: str) -> dict:
    """Models wrap JSON in prose or ```json fences. Dig it out."""
    text = raw.strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        return json.loads(text[start:end + 1])
    raise ValueError(f"No JSON found in model output: {raw[:300]}")


class OpenAICompatibleClient(LLMClient):
    """Requires `pip install openai`. Point base_url at Ollama for on-prem."""

    def __init__(self, model_id: str,
                 base_url: str = "http://localhost:11434/v1",
                 api_key: str = "not-needed"):
        from openai import OpenAI  # imported lazily so the stub runs bare
        self._client = OpenAI(base_url=base_url, api_key=api_key)
        self.model_id = model_id

    def complete(self, system: str, user: str, temperature: float = 0.0,
                 seed: Optional[int] = None) -> str:
        resp = self._client.chat.completions.create(
            model=self.model_id,
            temperature=temperature,
            seed=seed,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        return resp.choices[0].message.content


class StubLLM(LLMClient):
    """
    Deterministic offline stand-in. Returns plausible, schema-correct JSON so
    you can develop and test the pipeline before Phase 0 is decided.

    It marks by answer length - that is NOT your baseline model, it is
    scaffolding. Replace it before measuring anything.
    """

    model_id = "stub-v1"

    def __init__(self, jitter: float = 0.0):
        self.jitter = jitter          # simulate run-to-run disagreement
        self._call_count = 0

    def complete(self, system: str, user: str, temperature: float = 0.0,
                 seed: Optional[int] = None) -> str:
        self._call_count += 1
        if "RUBRIC_AGENT" in system:
            return self._stub_rubric()
        if "SOLUTION_AGENT" in system:
            return json.dumps({
                "answer_text": "Stub model answer.",
                "acceptable_variants": ["stub variant"],
                "common_errors": ["stub error"],
            }, ensure_ascii=False)
        if "CRITIC_AGENT" in system:
            return json.dumps({"verdict": "accept", "reasons": [],
                               "adjusted_total": None})
        return self._stub_evaluation(user)

    def _stub_rubric(self) -> str:
        return json.dumps({
            "criteria": [
                {"criterion_id": "c1", "description": "Key concept stated",
                 "marks": 2.0, "keywords": [], "acceptable_variants": []},
                {"criterion_id": "c2", "description": "Explanation given",
                 "marks": 3.0, "keywords": [], "acceptable_variants": []},
            ]
        }, ensure_ascii=False)

    def _stub_evaluation(self, user: str) -> str:
        answer_len = len(user)
        base = 0.8 if answer_len > 1200 else 0.5 if answer_len > 900 else 0.2
        wobble = (self._call_count % 3) * self.jitter
        frac = max(0.0, min(1.0, base + wobble))
        return json.dumps({
            "scores": [
                {"criterion_id": "c1", "awarded": round(2.0 * frac, 1),
                 "max_marks": 2.0, "evidence_span": "stub evidence",
                 "justification": "Stub justification.", "confidence": 0.8},
                {"criterion_id": "c2", "awarded": round(3.0 * frac, 1),
                 "max_marks": 3.0, "evidence_span": "stub evidence",
                 "justification": "Stub justification.", "confidence": 0.8},
            ],
            "overall_confidence": 0.8,
            "suspicious_content": False,
        }, ensure_ascii=False)