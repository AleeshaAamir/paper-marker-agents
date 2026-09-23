"""
Ad-hoc sanity check: can a local Qwen2.5 model mark a Urdu answer sensibly?

Not part of the pipeline - a standalone probe against Ollama before wiring
a real LLMClient into MarkingPipeline. Requires `ollama pull qwen2.5:7b-instruct`
and the Ollama server running locally.

Run with: py -m scripts.urdu_check
"""

import os
import sys

from llm.client import OpenAICompatibleClient

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

QUESTION = "کمپیوٹر نیٹ ورک کی تعریف کریں اور اس کے دو فائدے بیان کریں۔"
MARKING_SCHEME = "2 marks for a correct definition, 1.5 marks per correct benefit."
STUDENT_ANSWER = (
    "کمپیوٹر نیٹ ورک ایسے کمپیوٹرز کا مجموعہ ہے جو آپس میں جڑے ہوتے ہیں "
    "اور ڈیٹا کا تبادلہ کرتے ہیں۔ اس کے فائدے یہ ہیں کہ وسائل کا اشتراک "
    "ہو سکتا ہے اور معلومات تیزی سے بھیجی جا سکتی ہیں۔"
)
MAX_MARKS = 5.0

SYSTEM = (
    "آپ ایک تجربہ کار ممتحن ہیں جو کمپیوٹر سائنس کے امتحانی پرچوں کی "
    "جانچ کرتے ہیں۔ سوال، مارکنگ اسکیم اور طالب علم کے جواب کا بغور "
    "جائزہ لیں اور صرف دیے گئے جواب کی بنیاد پر نمبر دیں۔"
)

USER = (
    f"سوال ({MAX_MARKS:g} نمبر): {QUESTION}\n\n"
    f"مارکنگ اسکیم: {MARKING_SCHEME}\n\n"
    f"طالب علم کا جواب: {STUDENT_ANSWER}\n\n"
    f"براہ کرم {MAX_MARKS:g} میں سے نمبر دیں اور اپنی وجوہات اردو میں "
    "تفصیل سے بیان کریں۔"
)

OUTPUT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                          "urdu_check_output.md")


def main():
    client = OpenAICompatibleClient(model_id="qwen2.5:7b-instruct",
                                     base_url="http://localhost:11434/v1")
    reply = client.complete(SYSTEM, USER, temperature=0.0)

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        f.write("# Urdu marking check - qwen2.5:7b-instruct\n\n")
        f.write("## Question\n\n" + QUESTION + "\n\n")
        f.write("## Marking scheme\n\n" + MARKING_SCHEME + "\n\n")
        f.write("## Student answer\n\n" + STUDENT_ANSWER + "\n\n")
        f.write("## Model reply\n\n" + reply + "\n")

    print(f"Wrote model reply to {OUTPUT_PATH}")
    print("\n--- model reply ---\n")
    print(reply)


if __name__ == "__main__":
    main()
