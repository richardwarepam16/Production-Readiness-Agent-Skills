---
name: privacy-and-data-inventory
description: Build a data inventory and audit privacy obligations — what personal data is collected, where it is stored and for how long, which third parties receive it, whether there is a lawful basis, and whether users can access, export, and delete their data. Covers GDPR, UK GDPR, CCPA/CPRA, and app-store account-deletion requirements. Use whenever an app collects any personal data including just email addresses, whenever the user mentions GDPR, privacy, PII, user data, data deletion, analytics, or asks "do I need a privacy policy" or "where is my user data stored".
---

# Privacy and data inventory

Do this before writing any privacy policy, because a policy that doesn't match the code is
worse than none — it's a written, dated statement of something untrue, and it's the document a
regulator reads first.

This is an engineering checklist, not legal advice. Have a qualified lawyer in each
jurisdiction you operate in review anything user-facing before launch.

## Step 1 — Find the personal data

Personal data is anything relating to an identifiable person, which is broader than most
developers assume. Read the schema, migrations, and models and mark every field:

**Obvious:** name, email, phone, address, DOB, photo, government ID, payment details.

**Routinely missed:** IP addresses (personal data under GDPR — and you log them), device and
advertising IDs, cookie IDs, session identifiers, precise location, user agent, referrer URLs,
free-text fields (bios, support tickets, notes — users put anything in these), uploaded file
contents, message contents, and metadata like "who follows whom" or login timestamps.

**Special category** — health, biometrics, genetics, race/ethnicity, religion, political
opinion, trade-union membership, sex life or orientation. These need a stronger lawful basis
and much more care. A fitness app collecting weight, a dating app collecting orientation, and
a mental-health journal are all in scope, and their founders usually haven't realised it.

**Children's data** — if under-13s (COPPA) or under-16s (GDPR, varies by member state) can
plausibly sign up, obligations escalate sharply. "Our terms say 18+" is not an age control if
the signup form doesn't ask.

Then find the data that isn't in the database: server and access logs, analytics platforms,
error trackers (Sentry captures request bodies and user context by default), email/CRM tools,
support inboxes, backups, and spreadsheets someone exported once.

## Step 2 — Map where it goes

Every third party that touches personal data is a processor or a recipient, and each needs to
appear in your privacy policy by name or category. Enumerate from `package.json`, script tags,
`.env` keys, and outbound calls:

hosting and database (Vercel, Supabase, AWS…), analytics (GA, PostHog, Mixpanel), error
tracking (Sentry), email (Resend, SendGrid, Postmark), payments (Stripe), auth (Clerk, Auth0),
model providers (OpenAI, Anthropic), support (Intercom, Crisp), session replay (Hotjar,
FullStory — these record what users type, which is a large and frequently unrealised exposure),
CDNs, and any embedded widget.

For each, record: what data, why, where it's processed geographically, whether a DPA is signed
(usually a checkbox or a linked standard agreement in the vendor's dashboard), and the transfer
mechanism if data leaves the EU/UK.

**Session replay and analytics deserve a specific look.** Default configurations capture form
inputs, and it is entirely possible to be recording passwords or card numbers into a
third-party SaaS without knowing. Check the masking settings and check them on a real page.

## Step 3 — The output: a data map

Produce this table. It's the artefact that makes every downstream task tractable — the privacy
policy writes itself from it, the deletion feature has a spec, and a due-diligence
questionnaire stops being a week of archaeology.

| Data | Where collected | Stored where | Purpose | Lawful basis | Shared with | Retention |
|---|---|---|---|---|---|---|
| Email | Signup form | Supabase `users.email`, EU-West-1 | Account identity | Contract | Resend (email) | Life of account + 30d |
| IP address | All requests | Vercel logs, US | Security, abuse | Legitimate interest | Vercel, Cloudflare | 30 days |
| Chat messages | App | Supabase `messages` | Product function | Contract | OpenAI (processing) | Until deleted |

## Step 4 — Check the rights machinery

Rights on paper mean nothing without a mechanism. For each, ask "if a user asked today, what
would actually happen?":

- **Access / export** — can you produce everything you hold about one person? GDPR gives one
  month. Manual is acceptable at small scale; "we couldn't" is not.
- **Deletion** — the one that's usually broken. Check:
  - Is there a delete-account path in the UI at all? **Apple and Google both require in-app
    account deletion for apps that support account creation** — missing it is a review
    rejection, which is a hard launch blocker.
  - Does it actually delete, or set `deleted_at` and leave everything readable?
  - Does it cascade — uploaded files, vector embeddings, analytics profiles, email-list
    entries, Stripe customer, cached copies, logs?
  - What about backups? (Legitimate answer: backups are deleted on their retention cycle, and
    you say so. Have the answer ready.)
  - Do your processors get told? Most have a deletion API; almost nobody calls it.
- **Correction, portability, objection, opt-out of automated decisions** — at least know how
  you'd handle each.
- **CCPA/CPRA** — "Do Not Sell or Share My Personal Information" must be available if you
  share data with advertising partners. Note that many ad and analytics integrations count as
  "sharing" even with no money changing hands, which surprises people.

## Step 5 — Retention and minimisation

Indefinite retention is the default in almost every app and it's a liability multiplier: data
you deleted on schedule cannot be breached, subpoenaed, or leaked. Define a period per data
type, implement it as a scheduled job, and check the job exists rather than trusting the
policy. Then look for data you're collecting with no current use — the fields someone added
"for later" are pure downside.

Also check what's in non-production: production dumps in staging or on a laptop are a common
breach source, and a copy of your user table in a dev database is the same data with worse
controls. Anonymise or synthesise instead.

## Step 6 — Breach readiness

GDPR gives **72 hours** from awareness to notify the supervisory authority. That clock is
unwinnable if you're inventing the process during the incident. Minimum viable: someone
accountable, enough logging to determine scope, a template notice, and a written note of
which authority and which users you'd contact. Route to
`observability-and-incident-readiness`.

## Findings to expect

The three that come up almost every time, in severity order:

1. **P0** — collecting personal data with no privacy policy, or a policy that names none of
   the actual processors.
2. **P0/P1** — no working account deletion (P0 if there's a mobile app, since it blocks
   review).
3. **P1** — session replay or analytics capturing form fields unmasked.
