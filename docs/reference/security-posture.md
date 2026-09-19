# Application security posture (implemented)

*Moved out of `CLAUDE.md` on 2026-09-19, verbatim, to bring that file back under its size limit. Nothing here was rewritten or dropped. `CLAUDE.md` keeps the rules a reader must not miss and points here for the reasoning.*


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

