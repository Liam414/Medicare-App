# Application security posture, and the open data-handling findings

Detail behind CLAUDE.md, sections "Application security posture" and "Open data-handling findings".

## Application security posture (implemented)

What actually protects the data, and what each control does not cover. Read
this before touching auth, CORS, or how the server is served.

### The signing key is the whole of authentication

Every per-user filter in `app/api` — medications, reminders, appointments,
intake — trusts one thing: a bearer token signed with `JWT_SECRET_KEY`. A
weak or public key defeats all of them simultaneously, because a forged token
is indistinguishable from a real one.

`.env.example` used to publish a working default
(`dev-only-placeholder-secret-change-me`), and `config.py` used it as its
field default. That is not a secret — it is in every clone of this repository —
so anyone who had read the repo could mint a token for any user id and read
that person's health data.

- There is **no usable default** any more. `Settings` rejects a missing,
  short (<32 char) or placeholder key.
- Outside a development `ENVIRONMENT` this is a **refusal to boot**, not a
  warning. A health API that comes up with a published signing key is worse
  than one that does not come up, because nothing about it looks wrong from
  the outside.
- Inside development the key is **replaced with a random one per process**.
  Sessions stop surviving a restart, which is the correct trade: no running
  copy of this app anywhere accepts a token signed with a value in source
  control.

### Tokens

- **The algorithm is fixed at HS256 in code and is not configurable.** It used
  to be read from `JWT_ALGORITHM` in the environment. An algorithm anything
  else can influence is how algorithm-confusion and `alg: none` forgery start.
- `iss`, `aud`, `typ`, `exp` and `iat` are **verified**, not merely present, so
  a token minted for something else does not authenticate here. `jti` is
  recorded but not yet read — it is there so a revocation list can be added
  without invalidating every issued token.
- ⛔ **There is still no revocation.** `logout()` forgets the token on the
  device; a stolen one stays valid at the server until it expires (60 minutes
  by default). Session invalidation remains a Known Gap.
- **The library is PyJWT, and it was python-jose.** python-jose drags in
  `ecdsa`, which carries an unfixed Minerva timing advisory with no patched
  release to move to — the only way off it was to stop depending on it. It was
  never reachable here (HS256 only; no EC key is ever loaded), but the same
  library had already cost this file two CVE notes in a year, and "unreachable"
  is an argument you have to re-make at every audit. Same algorithm, same
  verified claims.
  - ⛔ **The two libraries spell claim requirements differently, and PyJWT
    ignores option keys it does not recognise.** jose's `require_exp` /
    `require_iat` / `require_sub` are one `"require": [...]` list in PyJWT.
    Carried over verbatim they would have read like they demanded those claims
    while demanding nothing — and a token with no `exp` and no expiry check is
    a token that never expires. It fails silently, so
    `test_a_token_missing_a_required_claim_is_rejected` pins each claim.
  - `strict_aud` is now on. Without it PyJWT accepts an `aud` **list** that
    merely contains ours, so a token minted for another service that also
    listed this one would authenticate here. Every token minted here has a
    string `aud`.

### The session survives a reload, and dies with the tab

The token used to live in a module variable and nowhere else, so a browser
refresh — the ordinary way this app is used, served to a phone over the LAN —
signed the user out mid-task. It is now also written to storage, and read back
once at startup by `restoreSession()` in `authService.ts`.

Where it is written is platform-split, the same shape as the scanner, the
notification service and location:

| | Store | Survives a reload | Survives the app or tab closing |
|---|---|---|---|
| `tokenStorage.ts` (iOS/Android) | Keychain / Keystore, `WHEN_UNLOCKED_THIS_DEVICE_ONLY` | yes | yes |
| `tokenStorage.web.ts` (browser) | `sessionStorage` | yes | **no** |

Rules for anyone extending this:

- ⛔ **Do not move the browser's copy to `localStorage`.** This is a bearer
  credential for one person's medications, appointments and symptom
  assessments, in an app with no revocation. `sessionStorage` ends with the
  tab, which is what should happen when someone walks away from a shared or
  borrowed computer, and it costs the user nothing: the token is only valid
  for an hour, so persisting it for longer mostly stores something the server
  will refuse anyway. Neither store is protected from script running on the
  page — the defence against that is the CSP, not the choice of store.
