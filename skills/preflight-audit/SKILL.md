---
name: preflight-audit
description: Run a full pre-production readiness audit of a codebase — security, privacy, legal, and operational — and produce a prioritised report with fixes. Use this whenever the user is about to launch, deploy, ship, go live, open signups, or "put this in production", or asks whether their app is safe, secure, production-ready, legally OK, or "will I get sued". Also use when they ask for a security review, code audit, pre-launch checklist, or say something like "I vibecoded this, is it safe?". Trigger even if they only mention one narrow worry (e.g. "are my API keys safe?") — a single exposed key almost never travels alone, so run recon and route to the other checks too.
---

# Preflight audit

The orchestrator. It figures out what the app actually is, decides which specialist checks
apply, runs them, and merges everything into one prioritised report.

Most apps that get breached or sued are not exotic. They are ordinary CRUD apps where the
same four things went wrong: a key was in the frontend, an endpoint didn't check ownership,
the database was directly reachable with row-level security off, and there was no privacy
policy for the data being collected. Find those first. Everything else is refinement.

Read `shared/severity-rubric.md`, `shared/evidence-rules.md`, and `shared/report-template.md`
before starting. They govern every finding you write.

## Phase 0 — Frame it with the user (60 seconds, not 10 minutes)

Ask at most these, and only the ones you can't answer from the code:

1. **Is it live, or pre-launch?** Live means leaked secrets are already burned and must be
   rotated, not just moved. Pre-launch means you have room to fix properly.
2. **Real user data, and from where?** "Just me and my cofounder" is a different report from
   "500 signups including EU users".
3. **Money?** Payments, subscriptions, or credits change both the security and the legal set.
4. **Where does it deploy?** You need this to check headers, secrets, and infra meaningfully.

Then go. Do not interview them for twenty minutes — you can learn most of this by reading.

## Phase 1 — Recon

Build a picture before judging anything. You are answering four questions:

**What is this?** Read `package.json` / `requirements.txt` / `go.mod` / `Gemfile`, the config
files, and the directory layout. Identify framework, runtime, ORM/DB client, auth library,
hosting target, and whether there is a separate backend or it's all serverless functions.

**Where does untrusted input enter?** Enumerate every route handler, API endpoint, server
action, webhook receiver, form, file upload, cron/queue consumer, and any place the client can
influence a query. This list is the backbone of the whole audit — an endpoint you never
enumerated is an endpoint you never checked.

**What data does it hold?** Read the schema/migrations. Flag every column that is personal
data: email, name, phone, address, IP, device ID, location, photo, DOB, payment token, health
or biometric anything, free-text fields users will inevitably put personal data into. This
feeds the privacy skill.

**What does it talk to?** Third-party SDKs, analytics, LLM providers, email senders, payment
processors, storage buckets, webhooks out. Every one is a data recipient with legal weight and
an outbound attack surface.

Write this down as a short **App Profile** and show the user. It is genuinely useful on its
own, and if you got the stack wrong they'll correct you before you waste effort.

## Phase 2 — Route

Run the skills that apply. These four are near-universal — run them unless there is a positive
reason not to:

| Skill | Run when |
|---|---|
| `secrets-and-key-exposure` | Always. |
| `auth-and-access-control` | Anything with accounts, sessions, or per-user data. |
| `injection-and-output-encoding` | Any database, shell, template, or rendered user content. |
| `privacy-and-data-inventory` | Any personal data at all, including just emails. |

Then, conditionally:

| Skill | Run when |
|---|---|
| `api-abuse-and-rate-limits` | Public endpoints, especially any that cost money per call. |
| `security-headers-and-cookies` | Serves HTML or sets cookies. |
| `datastore-and-cloud-config` | Supabase, Firebase, S3/R2/GCS, Mongo, or a browser-reachable DB. |
| `dependency-and-supply-chain` | Always, cheap. Prioritise if the lockfile is old or missing. |
| `file-uploads-and-ssrf` | Uploads, avatars, imports, URL fetching, webhooks, PDF/image processing. |
| `ai-and-llm-safety` | Any LLM/model API call, RAG, agent, or AI feature. |
| `legal-pages-and-consent` | Any public signup, EU/UK/California users, cookies, or marketing email. |
| `licensing-and-ip` | Always before a commercial launch — AGPL contamination is silent and expensive. |
| `accessibility-baseline` | Any public web UI. In the US this is an active litigation area. |
| `observability-and-incident-readiness` | Anything with real users. |
| `release-readiness` | Always before first deploy. |

Skipping is a decision — record it in the report's "Not checked" section with the reason.

## Phase 3 — Investigate

Work skill by skill, but keep one shared findings list so you can spot the combinations.
Isolated findings are often P1; combined they are P0:

- Anon Supabase key in the bundle (fine on its own) **+** RLS off on `profiles` (fine if
  nothing can reach it) = *anyone can read every user's profile*. That is one P0, not two P2s.
- No rate limit (P2) **+** an endpoint that calls GPT-4 per request (P2) = *a stranger can
  spend your entire budget in an afternoon*. P0.
- Verbose stack traces (P2) **+** an ORM error surfaced to the client (P2) = *schema and
  connection details leak to anyone who sends bad input*. P1.

When you find something, trace it to ground before writing it up: is the code reachable from a
real route, is the input actually user-controlled, is there a guard upstream you missed.
Middleware and framework defaults catch a lot — check for them before reporting.

## Phase 4 — Report

Write `preflight-report.md` using `shared/report-template.md`. Order strictly by severity.
Deduplicate across skills — the same missing auth check found by two skills is one finding.

Give the verdict in the first three lines. A founder should be able to read the top of the
file and know whether they can ship tonight.

Then offer, don't impose:

> Want me to fix the P0s? I'd do one commit per finding so you can review or revert each
> separately. Start with P0-01 — it's the one that matters most.

## Phase 5 — Fix (only when asked)

One finding per commit, ID in the message: `fix(security): enforce ownership check on order
detail [P0-01]`. After each fix, state how to verify it and — where it's testable — write the
regression test. A fix without a test is a fix that comes back in three weeks.

Re-run the relevant skill after the fixes and update the report rather than writing a new one.
Keep finding IDs stable so "P0-03 is done" stays meaningful.

## Things that make this audit bad

- **Padding.** Forty low-value bullets bury the one real problem. If you find nothing serious
  in an area, one line saying so is worth more than invented findings.
- **Rewriting the app.** They asked what's broken, not for your architecture preferences.
  Style, folder structure, and framework choice are out of scope unless they cause a finding.
- **Absolutes.** Never write "your app is now secure". Write what you checked, what you found,
  and what you couldn't see.
- **Fear.** Be direct about real danger without theatrics. The person reading this built
  something and then asked for a review — that instinct deserves respect, not a lecture.
