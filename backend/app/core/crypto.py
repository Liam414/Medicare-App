"""
Column-level encryption for health data at rest.

`EncryptedJSON` is a SQLAlchemy column type: the value is serialised to JSON
and sealed with Fernet (AES-128-CBC + HMAC-SHA256) before it reaches the
database, and opened on the way out. A database dump, a backup, or a read
replica therefore holds ciphertext for these columns.

What this does not cover, stated so nobody over-reads it: the key lives in
the API's environment, so anyone who controls the running API can read the
data; and only columns declared with this type are encrypted. The older
tables (medications, intake, appointments, goals) are still plaintext —
open finding 2 in CLAUDE.md.

⛔ A value that will not decrypt RAISES. It never comes back empty: an empty
allergy list on a screen reads as "no allergies", which is worse than an error.
"""

from __future__ import annotations

import base64
import hashlib
import json
import secrets
from functools import lru_cache
from pathlib import Path
from typing import Any

from cryptography.fernet import Fernet
from sqlalchemy import Text
from sqlalchemy.types import TypeDecorator

from app.core.config import settings

DEV_KEY_FILE = Path(__file__).resolve().parents[2] / "data_encryption.key"


@lru_cache(maxsize=1)
def fernet() -> Fernet:
    secret = settings.data_encryption_key.strip()
    if not secret:
        # Only reachable in development: `Settings` refuses to boot otherwise.
        if not DEV_KEY_FILE.exists():
            DEV_KEY_FILE.write_text(secrets.token_hex(32))
        secret = DEV_KEY_FILE.read_text().strip()
    # The secret is operator-generated and high-entropy (>= 32 chars is
    # enforced), so a single SHA-256 is a sound derivation; no password
    # stretching is needed. It lets any generated secret serve, including
    # Render's `generateValue`, which is not in Fernet's key format.
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(secret.encode()).digest()))


class EncryptedJSON(TypeDecorator):
    impl = Text
    cache_ok = True

    def process_bind_param(self, value: Any, dialect: Any) -> str | None:
        if value is None:
            return None
        return fernet().encrypt(json.dumps(value).encode()).decode()

    def process_result_value(self, value: str | None, dialect: Any) -> Any:
        if value is None:
            return None
        return json.loads(fernet().decrypt(value.encode()))
