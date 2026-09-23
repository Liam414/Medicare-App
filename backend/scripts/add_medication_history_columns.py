"""
Add `started_on` and `stopped_on` to an existing `medications` table.

Same gap and same shape as `add_medication_supply_columns.py`: tables come
from `create_all`, which never alters an existing table, so a database created
before medication history needs this once or `/medications` returns 500s. The
new `medication_doses` and `medication_changes` tables are new, so
`create_missing_tables.py` makes those.

Both columns are nullable with no default, so no existing row changes.
Idempotent. Run from `backend/`:

    python scripts/add_medication_history_columns.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.db.session import engine  # noqa: E402

STATEMENTS = (
    "ALTER TABLE medications ADD COLUMN IF NOT EXISTS started_on DATE",
    "ALTER TABLE medications ADD COLUMN IF NOT EXISTS stopped_on DATE",
)


def main() -> int:
    print(f"Database: {settings.database_url.rsplit('@', 1)[-1]}")
    with engine.begin() as connection:
        for statement in STATEMENTS:
            connection.execute(text(statement))
            print(f"  ok: {statement.split('IF NOT EXISTS ')[-1]}")
    print("\nDone. Columns are present.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
