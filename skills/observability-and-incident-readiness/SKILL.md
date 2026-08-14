---
name: observability-and-incident-readiness
description: Audit monitoring, logging, alerting, and incident response readiness — error tracking, uptime and health checks, structured logs and audit trails, PII scrubbing in logs, actionable alerts, cost and budget alarms, on-call ownership, breach notification readiness, and a status/rollback plan. Use before launching anything with real users, when the user mentions monitoring, logging, Sentry, alerts, downtime, "how would I know if it broke", or after any incident or outage.
---

# Observability and incident readiness

Two questions decide whether an incident is an inconvenience or an existential event:
**would you know?** and **could you reconstruct what happened?**

A breach you detect in an hour is a bad week. The same breach detected in four months, with no
logs to determine what was accessed, is a disclosure obligation you cannot meet accurately, a
notification to every user because you can't narrow it, and an insurance claim with a hole in
it. Median dwell time for undetected intrusions is measured in months.

## Would you know?

**Error tracking.** Sentry, Rollbar, Honeybadger — something that captures unhandled exceptions
in both frontend and backend with source maps uploaded so stack traces are readable. Check
that it's actually initialised in production (a common finding: configured in code, DSN never
set in the production environment) and that release tracking is on so you can tell which deploy
broke things. Then check the errors are triaged rather than accumulating unread — 4,000
unlooked-at events is the same as no error tracking.

**Uptime.** An external check hitting a real endpoint, not just the homepage. A `/health`
route that verifies the database connection and critical dependencies tells you more than a
200 from a static page. Free tiers of BetterStack, UptimeRobot, or Cronitor are sufficient.
Alert on the check failing twice in a row, not once, or you'll learn to ignore it.

**Cost.** Billing alerts on every metered service — cloud, database, and especially model
providers. Set them at a fraction of what you can afford to lose, not at the limit. A runaway
loop or an abused endpoint shows up here first, often before any error does.

**Security signals worth alerting on:** a spike in 401/403s (credential stuffing), a spike in
429s (someone probing your limits), unusual data-export volume, new admin accounts or role
changes, failed logins concentrated on one account, and traffic from unexpected regions if
you're regional.

**Anti-signal: alert fatigue.** An alert that fires daily and is always ignored is worse than
none, because it trains you to dismiss the channel. Every alert should be either actionable or
deleted. Fewer, sharper alerts.

## Could you reconstruct it?

**Structured logs.** JSON with consistent fields — timestamp, level, request ID, user ID,
route, status, duration. A request ID threaded through every log line for a request is what
turns "something broke" into a two-minute investigation. Grep-through-prose logs don't survive
contact with a real incident.

**Retention.** 30 days minimum, 90 is better, and note that platform defaults are often much
shorter (some log drains keep hours). If an intrusion is discovered in week six and your logs
cover two weeks, the answer to "what did they access" is permanently "we don't know" — which
under GDPR means notifying everyone.

**Audit trail** for security-relevant events, stored separately from application logs and
ideally append-only: logins and failures, password and email changes, permission and role
changes, data exports, deletions, admin actions, payment changes. This is what you need for a
breach investigation, for a "someone deleted our data" support case, and for any future
enterprise or SOC 2 conversation.

**PII in logs.** The counterweight to all of the above, and a genuine tension: logs are a data
store with weak access controls and long retention, so everything in them is in scope for
privacy obligations. Check for full request/response bodies logged, `console.log(user)`,
authorization headers, tokens in URLs (which land in access logs *and* Referer headers),
passwords in failed-login logs, and card or ID numbers. Configure scrubbing at the logger
(`beforeSend` in Sentry, a redaction serializer in Pino) rather than relying on discipline at
every call site. Do not log full LLM prompts containing user content without scrubbing.

Never return raw stack traces or ORM errors to the client — log them server-side with an ID and
return the ID: `{ error: 'Something went wrong', ref: 'a1b2c3' }`. That's debuggable without
leaking schema, paths, and driver versions.

## Could you respond?

The minimum written plan, which fits on one page:

1. **Who is responsible**, and how are they reached out of hours. For a solo founder that's
   "me, phone alerts on" — write it down anyway, because the next person needs it.
2. **How to stop the bleeding** — rollback command, feature flag kill switch, how to revoke all
   sessions, how to rotate every key, how to take the app down if that's the right call. Know
   these before you need them at 3am.
3. **How to assess scope** — which logs, which queries, which dashboards.
4. **Who to notify and by when.** GDPR: 72 hours to the supervisory authority from awareness.
   Many US states: without unreasonable delay, some with fixed deadlines. Contractual
   commitments to business customers are often stricter than the law. Know which authority,
   have a draft notice, and know your cyber-insurance notification requirement (late notice can
   void cover).
5. **How to talk about it** — a status page (a free hosted one is fine) and a holding statement
   template. Silence during an outage generates more support load than an honest update.

**Rollback.** The most important operational capability and the one most often missing. Can you
get back to the previous version in under five minutes, without a human remembering the steps?
Test it once, deliberately, before you need it. Note that database migrations often aren't
reversible — a rollback plan that ignores schema changes isn't a plan.

**Backups restored at least once.** Covered in `datastore-and-cloud-config`; repeated here
because untested backups are the most common false sense of safety in this entire audit.

## Findings to expect

Most small apps have none of this, and the whole gap is a few hours' work. Report it as a short
prioritised list rather than a dozen separate findings — error tracking, uptime check, billing
alert, log retention, PII scrubbing, rollback test. The first three take under an hour combined
and cover the majority of the risk.
