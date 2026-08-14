# Severity rubric

Every finding gets exactly one severity. Be consistent — inflated severity trains people
to ignore the report, and deflated severity gets apps breached.

| Level | Name | Meaning | Ship? |
|---|---|---|---|
| **P0** | Blocker | Exploitable now by an unauthenticated stranger, or a legal exposure that starts accruing the moment you have one real user. Data loss, account takeover, unbounded cost, regulator-visible violation. | **No.** Fix before launch. |
| **P1** | Serious | Exploitable with some effort or a valid account; or a compliance gap that becomes a problem at scale/on complaint. | Ship only with a dated written plan. |
| **P2** | Hardening | Defence in depth, best practice, or a gap that is currently theoretical. | Backlog it. |
| **P3** | Note | Informational. Worth knowing, no action required today. | Ignore freely. |

## Deciding severity — ask in this order

1. **Who can trigger it?** Anonymous internet > any signed-up user > admin only.
2. **What do they get?** Other users' data or write access > own-tenant data > metadata > noise.
3. **How much effort?** One curl command > needs a chained bug > needs insider access.
4. **Is it reversible?** Leaked secrets and deleted data are not. Downtime is.
5. **Does a clock start?** GDPR breach notification is 72 hours. Regulator deadlines and
   app-store review rejections are hard dates, not opinions.

## Automatic P0s

These are P0 regardless of anything else, because the blast radius does not depend on
attacker skill:

- A live secret (API key, DB URL, private key, session signing key) reachable by anyone
  outside your team — in the frontend bundle, in a public repo, in git history, in a log sink.
- Any endpoint that returns or mutates another user's/tenant's data without an ownership check.
- Row-level security disabled (or never enabled) on a database exposed directly to browsers.
- A production database or object store reachable from the internet without auth.
- Payment amount, plan, or entitlement determined by a value the client sends.
- Collecting personal data with no privacy policy, or a policy that describes something you
  don't actually do.

## Automatic "not a finding"

Do not report these. They pad reports and destroy trust:

- Missing headers on endpoints that serve no HTML and set no cookies (say so once, in Notes).
- Publishable/anon keys that are *designed* to be public (Stripe `pk_`, Supabase `anon`,
  Firebase web config) — **unless** the server-side controls that make them safe are missing.
  In that case the finding is the missing control, not the key.
- Dependency CVEs in dev-only or build-time packages with no runtime path, unless the build
  itself is the attack surface.
- Theoretical issues in code that is not reachable from any route, job, or entrypoint.
