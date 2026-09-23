"""
Question/Answer segmentation.

When a scanned page has both the printed question and the student's
handwritten answer on it, the raw OCR text is just one undifferentiated
block. This asks the LLM to split it into {"question": ..., "answer": ...}
so nobody has to retype the question by hand - the agent reads the page
and separates it itself, the same way the four marking agents each read
their own inputs and produce structured output.

This mirrors what Scanning Management's Question Segregation Engine
(scope doc 6.2) is meant to eventually do upstream of this module; it is
implemented here only as a demo convenience for the single-page-upload
flow, using the same LLMClient abstraction as the real agents.
"""

from typing import Tuple

from llm.client import LLMClient

SYSTEM = """QA_SEGMENTATION_AGENT
You are given the raw OCR text of one scanned exam page, which contains
BOTH a printed/handwritten question AND a student's handwritten answer to
it, run together as one block of text (OCR does not know where one ends
and the other begins).

Split it into exactly two parts:
- question: the question being asked (strip any marks annotation like
  "(5 marks)" if present, but keep the actual question wording)
- answer: everything the student wrote in response

Rules:
- Do not summarise or reword either part - copy the original wording,
  correcting only obvious OCR noise (stray symbols, doubled letters).
- If you cannot find a clear question in the text (e.g. the page is only
  the answer), set "question" to an empty string and put everything in
  "answer".
- Preserve the original language (Urdu stays Urdu, English stays English).

Reply with JSON only, no prose, no code fences:
{"question":"...","answer":"..."}"""


def segment(client: LLMClient, raw_text: str, language: str) -> Tuple[str, str]:
    """Returns (question, answer). Falls back to (\"\", raw_text) if the
    model's reply can't be parsed, so a segmentation hiccup never blocks
    the upload - it just leaves the question blank for manual entry."""
    if not raw_text.strip():
        return "", ""
    user = f"Language: {language}\n\nRaw OCR text:\n{raw_text}"
    try:
        data = client.complete_json(SYSTEM, user, temperature=0.0)
        question = str(data.get("question", "")).strip()
        answer = str(data.get("answer", "")).strip()
        if not answer:
            return question, raw_text.strip()
        return question, answer
    except Exception:
        return "", raw_text.strip()