- On native the keystore entry is deliberately **this device only**, so a
  credential for health data is kept out of iCloud Keychain sync and encrypted
  device backups.
- **The navigator decides which screen to open on before it mounts.**
  `initialRouteName` is read once, and reading the store is asynchronous, so
  `RootNavigator` renders a spinner until `restoreSession()` answers.
  Rendering the sign-in screen first and redirecting afterwards would show a
  signed-in user a login form they never had to fill in.
- **Only the server decides whether a token is valid.** The client reads
  `exp` for one reason: not to restore a session it can already see is dead,
  which would land someone on the home screen and fail on their first tap. A
  token it cannot parse is restored and allowed to fail as a 401 — being
  unable to read a token is not evidence that it is bad.
- **A 401 clears the store**, in all three request paths (`apiClient`,
  `medicationService`, `intakeService`). A token the server has refused is
  worthless, and leaving it behind would restore a dead session on the next
  launch.
- **Sign out exists because the session now persists.** `HomeScreen` resets
  the navigation stack to `Login` rather than navigating, so the back gesture
  cannot walk into signed-in screens. It ends the session on the device only —
  there is no revocation, so the token stays valid at the server until it
  expires.
- `mobile/e2e/web-session-persistence.mjs` (`npm run e2e:web:session`) drives
  real Chrome through sign-in, two reloads, sign-out and an expired token. A
  reload in jsdom is a fresh module registry either way, so a fake store and a
  real one look identical there; this is the only place the behaviour is
  actually observed. It needs no backend — the sign-in call is stubbed.

### Sign-in

- Both `/auth/login` and `/auth/signup` spend from a per-address budget
  (`app/core/rate_limit.py`). Before this, an 8-character password could be
  guessed at network speed with only bcrypt's cost factor in the way.
- **Read that module's limits.** It is per process, in memory, keyed on the
  socket address, and deliberately does **not** trust `X-Forwarded-For` — a
  client can put anything in that header, so honouring it without a proxy you
  control would let an attacker reset their own counter every request. It is
  the floor under a reverse proxy or WAF, not a replacement for one.
- Login costs the **same work whether or not the account exists**
  (`verify_password_for_missing_user`). The identical error message was
  already there; without this the response *time* answered the question the
  message was written to avoid answering.
- ⛔ **Signup still discloses that an address is registered.** That is user
  enumeration, kept on purpose: without an email-verification flow, hiding it
  means telling someone their account was created when it was not. Closing it
  properly means adding verification, which is a feature decision.

### Symptom intake is deliberately NOT rate limited

A 429 on `POST /intake/assess` is a refusal to screen someone who may be
describing chest pain, and emergency guidance is the one thing this app must
never withhold. The cost exposure that argues for a limit is real, so the
limit belongs at a reverse proxy tuned by someone who has read the safety
architecture — not bolted onto the endpoint.

### CORS

`allow_origins=["*"]` is gone. Origins are an explicit allowlist
(`CORS_ALLOW_ORIGINS`), `allow_credentials` is off because the app
authenticates with a bearer token rather than a cookie, and `*` is refused
outright outside a development environment. In development only, any
loopback/private/LAN/mesh origin is also accepted, which is what keeps
`http://192.168.1.5:8081` working without editing `.env` on every network
change. That regex mirrors the client-side rule in
`mobile/src/services/baseUrl.ts` — **keep the two in step.**

### Response headers

Every response carries `nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: no-referrer`, a `default-src 'none'` CSP (skipped for the
docs pages, which are real HTML), and `Cache-Control: no-store`. The last one
is not boilerplate: the responses of this API are one person's medications,
appointments and symptom assessments, and a browser disk cache is a place
health data leaks from later. HSTS is sent only when the request already
arrived over TLS — pinning a host to https before a certificate exists locks
you out of your own dev server.

### The server is served over http by default, and that is a real exposure

Run over `http://192.168.x.x` — the way this app is used without an Apple
developer account — email, password and every symptom description cross the
LAN in the clear. `backend/scripts/generate_dev_cert.py` generates a
self-signed certificate with the machine's LAN addresses as SANs, and README
has the uvicorn and `serve` invocations for both halves.

