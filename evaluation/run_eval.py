"""
Run the pipeline over the gold set and print the results table.

    py -m evaluation.run_eval                 # stub model, offline
    py -m evaluation.run_eval --ablation      # with/without each agent

Once Phase 0 is decided, swap StubLLM for OpenAICompatibleClient and the
numbers become real.
"""

import argparse
import json
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from schemas import AnswerSegment
from llm.client import StubLLM, OpenAICompatibleClient
from pipeline import MarkingPipeline
from evaluation.metrics import report

DEFAULT_BASE_URL = "http://localhost:11434/v1"

GOLD_PATH = os.path.join(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__))), "data", "gold_set.jsonl")


def load_gold(path=GOLD_PATH):
    rows = []
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line and not line.startswith("//"):
                rows.append(json.loads(line))
    return rows


def run(pipeline, rows):
    """Returns {language: (ai_marks, human_marks)} plus routing counts."""
    by_lang = defaultdict(lambda: ([], []))
    statuses = defaultdict(int)
    for row in rows:
        segment = AnswerSegment(
            segment_id=row["segment_id"], anon_uuid=row["anon_uuid"],
            exam_id=row["exam_id"], question_id=row["question_id"],
            language=row["language"], max_marks=row["max_marks"],
            ocr_text=row["ocr_text"], ocr_confidence=row["ocr_confidence"],
            image_path=row.get("image_path", ""))
        result = pipeline.mark(
            segment,
            marking_scheme_text=row.get("marking_scheme"),
            official_answer_key=row.get("official_answer_key"),
            question_text=row.get("question_text", ""))
        statuses[result.status] += 1
        ai_list, human_list = by_lang[row["language"]]
        ai_list.append(result.total_awarded)
        human_list.append(row["human_mark"])
    return by_lang, statuses


def print_table(title, by_lang, statuses):
    print(f"\n=== {title} ===")
    all_ai, all_human = [], []
    for lang, (ai, human) in sorted(by_lang.items()):
        all_ai += ai
        all_human += human
        print(f"  {lang}: {report(ai, human)}")
    if len(by_lang) > 1:
        print(f"  ALL: {report(all_ai, all_human)}")
    print(f"  routing: {dict(statuses)}")


def make_client(args):
    if args.model:
        return OpenAICompatibleClient(model_id=args.model, base_url=args.base_url)
    return StubLLM()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--ablation", action="store_true")
    parser.add_argument("--model", default=None,
                        help="Model id to use via OpenAICompatibleClient "
                             "(e.g. qwen2.5:7b-instruct). Omit to use StubLLM.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL,
                        help=f"OpenAI-compatible base URL (default: {DEFAULT_BASE_URL}).")
    args = parser.parse_args()

    rows = load_gold()
    print(f"Loaded {len(rows)} gold answers.")

    if not args.ablation:
        pipeline = MarkingPipeline(make_client(args), use_critic=True)
        print_table("full pipeline", *run(pipeline, rows))
        return

    # The ablation table that goes straight into your report.
    configs = [
        ("baseline (1 run, no critic)", dict(use_critic=False, self_consistency_runs=1)),
        ("+ self-consistency",          dict(use_critic=False, self_consistency_runs=3)),
        ("+ critic (full)",             dict(use_critic=True,  self_consistency_runs=3)),
    ]
    for name, kwargs in configs:
        pipeline = MarkingPipeline(make_client(args), **kwargs)
        print_table(name, *run(pipeline, rows))


if __name__ == "__main__":
    main()