"""
AI Marking microservice.

Scope: this service does exactly one job - given exam content (an answer
to mark, or raw OCR text to segment, or an image/PDF to read), run the
actual AI logic (agents/, pipeline.py, ocr.py, segment.py) and return the
result. It has NO auth, NO sessions, NO roles, NO notion of "users" or
"papers" as business objects, and NO endpoint that a browser calls
directly - that is all the .NET backend's job (backend/), which is the
only caller of this service.

This split exists because the scope doc commits the web app itself
(frontend + backend) to React + .NET, while the AI agents correctly stay
Python (LLM orchestration is Python's strength, and this was already the
documented language choice for this module before that stack was
finalized). The .NET backend calls this service over HTTP for the three
things only Python code here can do.

Run with (from the repo root):
    venv/Scripts/python -m uvicorn app:app --app-dir ai-service --port 8001
or, from inside ai-service/:
    ../venv/Scripts/python -m uvicorn app:app --port 8001
"""

import json
import os
import sys
import time
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # ai-service/ itself

from schemas import AnswerSegment
from llm.client import StubLLM, OpenAICompatibleClient
from pipeline import MarkingPipeline
import ocr
import segment as qa_segment

REAL_MODEL_ID = "qwen2.5:1.5b-instruct"

app = FastAPI(title="Paper Marker - AI Marking Service")

# One MarkingPipeline instance per model, reused across every request - this
# is what makes the RubricAgent/SolutionAgent per-question caching (see
# agents/rubric_agent.py, agents/solution_agent.py) actually pay off across
# a batch of papers answering the same question, rather than resetting on
# every call.
_pipelines = {
    "stub": MarkingPipeline(StubLLM(), use_critic=True, self_consistency_runs=3),
}


def _get_pipeline(model: str) -> MarkingPipeline:
    if model not in _pipelines:
        if model != "real":
            raise HTTPException(400, f"Unknown model '{model}'")
        client = OpenAICompatibleClient(model_id=REAL_MODEL_ID)
        _pipelines["real"] = MarkingPipeline(client, use_critic=True,
                                             self_consistency_runs=1)
    return _pipelines[model]


@app.get("/internal/health")
def health():
    return {"ok": True, "service": "ai-marking"}


@app.post("/internal/ocr")
async def run_ocr(file: UploadFile = File(...), language: str = Form("en")):
    """Demo-only OCR stand-in (see ocr.py) - not the real Scanning module.
    Image/PDF bytes in, extracted text + a real confidence score out, so
    the caller's OCR_CONFIDENCE_FLOOR gate can act on it honestly."""
    raw_bytes = await file.read()
    is_pdf = (file.content_type == "application/pdf"
             or (file.filename or "").lower().endswith(".pdf"))
    try:
        if is_pdf:
            raw_text, confidence = ocr.extract_pdf_text(raw_bytes)
        else:
            raw_text, confidence = ocr.run_ocr(raw_bytes, language)
    except Exception as exc:
        kind = "PDF" if is_pdf else "image"
        raise HTTPException(422, f"OCR failed to read this {kind}: {exc}")
    return {"raw_text": raw_text, "confidence": confidence,
           "source_type": "pdf" if is_pdf else "image"}


class SegmentRequest(BaseModel):
    raw_text: str
    language: str = "en"
    model: str = "stub"


@app.post("/internal/segment")
def run_segment(req: SegmentRequest):
    """Raw OCR text in (question + answer together on one page), the split
    question_text/answer_text out (see segment.py)."""
    pipeline = _get_pipeline(req.model)
    question_text, answer_text = qa_segment.segment(pipeline.client, req.raw_text, req.language)
    return {"question_text": question_text, "answer_text": answer_text}


class MarkRequest(BaseModel):
    segment_id: str
    anon_uuid: str
    exam_id: str
    question_id: str
    language: str
    max_marks: float
    ocr_text: str
    ocr_confidence: float
    image_path: str = ""
    marking_scheme: Optional[str] = None
    official_answer_key: Optional[str] = None
    question_text: str = ""
    model: str = "stub"


@app.post("/internal/mark")
def run_mark(req: MarkRequest):
    """A segment + its rubric info in, a full Evaluation out. A pure
    function of its inputs - caching by segment_id (so a paper isn't
    re-marked every time someone views it) is the caller's job, not this
    service's; this always actually runs the pipeline."""
    pipeline = _get_pipeline(req.model)
    seg = AnswerSegment(
        segment_id=req.segment_id, anon_uuid=req.anon_uuid, exam_id=req.exam_id,
        question_id=req.question_id, language=req.language, max_marks=req.max_marks,
        ocr_text=req.ocr_text, ocr_confidence=req.ocr_confidence, image_path=req.image_path)
    start = time.perf_counter()
    result = pipeline.mark(
        seg, marking_scheme_text=req.marking_scheme,
        official_answer_key=req.official_answer_key, question_text=req.question_text)
    elapsed = time.perf_counter() - start
    payload = json.loads(result.to_json())
    payload["elapsed_seconds"] = round(elapsed, 1)
    payload["model_used"] = REAL_MODEL_ID if req.model == "real" else "stub-v1"
    return payload