**State the property precisely.** A self-signed certificate **encrypts but
does not authenticate**: traffic on the wire becomes unreadable, and nothing
proves the server is the one you meant, so it does not stop someone on the
network impersonating it. Real users need a CA-issued certificate against a
real hostname. The private key lives in `backend/certs/`, which is gitignored
along with `*.pem` and `*.key`.

### API docs

`/docs`, `/redoc` and `/openapi.json` are served only in a development
environment. An unauthenticated machine-readable map of every route and field
is free reconnaissance, and this API has no public consumers.


## Open data-handling findings

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



---

## Carried out of CLAUDE.md on 2026-09-19

*CLAUDE.md was still 90,636 characters after the first restructure — over the
limit, which means truncated, which means the fences at the bottom were not
reliably being read. The section below is that file's own text on this topic,
moved here verbatim. It may restate material already above it, because in
CLAUDE.md it was the summary of this document. Nothing was dropped; CLAUDE.md
now keeps the hard rules and points here.*

### Application security posture (implemented)


Full detail, including what each control does not cover and the nine closed
findings with their fixes: `docs/security-posture.md`.

⛔ **The signing key is the whole of authentication.** Every per-user filter
trusts one thing: a bearer token signed with `JWT_SECRET_KEY`, so a weak or
public key defeats all of them at once. `.env.example` once published a working
default, which is not a secret — it is in every clone. `Settings` now rejects a
missing, short (<32 char) or placeholder key. Outside development that is a
**refusal to boot**, not a warning, because a health API that comes up with a
published signing key looks fine from the outside. Inside development the key
is replaced with a random one per process. **No usable default may be
reintroduced.**

⛔ **The algorithm is fixed at HS256 in code and is not configurable.** It used
to be read from the environment, which is how algorithm-confusion and
`alg: none` forgery start. `iss`, `aud`, `typ`, `exp` and `iat` are *verified*,
not merely present, and `strict_aud` is on — without it PyJWT accepts an `aud`
list that merely contains ours. The library is PyJWT, deliberately not
python-jose (which dragged in `ecdsa` and its unfixed advisory). ⛔ **The two
libraries spell claim requirements differently and PyJWT ignores option keys it
does not recognise**, so jose-style `require_exp` would read like it demanded a
claim while demanding nothing — and a token with no `exp` never expires.
`test_a_token_missing_a_required_claim_is_rejected` pins each one.

⛔ **There is still no revocation.** `logout()` forgets the token on the device;
a stolen one stays valid at the server until it expires (60 minutes). `jti` is
minted so a denylist can be added without invalidating every issued token.

### ⛔ The session survives a reload, and dies with the tab

Native keeps the token in the Keychain/Keystore, `WHEN_UNLOCKED_THIS_DEVICE_ONLY`
so a credential for health data stays out of iCloud sync and encrypted backups.
The browser keeps it in `sessionStorage`.

