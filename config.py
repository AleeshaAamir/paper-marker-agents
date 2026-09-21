"""Tunable thresholds. Every one of these is a number you must justify in
your FYP report - so record WHY you picked it when you tune it."""

# Below this OCR confidence we do not let the AI mark at all.
OCR_CONFIDENCE_FLOOR = 0.60

# Below this model confidence, route to a human even if the AI produced marks.
MODEL_CONFIDENCE_FLOOR = 0.70

# Self-consistency: run the evaluation N times; if the spread of total marks
# exceeds SELF_CONSISTENCY_TOLERANCE (in marks), flag as inconsistent.
SELF_CONSISTENCY_RUNS = 3
SELF_CONSISTENCY_TOLERANCE = 1.0

# Urdu gets a stricter floor because handwriting recognition and LLM
# competence are both weaker. Measure this, then adjust.
OCR_CONFIDENCE_FLOOR_BY_LANG = {"en": 0.60, "ur": 0.70}

# Answers shorter than this (characters) are treated as blank/unreadable.
MIN_ANSWER_CHARS = 3

LLM_TEMPERATURE = 0.0