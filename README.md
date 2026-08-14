# Preflight

**Agent skills that audit your app for security, privacy, and legal problems before you ship it.**

Drop these into Claude Code, GitHub Copilot, Cursor, or any coding agent that reads project
instructions. Then ask it to run a preflight audit. You get a prioritised report with file
locations, fixes, and a verdict on whether you can ship tonight.

Built for the situation where someone has shipped a real, working product quickly — often with
heavy AI assistance — and is about to put it in front of real users without ever having had it
reviewed. The code usually works. The problem is the things nobody wrote a ticket for: the API
key in the frontend bundle, the endpoint that returns any user's data if you change the number
in the URL, the database with row-level security switched off, and the privacy policy that
doesn't exist for the emails you're already collecting.

## Quick start

From inside your project:

```bash
npx github:richardwarepam16/Production-Readiness-Agent-Skills add
```

It asks which agent you use (Claude Code, Cursor, GitHub Copilot, or Windsurf/Cline/other) and
drops the skills in the right place. Non-interactive: `--target claude|cursor|copilot|agents`.

Then, in your agent:

```
Run a preflight audit on this codebase.
```

See [INSTALL.md](INSTALL.md) for manual installs, CLI flags, and per-agent details.

## What it checks

**Security**

| Skill | Catches |
|---|---|
| [`secrets-and-key-exposure`](skills/secrets-and-key-exposure/SKILL.md) | Keys in frontend bundles and git history, `NEXT_PUBLIC_` misuse, secrets in logs and CI |
| [`auth-and-access-control`](skills/auth-and-access-control/SKILL.md) | IDOR, missing ownership and tenant checks, client-side-only auth, JWT and session flaws, broken password reset |
| [`injection-and-output-encoding`](skills/injection-and-output-encoding/SKILL.md) | SQL/NoSQL injection, XSS, command injection, path traversal, prototype pollution, missing input validation |
| [`api-abuse-and-rate-limits`](skills/api-abuse-and-rate-limits/SKILL.md) | Denial of wallet, over-fetching responses, mass assignment, CORS holes, unverified webhooks |
| [`security-headers-and-cookies`](skills/security-headers-and-cookies/SKILL.md) | CSP, HSTS, cookie flags, CSRF, cached authenticated responses |
| [`datastore-and-cloud-config`](skills/datastore-and-cloud-config/SKILL.md) | Supabase RLS, Firebase rules, public buckets, exposed databases, tenant isolation, untested backups |
| [`dependency-and-supply-chain`](skills/dependency-and-supply-chain/SKILL.md) | Reachable CVEs, missing lockfiles, hallucinated packages, unpinned CI actions |
| [`file-uploads-and-ssrf`](skills/file-uploads-and-ssrf/SKILL.md) | Unvalidated uploads, SVG XSS, zip slip, SSRF to cloud metadata |
| [`ai-and-llm-safety`](skills/ai-and-llm-safety/SKILL.md) | Prompt injection blast radius, unbounded token spend, PII to model providers, RAG tenant leaks |

**Privacy and legal** — *engineering checklists, not legal advice*

| Skill | Catches |
|---|---|
| [`privacy-and-data-inventory`](skills/privacy-and-data-inventory/SKILL.md) | What data you hold, where it goes, retention, and whether deletion actually deletes |
| [`legal-pages-and-consent`](skills/legal-pages-and-consent/SKILL.md) | Privacy policy, terms, cookie consent, auto-renewal and cancellation, age gating, DMCA agent, unsupportable marketing claims |
| [`licensing-and-ip`](skills/licensing-and-ip/SKILL.md) | AGPL in a closed-source SaaS, missing attribution, font and asset licensing, trademark collisions |
| [`accessibility-baseline`](skills/accessibility-baseline/SKILL.md) | WCAG 2.2 AA basics — the `<div onClick>` pattern, keyboard traps, contrast, form labels |

**Operations**

| Skill | Catches |
|---|---|
| [`observability-and-incident-readiness`](skills/observability-and-incident-readiness/SKILL.md) | Would you know it broke, could you reconstruct it, could you respond in 72 hours |
| [`release-readiness`](skills/release-readiness/SKILL.md) | Test keys in prod, debug flags, unsafe migrations, N+1 queries, no rollback, SPF/DKIM/DMARC |

**Orchestrator** — [`preflight-audit`](skills/preflight-audit/SKILL.md) does recon on your stack,
picks the checks that apply, runs them, and merges everything into one report.

## Design principles

These are the rules that keep the output usable, and they're enforced inside every skill.

**Evidence or it doesn't exist.** Every finding cites `file.ts:142`. Confidence is labelled
honestly — confirmed, likely, or needs-a-human. See [`shared/evidence-rules.md`](shared/evidence-rules.md).

**Severity means something.** P0 blocks the launch. P2 goes in the backlog. Inflating severity
to look thorough teaches people to ignore the report, so the rubric has explicit
*automatic P0s* and an explicit *not-a-finding* list. See [`shared/severity-rubric.md`](shared/severity-rubric.md).

**Detect, don't exploit.** These skills find and fix. They don't write proof-of-concept
exploits or point scanners at hosts you haven't shown you control. A vulnerable snippet plus a
fixed snippet is enough for any developer to act.

**Never claim compliance.** The skills report observations — "no privacy policy is linked from
any page" — and never conclusions like "this app is GDPR compliant". Every legal skill carries
the same line: this is an engineering checklist, not legal advice.

**Three findings that matter beat forty that don't.** If an area is clean, one line saying so.

## What a report looks like

```markdown
# Preflight report — myapp
Date: 2026-08-14 · Commit: a3f91c2 · Scope: web app, API routes, Supabase schema
Verdict: BLOCKED (3 P0)

### [P0-01] Supabase service_role key is bundled into the browser
- Area: secrets · Confidence: confirmed
- Where: src/lib/supabase.ts:4, present in dist/assets/index-8f2a.js
- What: The service_role key bypasses row-level security entirely and ships to every visitor.
- Why it matters: Anyone who opens devtools has full read/write on every table.
- Fix: rotate the key now, move all privileged calls behind /api routes …
- Verify: rebuild, then grep the bundle for `service_role` — expect zero hits.
```

## Honest limits

Static review by an agent finds a lot and misses things. It does not replace a penetration
test, a lawyer, or a security engineer for anything handling health data, payments at scale,
or children's data. Runtime configuration, cloud IAM, and whether a vendor actually signed a
DPA can't be read from a repo — the skills mark those **needs human check** and hand you the
exact command or console path rather than guessing.

Treat a clean report as "the obvious catastrophes aren't here", not "this is secure".

## Contributing

New skills, better detection patterns, framework-specific notes, and corrections all welcome.
See [CONTRIBUTING.md](CONTRIBUTING.md). The most valuable contribution is a real finding from a
real launch that these skills would have missed.

## License

MIT. Use it, fork it, ship it inside your own tooling.