- ⛔ **Do not move the browser's copy to `localStorage`.** This is a bearer
  credential for one person's medications, appointments and symptom assessments,
  in an app with no revocation. `sessionStorage` ends with the tab, which is what
  should happen when someone walks away from a shared computer, and it costs the
  user nothing: the token is only valid for an hour. Neither store is protected
  from script on the page — the defence against that is the CSP. (The emergency
  card's `localStorage` is the deliberate exception, argued above.)
- **The navigator decides which screen to open before it mounts.**
  `RootNavigator` renders a spinner until `restoreSession()` answers, rather
  than showing a signed-in user a login form they never had to fill in.
- **Only the server decides whether a token is valid.** The client reads `exp`
  for one reason — not to restore a session it can already see is dead — and a
  token it cannot parse is restored and allowed to fail as a 401.
- **A 401 clears the store**, in all three request paths.
- **Sign out resets the navigation stack** to `Login` rather than navigating, so
  the back gesture cannot walk into signed-in screens. It ends the session on
  the device only. ⛔ It deliberately does **not** clear the emergency card, and
  the screen says so.

### Sign-in, CORS, headers, transport

- Both `/auth/login` and `/auth/signup` spend from a per-address budget. ⛔ Read
  `app/core/rate_limit.py`'s limits before relying on it: per process, in
  memory, keyed on the socket address, and it deliberately does **not** trust
  `X-Forwarded-For` — honouring that without a proxy you control would let an
  attacker reset their own counter every request. It is the floor under a
  reverse proxy, not a replacement for one.
- Login costs the **same work whether or not the account exists**. The
  identical error message was already there; without this the response *time*
  answered the question that message was written to avoid answering.
- ⛔ **Signup still discloses that an address is registered.** Kept on purpose:
  without an email-verification flow, hiding it means telling someone their
  account was created when it was not.
- **CORS is an explicit allowlist** (`CORS_ALLOW_ORIGINS`), `allow_credentials`
  off because the app uses a bearer token rather than a cookie, and `*` refused
  outside development. The development-only loopback/LAN regex mirrors
  `mobile/src/services/baseUrl.ts` — ⛔ **keep the two in step.**
- Every response carries `nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`, a `default-src 'none'` CSP (skipped for the
  docs pages), and `Cache-Control: no-store` — the last is not boilerplate,
  because these responses are one person's health data and a browser disk cache
  is a place it leaks from later. HSTS is sent only when the request already
  arrived over TLS.
- `/docs`, `/redoc` and `/openapi.json` are development-only. An unauthenticated
  map of every route and field is free reconnaissance.
- ⛔ **Served over http on a LAN, credentials and every symptom description
  cross the network in the clear.** `scripts/generate_dev_cert.py` helps, but
  state the property precisely: a self-signed certificate **encrypts without
  authenticating** — it does not stop someone on the network impersonating the
  server. Real users need a CA-issued certificate against a real hostname.



---

## Carried out of CLAUDE.md on 2026-09-19

*CLAUDE.md was still 90,636 characters after the first restructure — over the
limit, which means truncated, which means the fences at the bottom were not
reliably being read. The section below is that file's own text on this topic,
moved here verbatim. It may restate material already above it, because in
CLAUDE.md it was the summary of this document. Nothing was dropped; CLAUDE.md
now keeps the hard rules and points here.*

### Open data-handling findings


Nine are closed with tests, listed with their fixes in `docs/security-posture.md`.
⛔ **Re-run `pip-audit` and `npm audit` rather than trusting a paragraph** —
advisory counts are a snapshot.

**Still open — each needs a call before the app holds real user data:**

1. **The app connects to Postgres as the `postgres` superuser**, with the
   password in plain text on disk. Create a least-privilege role owning only the
   app's tables. Transport is forced (`sslmode=require` outside development);
   the *identity* the app connects as is unchanged.
2. **Nothing is encrypted at rest.** `medications`, `intake_assessments`,
   `medication_reminders`, `appointments.reason_for_visit`, the goals tables,
   and the emergency card in a browser's `localStorage`. **This is the largest
   remaining gap** and is not fixable with application code alone.
3. **The dev database holds a real email address.** Either treat that database
   as containing real PII or clear it.
4. **No token revocation and no refresh flow.** The token is also at rest on the
   device between page loads, so a compromised device yields a live session as
   well as a live process.
5. **Signup discloses whether an address is registered.** Kept deliberately.
6. **The rate limiter is per-process and in-memory.** Two workers mean two
   budgets. Put a real limiter at a reverse proxy.
7. **Nothing writes an access log or an audit trail of reads.** No record of who
   read which record — normally a requirement wherever the BAA question is asked.
8. **The mobile build tree has 6 known-vulnerable dev dependencies**, down from
   43 via `overrides` in `mobile/package.json`. The remainder is one chain
   ending at `image-size`, which **has no fixed release at all** — every
   published version sits inside the advisory range — and clears only with the
   React Native upgrade. ⛔ The overrides are verified against `npm test` and
   `expo export --platform web` **only**; anyone doing a native build should
   expect to re-check them against `expo prebuild` and EAS.
9. **A dev-only classification log exists** (`triage_log.py`, flag
   `TRIAGE_LOG_CLASSIFICATIONS`). It writes descriptions and follow-up answers
   to the application log, which this file otherwise forbids. Off by default,
   and it refuses to run when `ENVIRONMENT=production`. ⛔ It is for **synthetic
   input only** — switching it on anywhere a real user has typed into the app
   would be a reportable data-handling failure, and the production check guards
   one environment name, not you.

⛔ **None of this makes the app safe to put in front of real patients.** The
release blockers — clinical sign-off on the triage instrument, legal sign-off on
medical-device status, a BAA with every vendor, encryption at rest — are
unchanged by any of these fixes. What changed is that the app is no longer
trivially breakable by someone who has read its source or joined its Wi-Fi.

