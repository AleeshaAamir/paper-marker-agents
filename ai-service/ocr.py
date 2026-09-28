"""
Demo-only OCR using Tesseract, wired in purely so this demo can show the
real image -> text -> UUID -> AI marking flow end to end.

This is NOT the real Scanning/OCR module - that is a teammate's part per
CLAUDE.md, and the real system may use a different, handwriting-tuned
engine. Tesseract is built for printed text, not handwriting: expect low
confidence or garbled output on genuine handwritten answers. That is not
a bug to hide - it is exactly the case config.OCR_CONFIDENCE_FLOOR exists
to catch, so a badly-recognised photo should route to manual review
rather than being marked with confidence it doesn't deserve.
"""

import io
import os
from typing import Tuple

import pytesseract
from pypdf import PdfReader
from PIL import Image

LANG_MAP = {"en": "eng", "ur": "urd"}

_CANDIDATE_PATHS = [
    r"C:\Users\malik\AppData\Local\Programs\Tesseract-OCR\tesseract.exe",
    r"C:\Program Files\Tesseract-OCR\tesseract.exe",
    r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
]
for _path in _CANDIDATE_PATHS:
    if os.path.exists(_path):
        pytesseract.pytesseract.tesseract_cmd = _path
        break


def run_ocr(image_bytes: bytes, language: str) -> Tuple[str, float]:
    """Returns (extracted_text, mean_word_confidence 0-1)."""
    image = Image.open(io.BytesIO(image_bytes))
    if image.mode not in ("L", "RGB"):
        image = image.convert("RGB")

    lang = LANG_MAP.get(language, "eng")
    data = pytesseract.image_to_data(image, lang=lang,
                                     output_type=pytesseract.Output.DICT)

    words, confidences = [], []
    for word, conf in zip(data["text"], data["conf"]):
        word = word.strip()
        if not word:
            continue
        words.append(word)
        conf = float(conf)
        if conf >= 0:      # Tesseract uses -1 for boxes with no confidence
            confidences.append(conf)

    text = " ".join(words)
    mean_confidence = (sum(confidences) / len(confidences) / 100.0
                       if confidences else 0.0)
    return text, round(mean_confidence, 3)


def extract_pdf_text(pdf_bytes: bytes) -> Tuple[str, float]:
    """Returns (extracted_text, confidence) for a PDF's text layer.

    Not OCR: pulls text directly out of the PDF's own internal text layer,
    which only exists for a digitally-produced PDF (typed answer exported
    to PDF), not for a PDF that is just a photo/scan with no text layer.
    That is a real, honest limitation - a scanned-image PDF has nothing to
    extract here and must be uploaded as a JPG/PNG photo instead, where
    Tesseract OCR (run_ocr, above) can actually read the pixels.

    All pages are concatenated (unlike the single-page limit that an
    image-rendering approach would need)."""
    reader = PdfReader(io.BytesIO(pdf_bytes))
    if len(reader.pages) == 0:
        raise ValueError("PDF has no pages.")

    pages_text = [page.extract_text() or "" for page in reader.pages]
    text = "\n".join(t.strip() for t in pages_text if t.strip())

    if not text.strip():
        raise ValueError(
            "No text layer found in this PDF - it looks like a scanned "
            "image with no embedded text. Upload it as a JPG/PNG photo "
            "instead so OCR can read it.")

    # Not OCR, so there is no per-word recognition confidence to report -
    # text pulled straight from the PDF's own text layer is exact.
    return text, 0.99
