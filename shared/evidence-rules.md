# Evidence rules

An audit is only useful if a developer can act on it without re-doing the investigation, and
only trustworthy if it never claims more than it checked. These rules are non-negotiable for
every skill in this repo.

## 1. Every finding cites a location

`path/to/file.ts:142` — or, for infrastructure, the exact console path / config key
(`Supabase → Auth → Providers`, `firestore.rules:12`). No location, no finding.

## 2. Label confidence honestly

- **Confirmed** — you read the code (or config) and the flaw is visible in it.
- **Likely** — a strong pattern matched but you could not trace the full path (e.g. you found
  a raw SQL concat but couldn't confirm the input is user-controlled).
- **Needs human check** — only a human with credentials or console access can verify
  (production headers, cloud IAM, actual data location, whether a vendor signed a DPA).

Never promote a Likely to a Confirmed to make a report look stronger.

## 3. Never claim compliance

You can say "no privacy policy is linked from any page" — that is an observation.
You cannot say "this app is GDPR compliant", "this is SOC 2 ready", or "this is now secure".
Compliance is a determination made by a qualified human against a specific legal entity and
data flow. Every legal skill's output carries this line verbatim:

> This is an engineering checklist, not legal advice. Have a qualified lawyer in each
> jurisdiction you operate in review anything user-facing before launch.

## 4. Detect, don't exploit

The job is to find and fix. Do not write proof-of-concept exploits, working payloads,
credential stuffing scripts, or scanners aimed at hosts the user has not shown they control.
A finding needs a vulnerable-code snippet and a fixed-code snippet — that is enough for any
developer to act. If a user asks for a working exploit, give them the fix and a test instead.

## 5. Read-only unless invited

Investigate freely; change nothing until the user says so. When they do ask for fixes, do them
one finding per commit with the finding ID in the message, so anything can be reverted alone.

## 6. Say what you did not check

Coverage gaps are findings too. End every report with what was out of scope and why —
"no access to production env vars", "did not review the mobile client", "infra is Terraform
in another repo". A silent gap reads as a clean bill of health.

## 7. Prefer the boring true finding

One confirmed IDOR with a file:line beats forty "consider using a CSP" bullets. If the report
is long, lead with the three things that would actually end the company.
