"""
Score the rule layer on the two 2026-09-22 probe sets. See heldout.py.

    cd backend
    python scripts/triage_eval/measure_heldout.py        # misses in TUNING
    python scripts/triage_eval/measure_heldout.py -v     # misses in both

⛔ Printing HELDOUT's misses is for reporting, not for fixing. Read heldout.py.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.core.rules_triage import classify  # noqa: E402

_spec = importlib.util.spec_from_file_location(
    "triage_eval_heldout", Path(__file__).with_name("heldout.py")
)
heldout = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
sys.modules[_spec.name] = heldout
_spec.loader.exec_module(heldout)

RANK = {"SELF_CARE": 0, "URGENT": 1, "EMERGENT": 2}


def score(cases: list) -> dict:
    """Headline figures, plus every case that did not return its gold tier."""
    misses = []
    exact = under = over = emergent = caught = 0
    for case in cases:
        got = classify(case.description).tier_name
        exact += got == case.gold
        under += RANK[got] < RANK[case.gold]
        over += RANK[got] > RANK[case.gold]
        if case.gold == "EMERGENT":
            emergent += 1
            caught += got == "EMERGENT"
        if got != case.gold:
            misses.append((case.gold, got, case.description))
    return {
        "n": len(cases), "exact": exact, "under": under, "over": over,
        "emergent": emergent, "caught": caught, "misses": misses,
    }


def main() -> None:
    verbose = "-v" in sys.argv
    for name in ("TUNING", "HELDOUT"):
        r = score(getattr(heldout, name))
        print(
            f"{name:8} n={r['n']}  exact {r['exact'] / r['n']:.0%}  "
            f"under {r['under']}  over {r['over']}  "
            f"safety of advice {r['caught']}/{r['emergent']} "
            f"({r['caught'] / r['emergent']:.0%})"
        )
        if verbose or name == "TUNING":
            for gold, got, text in r["misses"]:
                print(f"    gold={gold:9} got={got:9} {text}")


if __name__ == "__main__":
    main()
