# Public deployment (implemented)

*Moved out of `CLAUDE.md` on 2026-09-19, verbatim, to bring that file back under its size limit. Nothing here was rewritten or dropped. `CLAUDE.md` keeps the rules a reader must not miss and points here for the reasoning.*


The app is deployable to a public URL from one Render blueprint at
`render.yaml`: a static site for the web build, the FastAPI backend, and
Postgres. Procedure and failure modes: `docs/deployment.md`.

### ⛔ The approval this required, and what it does not extend to

This file fences "merging to `main`, releasing, or deploying anywhere" behind
explicit human approval obtained outside the agent pipeline. **That approval
was given directly by the repository owner in conversation on 2026-09-02**,
after being told that a public link means anyone who finds it can create an
account and type real symptoms into an instrument no clinician has reviewed.
They also chose open sign-up over an invite code, having been offered both.

The approval covers **deploying this demo**. It is not an approval of anything
the release blockers above cover, and no agent may read it as one:

- It does not make the app safe to put in front of real patients. Every
  blocker in "⛔ BLOCKING: symptom intake requires clinical and legal sign-off"
  is untouched.
- It does not authorise switching on `MEDLINEPLUS_TOPICS_ENABLED`, setting
  `TRIAGE_LOG_CLASSIFICATIONS`, flipping `delivery_available()`, or any other
  gated thing that happens to be reachable now that a deployment exists.
- It does not authorise a second deployment, a custom domain, or merging to
  `main`. Ask again.

### What publishing changed, and what it did not

Exactly one open finding closed, and it closed because of the host rather than
because of any code here: traffic is now encrypted **and authenticated** in
transit by a CA-issued certificate. The self-signed certificate the LAN setup
uses encrypts without authenticating, so it never stopped someone on the
network impersonating the server. As a side effect the browser's Geolocation
API works for the first time, because a real https origin is a secure context
and `http://192.168.x.x` is not.

Nothing else moved. Still open, and unchanged by deploying: encryption at
rest, token revocation, an audit log of reads, the BAA question with every
vendor, and clinician review of the triage instrument, the emergency phrase
lists, the follow-up questions and the dose-schedule phrase lists.

Two things get *worse* in a way worth stating plainly, because they were
previously bounded by the LAN:

- **The rate limiter is now the only thing between a public address and the
  sign-in endpoint.** It is per-process and in-memory (open finding 6), which
  on one free instance means it is exactly what it says it is, and no more.
- **The dev-only findings are no longer dev-only in practice.** Finding 3 — a
  real email address in a development database — is about a database on this
  machine, but the same mistake made on a public deployment is a live one.
  Synthetic data only, there as here.

### How the pieces find each other

- **Two services, not one.** The API's response headers are deliberately
  hostile to HTML: `default-src 'none'` would stop the bundle loading and
  `geolocation=()` would switch off the "Use my location" button. Serving the
  web build from FastAPI would mean relaxing a reviewed security control to
  save a configuration line. See the ⛔ note in `app/main.py`, which
  anticipated exactly this.
- **The app is told where the API is at build time.** `EXPO_PUBLIC_*` is
  inlined by babel, so `render.yaml` composes `EXPO_PUBLIC_API_BASE_URL` from
  the API service's real hostname via `fromService` and passes it to
  `expo export`. Without it, `baseUrl.ts` would look for the API on port 8000
  of the host that served the page — right on a LAN, wrong here. **A rename of
  the API service therefore needs the web service rebuilt, not restarted.**
- **CORS is a literal in the blueprint**, because the web service already
  references the API and Render will not resolve a cycle. If Render suffixes
  the site's URL, `CORS_ALLOW_ORIGINS` has to be corrected by hand — the
  symptom is an app that loads and then fails every request. `docs/deployment.md`
  says so where someone will actually hit it.
- `ENVIRONMENT=production`, so `config.py` applies its production rules: a weak
  signing key is a refusal to boot, a `*` origin is refused, `/docs` is not
  served, and `sslmode=require` is appended to the database URL.
- **Tables are created by the start command**, running
  `scripts/create_missing_tables.py` before uvicorn. Alembic is still not wired
  up (see "Known Gaps"), and `create_all` creates what is missing without
  altering what exists. That is a demo's answer, not a release process: a
  column added to an existing model still needs a hand-written script.

