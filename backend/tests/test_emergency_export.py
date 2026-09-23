"""
The phone screens with an exported copy of emergency.py. It must be current.

A phrase added to `emergency.py` without re-running
`scripts/export_emergency_rules.py` would leave phones offline screening with
the old list — invisibly, since the server path would still be right. So a
stale export is a failing suite. Fix it by running the script, never by
editing the JSON.
"""

import importlib.util
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "export_emergency_rules.py"


def _export():
    spec = importlib.util.spec_from_file_location("export_emergency_rules", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_the_phones_copy_of_the_red_flag_rules_is_current():
    export = _export()
    on_disk = export.OUTPUT.read_text(encoding="utf-8")
    assert on_disk == export.render(), (
        "mobile/src/generated/emergencyRules.json is stale: run "
        "`python scripts/export_emergency_rules.py` from backend/"
    )


def test_the_phones_large_parity_fixture_is_current():
    export = _export()
    assert export.LARGE_FIXTURE.read_text(encoding="utf-8") == export.render_large()


def test_the_export_carries_the_reviewed_copy_verbatim():
    # ⛔ The phone may not word an emergency instruction itself.
    from app.core import emergency

    export = _export()
    exported = {r["category"]: (r["headline"], r["action"]) for r in export.build()["rules"]}
    assert exported == {c: (h, a) for c, h, a, _ in emergency._EMERGENCY_RULES}
