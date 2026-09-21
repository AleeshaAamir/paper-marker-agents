"""
Data contracts for the AI marking pipeline.

These are the ONLY structures that cross module boundaries.
  - AnswerSegment  : what the Scanning/OCR module (teammate 1) hands to us.
  - Evaluation     : what we hand to the Storage module (teammate 2).

Agree these with your teammates BEFORE writing more code. Changing a
contract in April costs a week; changing it now costs five minutes.

No third-party dependencies on purpose - runs on a bare Python 3.10+.
"""

from dataclasses import dataclass, field, asdict
from typing import List
import json

# --- INPUT CONTRACT: Scanning/OCR module -> Agent module -------------------


@dataclass
class AnswerSegment:
    """One student's answer to one question, after OCR."""
    segment_id: str          # unique id for this answer segment
    anon_uuid: str           # anonymised student id - we never see the real one
    exam_id: str
    question_id: str
    language: str            # "ur" | "en"
    max_marks: float
    ocr_text: str            # the recognised handwriting
    ocr_confidence: float    # 0.0 - 1.0, mean character/word confidence
    image_path: str          # FTP path, for the teacher's side-by-side view
    page_refs: List[int] = field(default_factory=list)


# --- RUBRIC STRUCTURES (produced by the Rubric Agent) ---------------------


@dataclass
class RubricCriterion:
    criterion_id: str
    description: str             # what earns these marks
    marks: float                 # marks available for this criterion
    keywords: List[str] = field(default_factory=list)
    acceptable_variants: List[str] = field(default_factory=list)


@dataclass
class Rubric:
    question_id: str
    question_text: str
    max_marks: float
    language: str
    criteria: List[RubricCriterion]
    source: str                  # "official_scheme" | "generated"


# --- MODEL ANSWER (produced by the Solution Agent) ------------------------


@dataclass
class ModelAnswer:
    question_id: str
    answer_text: str
    acceptable_variants: List[str] = field(default_factory=list)
    common_errors: List[str] = field(default_factory=list)
    source: str = "generated"    # "official_key" | "generated"


# --- OUTPUT CONTRACT: Agent module -> Storage module ----------------------


@dataclass
class CriterionScore:
    criterion_id: str
    awarded: float
    max_marks: float
    evidence_span: str      # the EXACT student text that earned this. If the
                            # agent cannot quote it, it is hallucinating.
    justification: str
    confidence: float


@dataclass
class Evaluation:
    segment_id: str
    question_id: str
    anon_uuid: str
    scores: List[CriterionScore]
    total_awarded: float
    max_marks: float
    overall_confidence: float
    status: str                  # see Status below
    flags: List[str] = field(default_factory=list)
    model_id: str = ""
    rubric_source: str = ""

    def to_json(self, indent: int = 2) -> str:
        return json.dumps(asdict(self), ensure_ascii=False, indent=indent)


class Status:
    """Status values handed to the storage layer."""
    AI_SCORED = "AI_SCORED"                      # normal: pending teacher review
    NEEDS_MANUAL_REVIEW = "NEEDS_MANUAL_REVIEW"  # low OCR/low confidence/injection
    UNREADABLE = "UNREADABLE"                    # OCR produced nothing usable


class Flag:
    LOW_OCR_CONFIDENCE = "LOW_OCR_CONFIDENCE"
    LOW_MODEL_CONFIDENCE = "LOW_MODEL_CONFIDENCE"
    INCONSISTENT_RUNS = "INCONSISTENT_RUNS"
    CRITIC_REJECTED = "CRITIC_REJECTED"
    PROMPT_INJECTION_SUSPECTED = "PROMPT_INJECTION_SUSPECTED"
    EMPTY_ANSWER = "EMPTY_ANSWER"
    URDU_LOW_RESOURCE = "URDU_LOW_RESOURCE"