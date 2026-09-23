"""
Demo web app for the AI Marking / Paper Checking review portal.

Scope note: this UI covers ONLY this module's boundary (per schemas.py) -
it consumes AnswerSegment records (the gold set stands in for what the
Scanning/OCR module would hand off, each already carrying its anon_uuid)
and displays the Evaluation each one produces. Accepting/flagging a paper
here is UI-only; it does not call the real Result Storage module (that is
a teammate's part, and the actual store is Supabase, not implemented here).

Run with:
    venv/Scripts/python -m uvicorn demo.app:app --reload --port 8000
then open http://localhost:8000
"""

import base64
import hashlib
import json
import os
import sys
import time
import uuid
from typing import Optional

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import config
from schemas import AnswerSegment
from llm.client import StubLLM, OpenAICompatibleClient
from pipeline import MarkingPipeline
from demo import mailer, ocr, segment as qa_segment
from demo.auth import (approve_user, authenticate, domain_hint, get_session,
                       list_pending_approvals, register, reject_user, verify_email)

GOLD_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                         "data", "gold_set.jsonl")
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")

REAL_MODEL_ID = "qwen2.5:7b-instruct"

app = FastAPI(title="Paper Marker - AI Marking Review (demo)")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.middleware("http")
async def no_cache_static(request, call_next):
    """This demo's HTML/CSS/JS change constantly during development - force
    the browser to always revalidate instead of silently showing a stale
    cached copy after an edit."""
    response = await call_next(request)
    if request.url.path.startswith("/static/") or request.url.path == "/":
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response

_pipelines = {
    "stub": MarkingPipeline(StubLLM(), use_critic=True, self_consistency_runs=3),
}
_mark_cache: dict = {}          # (segment_id, model) -> Evaluation dict
_teacher_decisions: dict = {}   # segment_id -> {"action": ..., "comment": ...}
_live_papers: list = []         # papers submitted through the "New Paper" form


def _gold_rows():
    with open(GOLD_PATH, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip() and not line.startswith("//")]


def _rows():
    return list(reversed(_live_papers)) + _gold_rows()


def _visible_rows(session: dict) -> list:
    """Same source list, narrowed to what this session's role may see."""
    rows = _rows()
    if session["role"] == "Teacher":
        email = session["email"]
        rows = [r for r in rows
               if r.get("source", "gold_set") == "gold_set" or r.get("assigned_to") == email]
    return rows


def _segment_from_row(row: dict) -> AnswerSegment:
    return AnswerSegment(
        segment_id=row["segment_id"], anon_uuid=row["anon_uuid"],
        exam_id=row["exam_id"], question_id=row["question_id"],
        language=row["language"], max_marks=row["max_marks"],
        ocr_text=row["ocr_text"], ocr_confidence=row["ocr_confidence"],
        image_path=row.get("image_path", ""))


def _verification_reference(segment_id: str) -> str:
    """Deterministic per-result verification code (scope doc 6.5/6.6:
    'a unique verification reference is generated for each result record').
    Not blockchain (see project memory: the team's actual storage choice
    is Supabase) - just a stable reference a student can quote to ask
    Supervisor/Admin to look the record up."""
    digest = hashlib.sha256(segment_id.encode()).hexdigest()[:16].upper()
    return f"VR-{digest}"


def _get_pipeline(model: str) -> MarkingPipeline:
    if model not in _pipelines:
        if model != "real":
            raise HTTPException(400, f"Unknown model '{model}'")
        client = OpenAICompatibleClient(model_id=REAL_MODEL_ID)
        _pipelines["real"] = MarkingPipeline(client, use_critic=True,
                                             self_consistency_runs=1)
    return _pipelines[model]


SERVER_VERSION = str(int(time.time()))


