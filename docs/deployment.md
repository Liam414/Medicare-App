# Putting MedHelp on the internet

How to get a link that opens the app on any device, on any network, with no
Expo Go, no development build, no Apple Developer account, and nothing running
on your own machine.

Everything here is driven by [`render.yaml`](../render.yaml) at the repository
root. Read that file too — it carries the reasoning for each setting, and this
page is the procedure.

---

## ⛔ Read this before you deploy

Until now this repository said, in bold, in two places, not to expose the
backend to the open internet. That warning was about a specific set of open
findings, and deploying does not close them:

| Blocker | Still open after deploying? |
|---|---|
| Clinical sign-off on the triage instrument | **Yes** — no clinician has read it |
| Legal sign-off on medical-device status | **Yes** |
| A BAA with every vendor that could touch PHI | **Yes** — there is none with anyone |
| Encryption at rest | **Yes** — `medications`, `intake_assessments`, `medication_reminders` and `appointments.reason_for_visit` are plaintext columns |
| Token revocation | **Yes** — a stolen token is valid until it expires |
| An audit log of reads | **Yes** |
| A least-privilege database role | Improved — Render's Postgres does not hand you the cluster superuser |
| Traffic encrypted **and** authenticated in transit | **Closed** — Render terminates a CA certificate, which the self-signed LAN setup could not do |

So: this is a public demonstration of the software, not a service for real
patients. The app says so on the home screen, and the sign-up flow is open to
anyone with the link, which is the shape a demo takes and not the shape a
health service takes.

**Do not put a real symptom, a real medication, or a real person's details
into it.** CLAUDE.md's data rule — synthetic only, everywhere — applies to the
deployed database exactly as it applies to the repository.

---

## What gets created

Three things, from one blueprint:

| Render service | What it is | Free tier behaviour |
|---|---|---|
| `medhelp-web-as615` | the app — a static site, and the link you share | always on |
| `medhelp-api-as615` | the FastAPI backend | sleeps after 15 minutes idle; the next request wakes it, which takes about a minute |
| `medhelp-db` | Postgres | free instances expire after 30 days |

The web build is a static bundle, so **the page itself always loads fast**. The
cold start shows up on the first thing you do that talks to the API — usually
signing in. It is a spinner for up to a minute, once, and then the app is
normal until it goes idle again.

---

## Step by step

### 1. Push this branch to GitHub

Render reads the blueprint out of the repository, so `render.yaml` has to be
on the branch you point it at.

```bash
git add render.yaml docs/deployment.md README.md CLAUDE.md mobile/
git commit -m "Deploy the app publicly from a Render blueprint"
git push -u origin feature-triage-accuracy-and-scan
```

### 2. Create the services

1. Sign in at <https://dashboard.render.com> with the GitHub account that owns
   `AndrewStrong615/Medicare-App`. No credit card is needed for the free tier.
2. **New → Blueprint**.
3. Pick this repository, and pick the branch you just pushed.
4. Render reads `render.yaml` and lists the three services. It asks for the one
   value the blueprint deliberately does not carry:
   - **`ANTHROPIC_API_KEY`** — optional. See "The symptom check without a key"
     below. Leave it blank to deploy without one.
5. **Apply**. The first build takes roughly five to ten minutes: the API
   installs Python dependencies, and the web service runs `npm ci` and
   `expo export`.

### 3. Check it came up

- `https://medhelp-api-as615.onrender.com/health` should return
  `{"status":"ok","symptom_intake_configured":…}`.
- `https://medhelp-web-as615.onrender.com` is **the link**. Open it on a phone
  on cellular data to prove it is genuinely public and not just working on your
  network.

Create an account, sign in, add a medication. If sign-in hangs for about a
minute the first time, that is the API waking up, not a failure.

---

## If Render gave a service a different URL

Service names on `onrender.com` are globally unique. If somebody already has
`medhelp-web-as615`, Render appends a suffix — and then two settings that are
written as literals no longer match reality:

**Symptom: the app loads, but every request fails, and the browser console
says the request was blocked by CORS.**

Fix, in the Render dashboard:

1. Open the **API** service → **Environment**.
2. Set `CORS_ALLOW_ORIGINS` to the web service's actual origin, with no
   trailing slash, e.g. `https://medhelp-web-as615-a1b2.onrender.com`.
3. Save. The API redeploys.

The other direction — the app knowing where the API is — is composed from
Render's own record of the API hostname (`fromService` in `render.yaml`), so it
follows a renamed API service automatically. It is baked into the bundle at
build time, though, so if you rename the API service later you have to
**redeploy the web service**, not just restart it.

---

## The symptom check without a key

The model layer is optional either way, and what it changes is quality rather
than availability. There are now two ways to provide one:

- **`ANTHROPIC_API_KEY`** — the original one-shot layer. Paid; there is no free
  tier for that API.
- **`LLM_BASE_URL` + `LLM_MODEL` (+ `LLM_API_KEY`)** — any OpenAI-compatible
  endpoint, which runs the agentic deduction loop instead and can be free.
  Setup and providers: `free-model-setup.md`.

⛔ **On a deployment the free option is not a way around the BAA question.**
The local endpoint that transmits nothing cannot run on a free instance, so
here this can only be a hosted provider — which makes Groq, Google or
OpenRouter a processor of symptom descriptions typed into a public URL, exactly
as setting the Anthropic key makes Anthropic one. Free of charge is not free of
consequence.

What either one changes:

- **Without it** the deterministic rule layer runs on its own. Every
  description still gets a tier, red-flag screening is unaffected, and the
  safety properties in CLAUDE.md all still hold. The explanation shown to the
  user is one of a few fixed sentences, and the classifier can never ask a
  clarifying question.
- **With one** the model layer is consulted as well, and can only ever escalate
  a tier, never lower one.

⛔ Either choice makes a vendor a processor of the symptom descriptions people
type into a public URL, and this project has a BAA with nobody. The Anthropic
key also costs money per assessment, on a URL anyone can sign up to. Decide
deliberately.

---

## What the free tier will do to you

- **The API sleeps.** Fifteen minutes idle, then the next request pays about a
  minute of cold start. There is no fix on the free tier other than paying for
  it; a keep-alive pinger just moves the cost.
- **The database expires after 30 days.** Render deletes free Postgres
  instances at that point. Everything in it goes: accounts, medications,
  reminders, appointments. For a demo full of synthetic data that is a
  non-event — create a new one and redeploy — but do not let anything you care
  about live only there.
- **Build minutes and bandwidth are capped.** Well beyond what a demo uses.

## Taking it down

Delete the three services in the Render dashboard. Nothing in this repository
holds credentials for them, and nothing on your machine keeps running.

---

## Why not the other options

- **A tunnel from this PC** (`cloudflared`, ngrok) gives a public URL with no
  account, but only while the machine is awake and both servers are running,
  and the URL changes on every restart. That is "accessible sometimes".
- **A mesh address** (Tailscale) is what the README recommends for private
  use, and remains the better answer for using the app yourself from another
  network — it needs no public exposure at all. It cannot be shared with
  someone who is not on the mesh.
- **Serving the web build from FastAPI as a single service** would mean one URL
  and no CORS, but the API's response headers are deliberately hostile to HTML
  — `default-src 'none'` and `geolocation=()` would stop the bundle loading and
  break the "Use my location" button — so it would mean relaxing a reviewed
  security control to save a configuration line. Two services keeps those
  headers exactly as they are.

## Public deployment (implemented)

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

