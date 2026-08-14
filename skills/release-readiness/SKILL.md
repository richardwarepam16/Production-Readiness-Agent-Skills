---
name: release-readiness
description: Final pre-deploy operational check — environment separation, test and seed data in production, debug flags and source maps, database migration safety and reversibility, test coverage on critical paths, deploy and rollback procedure, performance and N+1 queries, timeouts and resource limits, domain and email DNS, and app store submission requirements. Use immediately before a first production deploy or a major release, when the user says they are about to ship, go live, or launch, or asks what else they need to do before deploying.
---

# Release readiness

The operational layer. Not vulnerabilities — the things that make launch day go badly:
test keys in production, a migration that locks the table, no way back, and an app that falls
over at 50 concurrent users.

## Environments

The most dangerous confusion in a small project is one environment pretending to be two.

- Separate databases for dev, staging, and production. A shared database means a local test
  can delete real user data — this happens more often than anyone admits.
- Separate API keys per environment, and check the **live vs test** distinction specifically:
  Stripe `sk_test_` in production means payments silently don't work; `sk_live_` in
  development means someone's real card gets charged during a test. Both are common.
- No production credentials on developer laptops. No production data dumps in dev — that copy
  of the user table has the same legal weight and worse protection.
- `NODE_ENV=production` actually set (it changes framework behaviour and error verbosity in
  ways people rely on without realising).
- Every required env var documented in `.env.example` and validated at boot. Fail fast and
  loudly on a missing variable rather than discovering it via a 500 at 2am:

```ts
const env = z.object({
  DATABASE_URL: z.string().url(),
  STRIPE_SECRET_KEY: z.string().startsWith('sk_'),
  SESSION_SECRET: z.string().min(32),
}).parse(process.env)
```

## What shouldn't ship

- **Debug flags** — `DEBUG=true`, Django `DEBUG` (its error page prints settings *including
  secrets*), Rails `config.consider_all_requests_local`, verbose error middleware.
- **Source maps** served publicly if the source is proprietary — check whether they're
  uploaded to the error tracker and deleted from the bundle rather than shipped.
- **Seed, demo, and test accounts** — especially `admin/admin` or a test user with a weak
  password and elevated rights. Scanners find these fast.
- **Development endpoints** — `/api/debug`, `/api/seed`, `/api/reset`, `/api/test-email`,
  GraphQL playground, Swagger UI on a private API, `/__debug__`, exposed Prometheus metrics.
- **Commented-out credentials**, TODO comments describing known holes, and internal URLs.
- **Feature flags defaulting on** for half-finished features.

```bash
grep -rInE 'TODO|FIXME|HACK|XXX' --include='*.{ts,tsx,js,jsx,py,go,rb}' . --exclude-dir=node_modules | grep -iE 'security|auth|temp|fix.*before|remove'
```

## Migrations

The most common way a routine deploy becomes an outage:

- **Reversible, with a tested `down`.** Or a documented forward-fix if it genuinely can't be.
- **Backup taken immediately before** any destructive migration. Non-negotiable.
- **Tested against production-sized data.** A migration that takes 200ms on 100 rows can lock
  a 10M-row table for minutes. In Postgres, adding a column with a non-null default, adding an
  index without `CONCURRENTLY`, or changing a column type all take heavy locks.
- **Expand/contract for anything renaming or dropping.** Add the new column, write to both,
  backfill, switch reads, then drop the old one in a later deploy. Dropping a column in the
  same deploy that stops using it means the old running instances break during the rollout.
- **Never destructive without a copy.** A migration that drops a column throws the data away —
  if the deploy is rolled back, the data does not come back.

## Testing what matters

Coverage percentage is a poor target; specific critical paths are the right one. Before
launch, there should be automated tests for: signup and login, the core value flow, payment
(against Stripe's test mode), permission boundaries (user A cannot reach user B's data — see
`auth-and-access-control`), and any destructive operation.

Then a **manual smoke test on production after deploy**, because staging lies: sign up with a
real email, confirm the email actually arrives (deliverability is a production-only variable),
complete a real payment, check it on a phone, and log out. Ten minutes. Write it down as a
checklist so it happens every time.

## Deploy and rollback

- Deploys are automated and repeatable — a documented sequence of manual steps is a sequence
  someone will get wrong under pressure.
- **Rollback in under five minutes**, and someone has done it once on purpose. If the answer is
  "we'd redeploy the old commit and hope", that's a finding.
- Health check endpoint the platform uses to gate the rollout.
- Zero-downtime strategy if it matters, and a maintenance page if it doesn't.
- Deploys don't run as root and don't require a human to paste secrets.

## Performance

Enough to survive a launch spike, not a full optimisation pass:

- **N+1 queries** — the most common cause of a slow app. Look for a database call inside a
  loop or a `.map()`, and for lazy-loaded ORM relations rendered in a list. Turn on query
  logging and load one real page: 200 queries to render a list is the tell.
- **Indexes** on every foreign key and every column you filter or sort by. Missing indexes are
  invisible at 100 rows and fatal at 100,000.
- **Connection pooling** sized for the platform. Serverless is the trap: every concurrent
  invocation can open its own connection and exhaust the database's limit, which is exactly
  what a traffic spike produces. Use a pooler (PgBouncer, Supabase pooler, Prisma Accelerate).
- **Timeouts on everything outbound** — a hanging third-party call with no timeout holds a
  worker until the whole pool is consumed.
- **Pagination on every list endpoint** with a maximum page size.
- Caching for expensive reads, and a CDN for static assets.

## Domain and email

- DNS correct, `www` and apex both resolve, HTTPS on both, one canonical redirect.
- Certificate auto-renews.
- **SPF, DKIM, DMARC** configured for the sending domain. Without them your transactional
  email — password resets, receipts — lands in spam, and your domain can be spoofed. Gmail and
  Yahoo now enforce this for bulk senders. Test with `mail-tester.com`.
- Sending from a subdomain (`mail.yourapp.com`) keeps a deliverability problem from poisoning
  your main domain's reputation.
- A monitored inbox for `security@`, `privacy@`, `abuse@`, and `support@` — the legal pages
  will publish at least one of these, and an unread mailbox is how a responsible disclosure
  becomes a public one.

## Mobile app extras

If shipping to an app store: privacy nutrition labels / Data Safety form matching what the app
actually collects, **in-app account deletion** (a hard requirement on both stores and a common
rejection), permission strings explaining each request, no private APIs, ATT for tracking on
iOS, and a demo account for reviewers. Rejections cost a week each — check before submitting.

## Launch-day checklist

Worth writing down as a file in the repo:

```
□ Backup taken and restore verified
□ Migrations run and reversible
□ Env vars set, live keys not test keys
□ Error tracking receiving events
□ Uptime check green
□ Billing alerts set
□ Rate limits live on paid endpoints
□ Legal pages linked and accurate
□ Smoke test passed on production
□ Rollback command known and tested
□ Someone is watching for the first hour
```
