# Open data-handling findings

*Moved out of `CLAUDE.md` on 2026-09-19, verbatim, to bring that file back under its size limit. Nothing here was rewritten or dropped. `CLAUDE.md` keeps the rules a reader must not miss and points here for the reasoning.*


### Closed (fixed, with tests)

1. ~~**Passwords are echoed in 422 responses.**~~ The
   `RequestValidationError` handler in `app/main.py` strips `input` from every
   validation error, so a rejected password or symptom string is not returned.
2. ~~**`GET /medications/reminders` is unscoped.**~~ Reminders were rewritten
   in `app/api/reminders.py` scoped to the caller from the outset, with a test
   that a second user cannot see the first user's rows.
3. ~~**`decode_access_token` is never called.**~~ `get_current_user` in
   `app/core/dependencies.py` guards every route that touches user data, and a
   validly-signed token for a deleted account does not authenticate.
4. ~~**CORS is `allow_origins=["*"]`.**~~ Explicit allowlist, credentials off,
   wildcard refused outside development. See "CORS" above.
5. ~~**A 500 traceback writes the symptom description to the log.**~~ Fixed at
   the source rather than per-route: `app/db/session.py` creates the engine
   with `hide_parameters=True`, so SQLAlchemy no longer puts bound values into
   its own exception text. This is the load-bearing fix — Starlette re-raises
   server errors so uvicorn can log them, so an exception handler alone would
   not have stopped it. `app/main.py` also returns one fixed sentence for any
   unhandled failure, so nothing crosses the wire either.
6. ~~**The signing key is the published placeholder.**~~ See "The signing key
   is the whole of authentication" above.
7. ~~**The deployed API ran on dependencies with 18 known advisories.**~~
   `pip-audit` now reports none. The reachable ones were in code that runs
   *before* a route is chosen, so they were exposed to anyone who could reach
   the API: nine against `starlette` 0.38.6 (Host-header and request-path
   injection into `request.url` reconstruction, unbounded multipart buffering,
   `form()` limits being ignored) and seven against `python-multipart` 0.0.9
   (parsing denial of service, field-separator confusion). Closing the
   starlette ones needed `fastapi` to move first — 0.115.0 held starlette below
   0.39, and every fix lands in 1.x — so the pinned pair is now
   `fastapi==0.141.1` with `starlette>=1.3.1,<1.7`, verified against the whole
   backend suite. `pytest` moved to 9.0.3 for a predictable-tmpdir advisory
   that only ever affected developer machines. The last one, `ecdsa`, had no
   fix to move to and was removed with the library that pulled it in — see
   "Tokens".

   **Re-run `pip-audit` rather than trusting this paragraph.** Advisory counts
   are a snapshot; this one is from 2026-09-06.

### Still open — each needs a call before the app holds real user data

1. **The app connects to Postgres as the `postgres` superuser**, using a
   password stored in `backend/.env` (gitignored, but plain text on disk).
   Create a least-privilege role owning only the app's tables before this runs
   anywhere but a dev machine. Transport to the database is now forced —
   `sslmode=require` is appended to a Postgres URL that does not specify TLS
   whenever `ENVIRONMENT` is not a development one — but the *identity* the app
   connects as is unchanged.
2. **Nothing is encrypted at rest.** `medications`, `intake_assessments`,
   `medication_reminders` and `appointments.reason_for_visit` hold health data
   in plaintext columns. This is the largest remaining gap and is not fixable
   with application code alone — it needs a column-encryption or
   encrypted-storage decision.
3. **The dev database holds a real email address** entered through the sign-up
   UI. CLAUDE.md requires synthetic-only dev data; either treat this database
   as containing real PII or clear it.
4. **There is no token revocation and no refresh flow.** A stolen access token
   is valid until it expires. `jti` is minted so a denylist can be added.
   The token is now also at rest on the device between page loads — in the
   platform keystore on native, in `sessionStorage` in a browser — so a
   compromised device yields a live session as well as a live process. See
   "The session survives a reload, and dies with the tab".
5. **Signup discloses whether an address is registered.** Kept deliberately;
   closing it means adding email verification. See "Sign-in" above.
6. **The rate limiter is per-process and in-memory.** Two uvicorn workers mean
   two budgets. Put a real limiter at a reverse proxy before this is reachable
   by anyone untrusted.
7. **Nothing writes an access log or an audit trail of reads.** There is no
   record of who read which record, which is normally a requirement wherever
   the BAA question above is being asked.
8. **The mobile build tree has known-vulnerable dev dependencies**, via Expo
   51's CLI and React Native 0.74's. `npm audit` reported 43; it now reports 6,
   after `overrides` in `mobile/package.json` pinned the patched transitive
   versions of `tar`, `postcss`, `ajv`, `send`, `uuid`, `fast-xml-parser`,
   `@xmldom/xmldom` and `decode-uri-component`.

   ⛔ **This finding used to say "none ships in the app bundle". That was
   wrong**, and the correction is the reason the overrides exist rather than
   being deferred with the rest. `decode-uri-component` is reached at runtime
   through `query-string` ← `@react-navigation/core`, and its code was verified
   present in the exported web bundle by grepping for the library's own
   regexes. Its advisory is a denial of service via exponential decoding of
   malformed percent-encoded input — reachable from a crafted URL, so it was a
   real property of the deployed site, not of the build machine. The patched
   0.5.0 replaces that with a single left-to-right scan; the old matcher is
   gone from the bundle and the new one is in, both checked by grep.

   The remaining 6 are one chain: `image-size` ← `metro` ← `metro-config` /
   `metro-transform-worker` ← `@react-native/community-cli-plugin` ←
   `react-native`. **`image-size` has no fixed release at all** — every
   published version including the latest (2.0.2) sits inside the advisory's
   vulnerable range, so there is nothing to pin. It is Metro's, used at build
   time, and clears only with the React Native upgrade.

   Everything still deferred here is genuinely build tooling — Expo CLI, Metro,
   the native-prebuild tooling, the dev static server — so the risk is to the
   machine that builds, not to a user's data. The real fix remains an Expo
   major upgrade, still to be scheduled rather than forced; the overrides are a
   stopgap and are commented as one.

   ⛔ **The overrides are verified against `npm test` and
   `expo export --platform web` only.** Neither exercises `expo prebuild` or an
   EAS native build, which is where forcing majors into `@expo/plist`, `xcode`
   and the RN CLI would surface first. Anyone doing a native build should
   expect to re-check them there.
9. **A dev-only classification log exists** (`backend/app/core/triage_log.py`,
   flag `TRIAGE_LOG_CLASSIFICATIONS`). It writes the description and the
   follow-up answers to the application log, which CLAUDE.md otherwise
   forbids. It is off by default and refuses to run when
   `ENVIRONMENT=production`, regardless of the flag. It exists to tune the
   classifier against **synthetic input only**. Switching it on anywhere a
   real user has typed into the app would be a reportable data-handling
   failure — and the production check guards one environment name, not you.

⛔ **None of this makes the app safe to put in front of real patients.** The
release blockers above it — clinical sign-off on the triage instrument, legal
sign-off on medical-device status, a BAA with every vendor, encryption at rest
— are unchanged by any of these fixes. What changed is that the app is no
longer trivially breakable by someone who has read its source or joined its
Wi-Fi.

