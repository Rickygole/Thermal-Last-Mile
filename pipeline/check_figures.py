import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "out"
PROSE = ["README.md", "docs/narrative.md", "docs/validation.md", "docs/pitch.md"]

GROUPED = re.compile(r"\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b")
TOLERANCE = 0.005


def collect_numbers(obj, acc):
    if isinstance(obj, dict):
        for v in obj.values():
            collect_numbers(v, acc)
    elif isinstance(obj, list):
        for v in obj:
            collect_numbers(v, acc)
    elif isinstance(obj, bool):
        return
    elif isinstance(obj, (int, float)):
        acc.add(float(obj))


def pipeline_numbers():
    acc = set()
    for path in sorted(OUT.glob("*.json")):
        try:
            collect_numbers(json.loads(path.read_text()), acc)
        except Exception:
            continue
    derived = set()
    for v in acc:
        derived.add(v)
        derived.add(v / 60.0)
        derived.add(v * 60.0)
        derived.add(v * 100.0)
    return derived


def close_to_any(value, pool):
    for candidate in pool:
        if candidate == 0:
            if abs(value) < 1e-9:
                return True
            continue
        if abs(value - candidate) / abs(candidate) <= TOLERANCE:
            return True
    return False


def main():
    pool = pipeline_numbers()
    rounded = {round(v) for v in pool}
    problems = []
    for rel in PROSE:
        path = ROOT / rel
        if not path.exists():
            continue
        text = path.read_text()
        for raw in sorted(set(GROUPED.findall(text))):
            value = float(raw.replace(",", ""))
            if value < 1000:
                continue
            if round(value) in rounded or close_to_any(value, pool):
                continue
            problems.append((rel, raw))

    if not problems:
        print("all grouped figures in prose trace to a value in data/out")
        return 0

    print("figures in prose with no matching value in data/out:")
    for rel, raw in problems:
        print(f"  {rel}: {raw}")
    print()
    print(f"{len(problems)} unmatched. regenerate the prose or correct the figure.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
