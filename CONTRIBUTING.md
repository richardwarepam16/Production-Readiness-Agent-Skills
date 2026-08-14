# Contributing

## What's most useful

**Real findings that these skills missed.** If something went wrong on a real launch —
a breach, a takedown, a demand letter, a surprise bill — and the relevant skill wouldn't have
caught it, that's the highest-value issue you can open. Describe the failure, not just the
rule.

**Better detection patterns.** Grep patterns and tool invocations that reduce false positives
or catch a variant. Include an example of code that should match and code that shouldn't.

**Framework and platform specifics.** The skills lean toward the JS/TS ecosystem because
that's where most of this happens. Django, Rails, Laravel, Spring, Go, and mobile equivalents
are welcome — as reference files under a skill, not as new skills.

**Corrections.** Security and legal details go stale. If a header is deprecated, a law
changed, or a recommendation is now wrong, say so with a source.

## Writing or editing a skill

Each skill is a directory under `skills/` with a `SKILL.md`:

```markdown
---
name: kebab-case-name
description: What it does, then the specific situations it should trigger in. This field is
  the entire triggering mechanism — write it so an agent knows when to reach for the skill
  without being told the skill's name.
---

# Title

Body: the workflow, what to look for, detection commands, and fix patterns.
```

Hold to these:

- **Explain why, not just what.** "Never trust the filename" plus the reason lands; a bare
  MUST doesn't survive contact with an ambiguous case.
- **Show the vulnerable code and the fixed code.** Side by side, in the language the reader is
  actually using. This is the part people copy.
- **Detection commands must be runnable.** Test your greps. A pattern that returns 400 hits in
  `node_modules` is worse than nothing.
- **Say what's a false positive.** Every skill should name the things that look like findings
  and aren't. This is what makes reports trustworthy.
- **Keep SKILL.md under ~200 lines.** Longer material goes in `references/` with a pointer
  saying when to read it.
- **No exploit code.** Detection, explanation, and remediation only. Prove fixes with tests,
  not payloads. A PR containing a working exploit will be closed.
- **No compliance claims.** Legal skills report observations and carry the not-legal-advice
  line.

Cross-reference other skills by name where they overlap rather than duplicating content — the
orchestrator relies on those links to route.

## Testing a change

Run the modified skill against at least one real repo, ideally a deliberately vulnerable one
(OWASP Juice Shop, DVWA, or a scratch app you break on purpose). Check three things: it finds
what it should, it doesn't flood you with noise, and the severities feel right to someone who
would have to act on them.

Note in the PR what you tested against and what it found.

## Scope

In scope: anything that could get a small team breached, fined, sued, delisted, or bankrupted
by an API bill, that an agent can meaningfully check from a repository.

Out of scope: general code quality and style, architecture opinions, performance beyond
launch-survival basics, and anything requiring a live pentest. Also out of scope: offensive
tooling of any kind.
