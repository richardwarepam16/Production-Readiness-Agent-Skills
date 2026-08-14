---
name: legal-pages-and-consent
description: Audit the user-facing legal surface — privacy policy, terms of service, cookie consent and banner behaviour, marketing email compliance, subscription and auto-renewal disclosure, refund and cancellation flows, age gating, DMCA and content moderation, impressum, and marketing claims that create liability. Use before any public launch, when the user asks whether they need a privacy policy or terms, when they add payments, subscriptions, cookies, analytics, email marketing, or user-generated content, or when they mention GDPR banners, "click to cancel", app store rejection, or getting a legal complaint.
---

# Legal pages and consent

The layer that gets a working app taken down or sued. It is also the part with the best
effort-to-risk ratio in the whole audit: most of it is a day's work, and skipping it is what
turns a hobby project into a demand letter.

This is an engineering checklist, not legal advice. Have a qualified lawyer in each
jurisdiction you operate in review anything user-facing before launch. Template policies are a
starting point, not a substitute — and a template that describes practices you don't follow is
actively worse than nothing.

Run `privacy-and-data-inventory` first. The policy must describe what the code actually does.

## Privacy policy

Required in practice the moment you collect anything personal — including just an email for a
waitlist. GDPR, CCPA, and most app stores each require it independently, and Google/Apple/Meta
sign-in and ad platforms all require a live, linked policy as a condition of use.

Check it exists, is linked from the footer *and* the signup form, is reachable without logging
in, and that it actually says: who the controller is (a real legal entity and contact),
what's collected, why, the lawful basis, who it's shared with **by name or specific category**,
international transfers, retention, user rights and how to exercise them, cookies/tracking,
children's policy, and a last-updated date with a change-notification commitment.

The most common finding is a template that mentions processors the app doesn't use and omits
every one it does. Compare it line by line against the data map. A mismatch is **P0** — it is
a documented misrepresentation.

## Terms of service

Not legally mandatory, but without them you have no limitation of liability, no termination
right, no governing law, and no basis to remove abusive users. Worth having before the first
paying customer. Look for: acceptable use, account termination, payment/refund/cancellation
terms, IP ownership (yours and theirs — critical if users upload content or you generate
content for them), disclaimers of warranty, limitation of liability, dispute resolution and
governing law, and how changes are communicated.

**Acceptance matters as much as content.** A link in the footer is weak; an unchecked checkbox
at signup with links to both documents is defensible. Record the version and timestamp
accepted — that record is the thing you need if it's ever contested.

## Cookies and tracking

The rule that trips everyone: under EU/UK law, non-essential cookies and trackers require
consent **before** they are set. A banner that says "by continuing you accept" while GA has
already fired is not consent, and this is an actively enforced area.

Check in a real browser with devtools: load the page fresh, look at what's set before any
click. Then verify the banner has a **reject option as prominent as accept** (accept-only, or
reject buried behind "manage preferences", is non-compliant and is the specific pattern
regulators have been fining), that rejecting actually blocks the scripts rather than just
hiding the banner, that consent is per-category, that there's a way to change your mind later,
and that consent is logged.

Genuinely essential cookies (session, auth, CSRF, load balancing) don't need consent. Analytics
and advertising always do. If you'd rather avoid the whole apparatus, cookieless analytics
(Plausible, Fathom, self-hosted Umami) is a legitimate architectural answer that removes the
banner and the compliance surface together.

## Marketing email

- Explicit opt-in for marketing (a pre-ticked box isn't consent under GDPR; CASL in Canada is
  stricter still). Don't bundle marketing consent into signup as a condition of service.
- One-click unsubscribe in every marketing email, honoured promptly, plus a physical postal
  address (CAN-SPAM requires it) and accurate From/Subject lines.
- Keep transactional (receipt, password reset) and marketing separate — sneaking promotion
  into a receipt loses the transactional exemption.
- Technical side: SPF, DKIM, and DMARC configured, or your mail lands in spam and your domain
  is spoofable. Gmail and Yahoo now require DMARC for bulk senders.

## Payments and subscriptions

- **PCI scope** — use Stripe Elements, Checkout, or an equivalent so card data never touches
  your servers. Any app POSTing a raw card number to its own backend is P0; the compliance
  burden is not survivable for a small team.
- **Auto-renewal disclosure** — price, interval, and renewal terms clearly stated before
  purchase, plus a confirmation email. Several US states and the EU mandate specifics here.
- **Cancellation must be as easy as signup.** The FTC's rule and EU consumer law both target
  the "sign up in one click, cancel by emailing support" pattern. If there's no
  self-serve cancel button, that's a finding.
- **EU/UK consumers get a 14-day withdrawal right** for digital services unless they expressly
  waive it at purchase after being told — a checkbox at checkout.
- Sales tax and VAT are handled (Stripe Tax, Paddle, or a merchant-of-record who takes the
  liability). Note it as a human task; you can't determine it from code.
- Refund policy stated and matching what you actually do.

## Age gating

If under-13s might realistically use the app, COPPA applies in the US and is expensive to get
wrong; GDPR sets the digital-consent age between 13 and 16 depending on member state. A terms
clause saying "you must be 18" with no age field is not a control. Anything social, gaming,
educational, or with an app-store rating that permits minors needs a real answer.

## User-generated content

If users can post anything publicly, you need: a reporting mechanism, a moderation and takedown
process, terms permitting removal, and — for the US DMCA safe harbour — a **registered
designated agent with the Copyright Office** plus a published notice-and-takedown address.
Registration is cheap and easy; without it you lose safe-harbour protection entirely, which is
the whole point. The EU DSA adds notice-and-action and transparency obligations.

## Jurisdiction-specific

- **Germany** — an Impressum (legal-entity disclosure) is mandatory for commercial sites and
  is actively enforced by competitor lawsuits.
- **US** — CCPA/CPRA needs a "Do Not Sell or Share" link if you share with ad partners.
  Several states have their own privacy laws now with similar mechanics.
- **India (DPDP Act)**, **Brazil (LGPD)**, **Canada (PIPEDA)** — similar shapes, different
  details. Flag by where your users actually are, not where you are.

## Marketing claims

Your landing page is a legal document. Flag anything you can't substantiate:

- "Bank-grade" / "military-grade" encryption, "unhackable", "100% secure" — unprovable claims
  that become exhibit A after an incident.
- "SOC 2 compliant" / "HIPAA compliant" / "GDPR certified" when no audit exists. This is
  straightforward misrepresentation and enterprise buyers do check.
- "End-to-end encrypted" when you can read the data. This one has drawn FTC action.
- Fake testimonials, invented logos of customers you don't have, fabricated user counts.
- Free-trial terms that differ from what actually gets charged.

## Output

List each document as **present / missing / present-but-inaccurate**, with the specific
mismatch for the third case. Generating a draft policy from the data map is a reasonable
deliverable — but label it clearly as a draft for a lawyer to review, and never let it claim
practices you haven't verified in the code.