@app.get("/")
def index():
    """Cache headers alone have not been reliably stopping stale JS/CSS in
    some browsers/embedded webviews here, so force it: rewrite the asset
    URLs with a ?v=<server start time> query string. That is a different
    URL every time the server restarts, so there is no cached copy to
    serve regardless of how aggressively anything upstream caches - a
    fresh process can never accidentally show an old page."""
    with open(os.path.join(STATIC_DIR, "index.html"), encoding="utf-8") as f:
        html = f.read()
    html = html.replace('href="/static/style.css"',
                        f'href="/static/style.css?v={SERVER_VERSION}"')
    html = html.replace('src="/static/app.js"',
                        f'src="/static/app.js?v={SERVER_VERSION}"')
    return HTMLResponse(html)


@app.get("/favicon.ico")
def favicon():
    return Response(status_code=204)


class LoginRequest(BaseModel):
    email: str
    password: str
    role: str


@app.post("/api/login")
def login(req: LoginRequest):
    result, error = authenticate(req.email, req.password, req.role)
    if result is None:
        raise HTTPException(401, error)
    token, session = result
    return {"token": token, **session}


@app.get("/api/domains")
def domains():
    """So the login/registration forms can show/validate the right email
    suffix per role without hardcoding it twice."""
    return {
        "Admin": domain_hint("Admin"),
        "Teacher": domain_hint("Teacher"),
        "Student": domain_hint("Student"),
    }


class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    role: str


@app.post("/api/register")
def register_user(req: RegisterRequest):
    code, error = register(req.name, req.email, req.password, req.role)
    if code is None:
        raise HTTPException(400, error)

    email = req.email.strip().lower()
    sent = mailer.send_verification_email(email, req.name, code)
    if sent:
        return {"email": email, "email_sent": True}
    # Not configured, or this domain can't receive real mail (e.g. the
    # fictional @students.au.edu.pk) - fall back to showing it on-screen.
    return {"email": email, "email_sent": False, "demo_verification_code": code}


class VerifyEmailRequest(BaseModel):
    email: str
    code: str


@app.post("/api/verify-email")
def verify_email_endpoint(req: VerifyEmailRequest):
    status, error = verify_email(req.email, req.code)
    if status is None:
        raise HTTPException(400, error)
    return {"status": status}


