"""
Ad-hoc sanity check: does qwen2.5:7b-instruct mark the same conceptual
question consistently in English vs. Urdu, when asked for per-criterion
marks instead of a single total?

Not part of the pipeline - a standalone probe against Ollama, same spirit
as scripts/urdu_check.py. Requires `ollama pull qwen2.5:7b-instruct` and
the Ollama server running locally.

Run with: py -m scripts.compare_langs
"""

import json
import os
import sys
import time

from llm.client import OpenAICompatibleClient, extract_json

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

MODEL_ID = "qwen2.5:7b-instruct"
BASE_URL = "http://localhost:11434/v1"

JSON_SCHEMA_NOTE = (
    'Reply with JSON only, no prose, no code fences, using exactly this '
    'schema (do not include a total): '
    '{"criteria":[{"criterion_id":"definition","max_marks":2.0,'
    '"awarded":<number>,"justification":"..."},'
    '{"criterion_id":"benefit_1","max_marks":1.5,"awarded":<number>,'
    '"justification":"..."},'
    '{"criterion_id":"benefit_2","max_marks":1.5,"awarded":<number>,'
    '"justification":"..."}]}'
)

CASES = {
    "English": dict(
        system=(
            "You are an experienced examiner marking computer science exam "
            "answers. Assess the student's answer strictly against the "
            "marking scheme. " + JSON_SCHEMA_NOTE
        ),
        question="Define a computer network and state two benefits of using one.",
        marking_scheme="2 marks for a correct definition, 1.5 marks per correct benefit.",
        answer=(
            "A computer network is a group of computers that are connected "
            "to each other and can exchange data. Its benefits are that "
            "resources can be shared and information can be sent quickly."
        ),
    ),
    "Urdu": dict(
        system=(
            "آپ ایک تجربہ کار ممتحن ہیں جو کمپیوٹر سائنس کے امتحانی پرچوں "
            "کی جانچ کرتے ہیں۔ سوال اور مارکنگ اسکیم کی روشنی میں طالب علم "
            "کے جواب کا جائزہ لیں۔ " + JSON_SCHEMA_NOTE +
            " justification اردو میں لکھیں، لیکن criterion_id انگریزی میں "
            "بالکل اسی طرح رکھیں جیسے schema میں دیا گیا ہے۔"
        ),
        question="کمپیوٹر نیٹ ورک کی تعریف کریں اور اس کے دو فائدے بیان کریں۔",
        marking_scheme="2 marks for a correct definition, 1.5 marks per correct benefit.",
        answer=(
            "کمپیوٹر نیٹ ورک ایسے کمپیوٹرز کا مجموعہ ہے جو آپس میں جڑے "
            "ہوتے ہیں اور ڈیٹا کا تبادلہ کرتے ہیں۔ اس کے فائدے یہ ہیں کہ "
            "وسائل کا اشتراک ہو سکتا ہے اور معلومات تیزی سے بھیجی جا سکتی ہیں۔"
        ),
    ),
}

OUTPUT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                          "compare_output.md")


def run_case(client, name, case):
    user = (f"Question: {case['question']}\n\n"
            f"Marking scheme: {case['marking_scheme']}\n\n"
            f"Student answer: {case['answer']}")

    start = time.perf_counter()
    raw = client.complete(case["system"], user, temperature=0.0)
    elapsed = time.perf_counter() - start

    try:
        parsed = extract_json(raw)
        error = None
    except ValueError as exc:
        parsed = None
        error = str(exc)

    return dict(name=name, case=case, raw=raw, parsed=parsed,
                error=error, elapsed=elapsed)


def render(result):
    lines = [f"## {result['name']}", ""]
    lines.append(f"**Question:** {result['case']['question']}")
    lines.append("")
    lines.append(f"**Marking scheme:** {result['case']['marking_scheme']}")
    lines.append("")
    lines.append(f"**Student answer:** {result['case']['answer']}")
    lines.append("")
    lines.append(f"**Time:** {result['elapsed']:.2f}s")
    lines.append("")
    if result["error"]:
        lines.append(f"**JSON parse error:** {result['error']}")
        lines.append("")
        lines.append("**Raw reply:**")
        lines.append("```")
        lines.append(result["raw"])
        lines.append("```")
    else:
        lines.append("**Parsed per-criterion marks:**")
        lines.append("")
        lines.append("```json")
        lines.append(json.dumps(result["parsed"], ensure_ascii=False, indent=2))
        lines.append("```")
        total = sum(c.get("awarded", 0) for c in result["parsed"].get("criteria", []))
        max_total = sum(c.get("max_marks", 0) for c in result["parsed"].get("criteria", []))
        lines.append("")
        lines.append(f"**Sum of awarded marks:** {total:g} / {max_total:g}")
    lines.append("")
    return "\n".join(lines)


def main():
    client = OpenAICompatibleClient(model_id=MODEL_ID, base_url=BASE_URL)

    results = [run_case(client, name, case) for name, case in CASES.items()]

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        f.write("# English vs. Urdu marking comparison - "
                f"{MODEL_ID}\n\n")
        f.write("Same conceptual question (computer networks), marked "
                "independently in each language, asking for per-criterion "
                "marks rather than a single total.\n\n")
        for result in results:
            f.write(render(result))

    print(f"Wrote comparison to {OUTPUT_PATH}")
    for result in results:
        status = "parsed OK" if not result["error"] else f"PARSE ERROR: {result['error']}"
        print(f"  {result['name']}: {result['elapsed']:.2f}s - {status}")


if __name__ == "__main__":
    main()
