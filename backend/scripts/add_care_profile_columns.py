"""
Add `profile_id` to the three tables care profiles scope.

Same gap as `add_medication_supply_columns.py`: Alembic is not wired up and
`create_all` never alters an existing table. `create_missing_tables.py` makes
`care_profiles` itself; this adds the pointer columns to `medications`,
`intake_assessments` and `appointments`, or those endpoints return 500s.

Every column is nullable with no default, and NULL means "the account holder",
so no existing row changes owner. Idempotent. Run from `backend/`, after
`create_missing_tables.py` (the foreign key needs the table):

    python scripts/add_care_profile_columns.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.db.session import engine  # noqa: E402

STATEMENTS = tuple(
    f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS profile_id VARCHAR "
    f"REFERENCES care_profiles(id)"
    for table in ("medications", "intake_assessments", "appointments")
) + tuple(
    f"CREATE INDEX IF NOT EXISTS ix_{table}_profile_id ON {table} (profile_id)"
    for table in ("medications", "intake_assessments", "appointments")
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
