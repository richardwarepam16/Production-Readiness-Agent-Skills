# Report template

Every skill writes findings in this shape. The orchestrator merges them into one document.
Write to `preflight-report.md` in the repo root unless the user says otherwise.

```markdown
# Preflight report — <project name>
**Date:** <YYYY-MM-DD> · **Commit:** <short sha> · **Scope:** <what was reviewed>
**Verdict:** BLOCKED (n P0) | SHIP WITH PLAN (n P1) | CLEAR

## Ship blockers
Ordered worst first. If this section is empty, say so explicitly.

## Findings

### [P0-01] Short imperative title
- **Area:** auth · **Confidence:** confirmed
- **Where:** `src/api/orders/[id].ts:34`
- **What:** One or two sentences. What is wrong and what an attacker or regulator gets.
- **Why it matters:** The concrete consequence, in business terms.
- **Fix:**
  ```ts
  // before
  const order = await db.order.findUnique({ where: { id: params.id } })

  // after
  const order = await db.order.findFirst({
    where: { id: params.id, userId: session.user.id },
  })
  ```
- **Verify:** How to prove it's fixed — the test to write, the curl to run against your own
  two test accounts, the config to re-read.

## Needs a human
Things only someone with console access or legal standing can settle. One line each,
with who needs to do it.

## Not checked
Scope gaps, and why.

---
This is an engineering checklist, not legal advice. Have a qualified lawyer in each
jurisdiction you operate in review anything user-facing before launch.
```

## ID scheme

`[SEVERITY-NN]` numbered per severity, worst first: `P0-01`, `P0-02`, `P1-01`. Keep IDs stable
across re-runs of the same report so people can say "P0-03 is fixed" and be understood.

## Tone

Write for a solo founder at 1am who shipped something they're proud of. Be direct about
danger, never sneering about the code. "This endpoint trusts the client's `role` field" —
not "amateur mistake". They are asking for a review; that is the good instinct, reward it.
