# Pre-launch master checklist

The human-readable version. Print it, work down it, or paste it into your issue tracker.
Each line maps to a skill that explains the why and the how.

Nothing here is exotic. Every item is something that has taken down a real small product.

---

## Blockers — do not launch without these

**Secrets** → `secrets-and-key-exposure`
- [ ] No secret keys in frontend code or `NEXT_PUBLIC_`/`VITE_`/`REACT_APP_` variables
- [ ] Built the app and grepped the output bundle for keys — zero hits
- [ ] Nothing sensitive in git history (`gitleaks detect --source .`)
- [ ] `.env` files gitignored; a `.env.example` documents the shape
- [ ] Anything ever exposed has been **rotated**, not just moved

**Access control** → `auth-and-access-control`
- [ ] Every endpoint taking an ID also filters by the authenticated user or tenant
- [ ] No endpoint reads `userId`, `role`, `isAdmin`, or `price` from the request body
- [ ] Admin routes protected server-side, not just hidden in the UI
- [ ] Two-account test passes: user B cannot fetch user A's records
- [ ] Passwords hashed with bcrypt/scrypt/argon2id
- [ ] Password reset tokens are random, single-use, and expire within an hour

**Data store** → `datastore-and-cloud-config`
- [ ] Supabase: RLS enabled on every public table, with `WITH CHECK` on write policies
- [ ] Firebase: rules are not `if true` or `if request.auth != null` on everything
- [ ] Storage buckets not public unless intended; no directory listing
- [ ] Database not reachable from `0.0.0.0/0`; no default credentials
- [ ] Backups exist, run automatically, and **one restore has been tested**

**Injection** → `injection-and-output-encoding`
- [ ] Every query parameterised; no string concatenation into SQL
- [ ] `ORDER BY`/table names validated against an allow-list
- [ ] Every `dangerouslySetInnerHTML` / `v-html` / `innerHTML` sanitised or removed
- [ ] Request bodies validated with a schema that rejects unknown keys

**Cost** → `api-abuse-and-rate-limits`, `ai-and-llm-safety`
- [ ] No unauthenticated endpoint calls a paid API
- [ ] Rate limits on auth, signup, email/OTP send, and every metered endpoint
- [ ] `max_tokens` and input length caps on every model call
- [ ] **Hard spend limit and budget alert set at each provider's console**

**Legal** → `privacy-and-data-inventory`, `legal-pages-and-consent`
- [ ] Privacy policy exists, is linked, and names the processors you actually use
- [ ] Terms of service exist, with acceptance recorded at signup
- [ ] Account deletion works and actually cascades (required by both app stores)
- [ ] Cookie consent blocks non-essential trackers *before* they fire, with a real reject option
- [ ] No unsupportable marketing claims ("military-grade", "SOC 2 compliant", "unhackable")

---

## Before the first real users

**Payments** → `legal-pages-and-consent`, `release-readiness`
- [ ] Card data never touches your server (Stripe Elements/Checkout or equivalent)
- [ ] Webhook signatures verified against the raw body; handlers idempotent
- [ ] Price and entitlement determined server-side, never from the client
- [ ] Self-serve cancellation, as easy as signup
- [ ] Auto-renewal terms disclosed before purchase
- [ ] Live keys in production, test keys in development — verified both ways

**Headers and transport** → `security-headers-and-cookies`
- [ ] `curl -sSI` against production shows HSTS, nosniff, Referrer-Policy, frame protection
- [ ] CSP present and not neutered by `unsafe-inline` in `script-src`
- [ ] Session cookies: `HttpOnly`, `Secure`, `SameSite`
- [ ] Authenticated pages send `Cache-Control: private, no-store`
- [ ] HTTP redirects to HTTPS; no mixed content; cert auto-renews

**Uploads and outbound** → `file-uploads-and-ssrf`
- [ ] File types validated by magic bytes, not extension or Content-Type
- [ ] Filenames generated server-side; size and count capped
- [ ] SVGs rasterised, sanitised, or served as attachments from another origin
- [ ] User-supplied URLs can't reach `169.254.169.254`, localhost, or private ranges
- [ ] IMDSv2 enforced if on AWS

**Dependencies** → `dependency-and-supply-chain`
- [ ] `npm audit --omit=dev --audit-level=high` clean, or every finding triaged
- [ ] Lockfile committed; CI uses `npm ci` not `npm install`
- [ ] Every unfamiliar package verified to actually exist and be the one you meant
- [ ] CI actions pinned by commit SHA
- [ ] No AGPL/GPL dependency in a closed-source product → `licensing-and-ip`

**Operations** → `observability-and-incident-readiness`, `release-readiness`
- [ ] Error tracking live and receiving events from production
- [ ] Uptime check on a real endpoint, alerting somewhere you'll see it
- [ ] Billing alerts on every metered service
- [ ] Logs structured, retained 30+ days, with PII scrubbed
- [ ] Rollback tested — under five minutes, and you've done it once on purpose
- [ ] Migrations reversible, backup taken before destructive ones
- [ ] SPF, DKIM, and DMARC configured; test email lands in an inbox not spam
- [ ] `security@` / `privacy@` inbox exists and someone reads it

**Accessibility** → `accessibility-baseline`
- [ ] Core flow completable with keyboard only
- [ ] Focus visible everywhere; no `outline: none` without a replacement
- [ ] Every input has a real label; no `<div onClick>` acting as a button
- [ ] `axe` run on the main pages, serious issues fixed

---

## Launch day

- [ ] Smoke test on production: sign up, do the main thing, pay, receive the email, log out
- [ ] Checked on a phone
- [ ] Test/seed accounts removed; debug endpoints gone
- [ ] Someone is watching errors and spend for the first hour
- [ ] You know exactly how to roll back, take it offline, and revoke every key

---

## Within the first month

- [ ] Data retention job implemented, not just documented
- [ ] Incident plan written down — who, how to stop it, who to notify within 72 hours
- [ ] Audit log for logins, permission changes, exports, and deletions
- [ ] Dependabot or Renovate on
- [ ] Attribution page for open-source licenses
- [ ] Trademark search done on your product name before you build more brand on it

---

*This is an engineering checklist, not legal advice. Have a qualified lawyer in each
jurisdiction you operate in review anything user-facing before launch.*
