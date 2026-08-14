# Installing Preflight in your coding agent

Every agent loads project instructions a bit differently, but they all do the same thing:
read markdown from a known path and use it when relevant. The skills are plain markdown with
YAML frontmatter, so they port with a copy command and, for some agents, a rename.

Agent config paths change fairly often — if something here doesn't match what your tool
expects, check its current docs and adjust. The content of the skills is what matters; the
wrapper is incidental.

---

## Claude Code / Claude Cowork

Skills load from `.claude/skills/` in the project, or `~/.claude/skills/` for every project.

```bash
mkdir -p .claude/skills
cp -r preflight/skills/* .claude/skills/
```

Then just ask:

```
Run a preflight audit on this codebase.
Check my API keys and rate limits before I deploy.
Is there anything here that would get me sued?
```

The frontmatter `description` is what makes a skill fire, so you don't need to name skills
explicitly — they trigger on intent.

To share one across your team as a package, put the skills in a repo and have everyone clone
into `~/.claude/skills/`, or wire it into your plugin marketplace if you run one.

---

## GitHub Copilot

Copilot reads repo-wide instructions from `.github/copilot-instructions.md` and path-scoped
instructions from `.github/instructions/*.instructions.md`.

**Repo-wide pointer** — `.github/copilot-instructions.md`:

```markdown
## Pre-production review

This repo carries a security, privacy, and legal audit checklist in `preflight/skills/`.

When the user asks about deploying, shipping, launching, security, API keys, rate limits,
privacy, GDPR, or whether the app is production-ready, read `preflight/skills/preflight-audit/SKILL.md`
first and follow it. It routes to the specialist checks.

Never report a finding without a file:line reference. Never claim the app is secure or
compliant — report what was checked and what was found.
```

**Path-scoped** — one file per area, so the right guidance loads with the right code:

```markdown
---
applyTo: "**/api/**,**/routes/**,**/server/**"
---
Follow preflight/skills/auth-and-access-control/SKILL.md and
preflight/skills/api-abuse-and-rate-limits/SKILL.md when writing or reviewing endpoints.
Every endpoint that accepts an ID must scope the query to the authenticated user.
```

A conversion script is included:

```bash
python3 scripts/convert.py --target copilot --out .github/instructions
```

**Chat mode** — if your Copilot version supports `.github/chatmodes/*.chatmode.md`, a
`preflight.chatmode.md` that inlines the orchestrator gives you a dedicated audit mode.

---

## Cursor

Cursor reads `.cursor/rules/*.mdc`. Same content, different frontmatter:

```mdc
---
description: Pre-production security, privacy and legal audit
globs:
alwaysApply: false
---

<contents of preflight-audit/SKILL.md>
```

```bash
python3 scripts/convert.py --target cursor --out .cursor/rules
```

Set `alwaysApply: false` and rely on the description for the audit skills — you want them on
demand, not in context on every keystroke. For the always-on subset (see below), `globs`
scoped to your API directory works well.

---

## Windsurf, Cline, Zed, Aider, and others

Most now read `AGENTS.md` at the repo root, and several also support their own rules
directory (`.windsurfrules`, `.clinerules/`). The lowest-common-denominator setup:

```bash
cp -r preflight /path/to/your-project/
cat >> AGENTS.md <<'EOF'

## Pre-production review

Before any deploy, launch, or production-readiness question, read
`preflight/skills/preflight-audit/SKILL.md` and follow it.

Every finding needs a file:line reference and an honest confidence label. Detect and fix —
never write proof-of-concept exploits. Never claim the app is secure or legally compliant.
EOF
```

---

## Any agent, no configuration

The skills are readable markdown. Paste the relevant one into a chat and say:

```
Follow these instructions and audit my codebase against them.
```

Works with anything that accepts a long prompt.

---

## The always-on subset

Running the full audit on every prompt is wasteful. But a few rules are cheap enough to keep
loaded permanently, and they prevent the findings rather than catching them later. Add this to
your agent's always-on instructions:

```markdown
## Security rules for all generated code

- Never put a secret in client-side code, or in a NEXT_PUBLIC_/VITE_/REACT_APP_ variable.
- Every query that fetches a record by ID must also filter by the authenticated user or
  tenant. Ownership goes in the WHERE clause, not in a separate if-statement.
- Parameterise every query. Never build SQL by string concatenation.
- Validate and type request bodies at the boundary with a schema, and reject unknown keys.
- Allow-list fields on create/update. Never spread a request body into a database write.
- Rate-limit every endpoint that costs money or sends a message.
- Select fields explicitly on API responses. Never return a whole database row.
- Set httpOnly, secure, and sameSite on session cookies.
```

That eight-line block prevents most of what this repo exists to find.

---

## Suggested workflow

1. **Once, early** — run the full audit. It's most useful before you've built on top of a bad
   pattern, not after.
2. **Always-on** — the subset above, so new code doesn't reintroduce fixed problems.
3. **Before each release** — `release-readiness` and whichever specialist skills cover what
   changed.
4. **In CI** — the deterministic parts (`gitleaks`, `npm audit --omit=dev`, `osv-scanner`,
   `axe`) as a gate. Agents are good at judgement; CI is better at never forgetting.