def require_auth(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Not logged in.")
    session = get_session(authorization[len("Bearer "):])
    if session is None:
        raise HTTPException(401, "Session expired - please log in again.")
    return session


def require_admin(session: dict = Depends(require_auth)) -> dict:
    if session["role"] != "Admin":
        raise HTTPException(403, "Admin access required.")
    return session


@app.get("/api/pending-approvals")
def pending_approvals(session: dict = Depends(require_admin)):
    return list_pending_approvals()


@app.post("/api/approve/{email}")
def approve(email: str, session: dict = Depends(require_admin)):
    if not approve_user(email):
        raise HTTPException(404, "No pending registration for this email.")
    return {"ok": True}


@app.post("/api/reject/{email}")
def reject(email: str, session: dict = Depends(require_admin)):
    if not reject_user(email):
        raise HTTPException(404, "No pending registration for this email.")
    return {"ok": True}


@app.get("/api/me")
def me(session: dict = Depends(require_auth)):
    return session


@app.get("/api/segments")
def list_segments(session: dict = Depends(require_auth)):
    # A Teacher only sees the fixed sample/gold-set papers (for demo
    # purposes) plus whatever Admin has specifically assigned them - never
    # the full system-wide queue.
    rows = _visible_rows(session)
    out = []
    for row in rows:
        decision = _teacher_decisions.get(row["segment_id"])
        out.append({
            "segment_id": row["segment_id"],
            "anon_uuid": row["anon_uuid"],
            "question_id": row["question_id"],
            "question_text": row.get("question_text", ""),
            "language": row["language"],
            "max_marks": row["max_marks"],
            "human_mark": row.get("human_mark"),
            "source": row.get("source", "gold_set"),
            "assigned_to": row.get("assigned_to"),
            "teacher_decision": decision["action"] if decision else None,
            "triggers_second_marking": bool(decision and decision.get("triggers_second_marking")),
        })
    return out


@app.get("/api/mark/{segment_id}")
def mark_segment(segment_id: str, model: str = "stub",
                 session: dict = Depends(require_auth)):
    row = next((r for r in _visible_rows(session) if r["segment_id"] == segment_id), None)
    if row is None:
        raise HTTPException(404, f"No such segment: {segment_id}")

    cache_key = (segment_id, model)
    if cache_key not in _mark_cache:
        pipeline = _get_pipeline(model)
        segment = _segment_from_row(row)
        start = time.perf_counter()
        result = pipeline.mark(
            segment,
            marking_scheme_text=row.get("marking_scheme"),
            official_answer_key=row.get("official_answer_key"),
            question_text=row.get("question_text", ""))
        elapsed = time.perf_counter() - start
        payload = json.loads(result.to_json())
        payload["elapsed_seconds"] = round(elapsed, 1)
        payload["model_used"] = REAL_MODEL_ID if model == "real" else "stub-v1"
        _mark_cache[cache_key] = payload

    response = dict(_mark_cache[cache_key])
    response["ocr_text"] = row["ocr_text"]
    response["ocr_confidence"] = row["ocr_confidence"]
    response["question_text"] = row.get("question_text", "")
    response["marking_scheme"] = row.get("marking_scheme", "")
    response["human_mark"] = row.get("human_mark")
    response["anon_uuid"] = row["anon_uuid"]
    response["image_path"] = row.get("image_path", "")
    response["source"] = row.get("source", "gold_set")
    response["verification_reference"] = _verification_reference(segment_id)
    response["teacher_decision"] = _teacher_decisions.get(segment_id)
    return response


@app.get("/api/verify/{segment_id}")
def verify_result(segment_id: str, session: dict = Depends(require_auth)):
    row = next((r for r in _visible_rows(session) if r["segment_id"] == segment_id), None)
    if row is None:
        raise HTTPException(404, f"No such segment: {segment_id}")
    decision = _teacher_decisions.get(segment_id)
    if decision is None:
        raise HTTPException(409, "This result has not been reviewed/approved yet.")
    return {
        "verified": True,
        "segment_id": segment_id,
        "anon_uuid": row["anon_uuid"],
        "reference": _verification_reference(segment_id),
    }


@app.post("/api/ocr")
async def run_ocr(file: UploadFile = File(...), language: str = Form("en"),
                  model: str = Form("stub"), session: dict = Depends(require_auth)):
    """Demo-only OCR stand-in (see demo/ocr.py) - not the real Scanning
    module. Returns extracted text plus a real confidence score, so the
    existing OCR_CONFIDENCE_FLOOR gate can act on it honestly rather than
    always being fed a fake 0.95.

    Accepts JPG/PNG (Tesseract OCR on the pixels) or PDF (text pulled
    directly from the PDF's own text layer - only works for a digitally
    produced PDF, not one that's just a scanned photo with no text layer;
    that case fails with a clear message telling the user to upload the
    photo directly instead).

    The page is expected to carry BOTH the question and the student's
    answer - demo/segment.py's QA-segmentation step reads the raw OCR
    text and splits it into question_text/answer_text automatically, so
    nobody has to retype the question by hand."""
    raw_bytes = await file.read()
    is_pdf = (file.content_type == "application/pdf"
             or (file.filename or "").lower().endswith(".pdf"))

    preview_data_url = None
    try:
        if is_pdf:
            raw_text, confidence = ocr.extract_pdf_text(raw_bytes)
            # No page image to preview - this path never touched pixels.
        else:
            raw_text, confidence = ocr.run_ocr(raw_bytes, language)
            preview_mime = file.content_type or "image/jpeg"
            preview_data_url = f"data:{preview_mime};base64,{base64.b64encode(raw_bytes).decode()}"
    except Exception as exc:
        kind = "PDF" if is_pdf else "image"
        raise HTTPException(422, f"OCR failed to read this {kind}: {exc}")

    pipeline = _get_pipeline(model)
    question_text, answer_text = qa_segment.segment(pipeline.client, raw_text, language)

    return {
        "question_text": question_text, "answer_text": answer_text,
        "confidence": confidence,
        "preview_data_url": preview_data_url,
        "source_type": "pdf" if is_pdf else "image",
    }


class NewPaper(BaseModel):
    subject: str
    language: str                       # "en" | "ur"
    question_text: str
    max_marks: float
    ocr_text: str
    ocr_confidence: float = 0.95
    marking_scheme: Optional[str] = None
    official_answer_key: Optional[str] = None
    image_data_url: Optional[str] = None  # data:image/...;base64,... for preview


@app.post("/api/papers")
def submit_paper(paper: NewPaper, session: dict = Depends(require_admin)):
    """The step that is actually this module's own boundary: a freshly
    scanned/OCR'd answer arrives, gets an Anonymous UUID (never the real
    student identity), and enters the marking queue. Mirrors Scanning
    Management (6.2) handing off to AI Marking (6.3).

    Admin-only: uploading is Admin's job, not a Teacher's - a Teacher's
    queue only shows papers Admin has assigned to them (see
    /api/assign/{segment_id})."""
    if paper.language not in ("en", "ur"):
        raise HTTPException(400, "language must be 'en' or 'ur'")

    segment_id = f"LIVE-{uuid.uuid4().hex[:8].upper()}"
    anon_uuid = f"U-{uuid.uuid4().hex[:8].upper()}"
    row = {
        "segment_id": segment_id,
        "anon_uuid": anon_uuid,
        "exam_id": paper.subject,
        "question_id": paper.subject.replace(" ", "-")[:20] or "Q-LIVE",
        "language": paper.language,
        "max_marks": paper.max_marks,
        "question_text": paper.question_text,
        "marking_scheme": paper.marking_scheme,
        "official_answer_key": paper.official_answer_key,
        "ocr_text": paper.ocr_text,
        "ocr_confidence": paper.ocr_confidence,
        "image_path": paper.image_data_url or "",
        "human_mark": None,
        "source": "live",
        "assigned_to": None,
    }
    _live_papers.append(row)
    return row


@app.get("/api/teachers")
def list_teachers(session: dict = Depends(require_admin)):
    """Approved Teacher accounts, for Admin's assignment dropdown."""
    from demo.auth import _users  # local import: keep this admin-only listing out of the public auth API surface
    return [
        {"email": email, "name": u["name"]}
        for email, u in _users.items()
        if u["role"] == "Teacher" and u["status"] == "approved"
    ]


class AssignRequest(BaseModel):
    teacher_email: Optional[str] = None  # None to unassign


@app.post("/api/assign/{segment_id}")
def assign_paper(segment_id: str, req: AssignRequest, session: dict = Depends(require_admin)):
    row = next((r for r in _live_papers if r["segment_id"] == segment_id), None)
    if row is None:
        raise HTTPException(404, f"No such live paper: {segment_id}")
    row["assigned_to"] = req.teacher_email
    return row


class Decision(BaseModel):
    action: str          # "accept" | "adjust" | "flag"
    adjusted_total: Optional[float] = None
    ai_total: Optional[float] = None
    comment: Optional[str] = None


@app.get("/api/config")
def get_config():
    return {"discrepancy_threshold": config.DISCREPANCY_THRESHOLD}


@app.post("/api/decision/{segment_id}")
def record_decision(segment_id: str, decision: Decision,
                    session: dict = Depends(require_auth)):
    """UI-only: this is where a call to the Result Storage module's API
    would go. Not implemented here - that module is a teammate's part.

    Discrepancy detection (scope doc objective 4.1): if a teacher's
    adjustment differs from the AI's total by more than
    config.DISCREPANCY_THRESHOLD, this is flagged as requiring
    second-marking rather than silently accepted."""
    record = decision.model_dump()
    triggers_second_marking = (
        decision.action == "adjust"
        and decision.adjusted_total is not None
        and decision.ai_total is not None
        and abs(decision.adjusted_total - decision.ai_total) > config.DISCREPANCY_THRESHOLD
    )
    record["triggers_second_marking"] = triggers_second_marking
    _teacher_decisions[segment_id] = record
    return {"ok": True, "segment_id": segment_id, "decision": record}
