---
name: security-headers-and-cookies
description: Audit HTTP security headers and cookie flags — Content-Security-Policy, HSTS, X-Frame-Options/frame-ancestors, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, CORS response headers, HttpOnly/Secure/SameSite cookies, cache-control on authenticated responses, TLS and redirect configuration, and leaky server banners. Use whenever the app serves HTML or sets cookies, before any production deploy, and whenever the user mentions CSP, headers, clickjacking, HTTPS, mixed content, cookies, security scanners, or a low grade from a header-checking site.
---

# Security headers and cookies

Cheap, fast, and genuinely useful — headers turn several whole bug classes into non-events.
They are also the most over-reported item in bad audits, so keep the framing honest: headers
are defence in depth. A CSP does not fix an IDOR, and "add these six headers" is not a
security review.

Check the **response as served**, not just the config file. Platform proxies, CDNs, and
frameworks add, strip, and override headers, so the deployed reality often differs from the
source. Ask the user to run this against their own deployment:

```bash
curl -sSI https://their-app.example.com | sort
curl -sSI https://their-app.example.com/api/me | sort   # API routes often differ
```

If you can't reach production, mark header findings **needs human check** and give them the
command. Guessing here produces confidently wrong reports.

## The set that matters

| Header | Good value | What it buys |
|---|---|---|
| `Content-Security-Policy` | see below | Turns most XSS into a blocked console error |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Kills SSL-strip and http downgrade |
| `X-Content-Type-Options` | `nosniff` | Stops MIME-sniffing an upload into script |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Stops URL paths/tokens leaking to third parties |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Denies APIs you don't use, incl. to embedded iframes |
| `X-Frame-Options` | `DENY` | Clickjacking, for old browsers |
| `Cross-Origin-Opener-Policy` | `same-origin` | Isolates your window from openers |

`frame-ancestors 'none'` in CSP supersedes `X-Frame-Options` in modern browsers — send both
while old clients matter. Do **not** recommend `X-XSS-Protection`; it is removed from modern
browsers and its legacy filter caused its own vulnerabilities.

Also remove what you're giving away for free: `X-Powered-By`, `Server` version banners, and
framework fingerprints. Minor, but free (`app.disable('x-powered-by')`).

## CSP without breaking the app

CSP is the highest-value and highest-friction header. A policy with `'unsafe-inline'` and
`'unsafe-eval'` in `script-src` provides close to nothing — that is worth saying plainly
rather than ticking the box because a header is present.

The workable path is nonce-based, generated per request in middleware:

```
default-src 'self';
script-src 'self' 'nonce-{RANDOM}' 'strict-dynamic';
style-src 'self' 'nonce-{RANDOM}';
img-src 'self' data: https:;
font-src 'self';
connect-src 'self' https://api.yourvendor.com;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
object-src 'none';
upgrade-insecure-requests;
```

`base-uri` and `form-action` are quietly important — without them an injected `<base>` tag or
form target redirects your app's own requests to an attacker. `object-src 'none'` closes
plugin-based bypasses.

Roll it out in `Content-Security-Policy-Report-Only` with a `report-uri`/`report-to` endpoint
first, watch for a week, then enforce. Shipping a strict CSP straight to production on launch
day breaks Stripe, analytics, and embedded video, and the reflex is to disable it entirely.

Framework notes: Next.js needs nonces threaded through middleware and can require
`'unsafe-eval'` in dev only; Vite dev server needs its own relaxations — make sure the strict
policy applies in production and the loose one can't leak there. Tailwind is fine; CSS-in-JS
libraries often need `style-src` nonces or hashes.

## Cookies

```ts
res.cookie('session', token, {
  httpOnly: true,                                  // JS can't read it → XSS can't steal it
  secure: process.env.NODE_ENV === 'production',   // HTTPS only
  sameSite: 'lax',                                 // CSRF defence for top-level navigation
  path: '/',
  maxAge: 60 * 60 * 24 * 7,
})
```

- **HttpOnly** on anything session-bearing. Missing it is P1 and becomes P0 alongside any XSS.
- **Secure** in production, always. Absent means the cookie can travel in cleartext.
- **SameSite** — `lax` is the sane default; `strict` breaks inbound links from email;
  `none` *requires* `Secure` and re-opens CSRF, so it needs a real justification (usually an
  embedded widget or cross-site OAuth flow) plus token-based CSRF protection.
- **Scope** — don't set cookies on a parent domain (`.example.com`) unless subdomains need
  them; a compromised marketing subdomain then reaches your app's cookies.
- **Prefixes** — `__Host-` for session cookies where you can. It forces Secure, path `/`, and
  no Domain, which structurally prevents subdomain injection.

**CSRF:** SameSite=Lax covers most of it, but not `POST`-from-form edge cases in older
browsers, and not at all if you set `SameSite=None`. If the app uses cookie auth and mutates
state, confirm the framework's CSRF protection is enabled (Rails/Django/Laravel have it on by
default — check nobody turned it off for an API route). Token-in-Authorization-header auth
isn't CSRF-vulnerable, since browsers don't attach it automatically.

## Caching authenticated responses

An intermediary or CDN caching a personalised page serves user A's data to user B. This is a
real and under-checked P0 — check that authenticated HTML and API responses set:

```
Cache-Control: private, no-store
```

Look for CDN configs with aggressive default TTLs, `s-maxage` on personalised routes, and
Next.js route handlers that are statically rendered when they should be dynamic.

## Transport

- HTTP redirects to HTTPS, and the redirect target is HTTPS (a 302 to `http://` is a loop
  through cleartext).
- No mixed content — any `http://` script/style/image on an https page is blocked or unsafe.
- TLS 1.2 minimum, ideally 1.3 only. Certificate auto-renews (an expired cert is a full
  outage and it always happens at 3am on a Sunday).
- HSTS `max-age` of at least a year before considering preload — preload is very hard to undo,
  so only suggest it when they're sure every subdomain will be HTTPS forever.

## Applying them

Most stacks want this at the edge rather than per-route. `helmet()` for Express, `headers()`
in `next.config.js`, `_headers` for Netlify/Cloudflare Pages, `vercel.json`, or the CDN's
rules. Whatever the mechanism, verify with `curl` afterwards — assuming a config took effect
is how apps end up with a beautiful CSP in a file that's never served.

## Reporting

Group all missing headers as **one P2 finding** with the config diff to fix them. Promote to
P1 only with a concrete reason — e.g. missing `HttpOnly` on a session cookie in an app that
also has an XSS sink, or a missing `Cache-Control: private` on an authenticated page behind a
CDN. Don't report a missing CSP as P0; it's a mitigation, not a vulnerability.
