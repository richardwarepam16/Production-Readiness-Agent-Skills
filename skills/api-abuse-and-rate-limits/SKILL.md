---
name: api-abuse-and-rate-limits
description: Audit APIs for abuse and cost blowout — missing rate limits, no spend caps on paid third-party calls, over-fetching responses that leak sensitive fields, mass assignment, CORS misconfiguration, unbounded pagination and queries, expensive unauthenticated endpoints, and missing webhook signature verification. Use whenever the app exposes HTTP or GraphQL endpoints, calls a metered third-party API (LLMs, SMS, email, maps, geocoding), receives webhooks, or when the user mentions rate limiting, API bills, scraping, bots, CORS, or "someone is hammering my endpoint".
---

# API abuse and rate limits

Two distinct dangers live here. **Denial of wallet**: nobody breaks in, they just call your
expensive endpoint in a loop until your card declines. And **excessive data exposure**: the
endpoint works exactly as designed and hands out more than it should.

## Denial of wallet

Find every request path that costs money per call — LLM completions, embeddings, image
generation, SMS/OTP, transactional email, geocoding, maps tiles, background jobs that fan out,
PDF/video processing, anything calling a metered vendor. For each, ask three questions:

1. **Does it require auth?** An unauthenticated paid endpoint is a P0 the moment anyone finds
   it, and they will — bots crawl new deployments within hours.
2. **Is there a per-caller limit?** Per user, and per IP for anything pre-auth (signup, login,
   OTP send, password reset, contact forms, public demos).
3. **Is there a ceiling that fails closed?** A global cap and a hard spend limit at the
   provider, so a bug or a burst can't run past your budget while you sleep.

Signup, OTP, and "email me a link" endpoints deserve extra care: each one sends a message
someone pays for, and abuse also gets your sending domain blocklisted, which is slower to fix
than the bill.

## Implementing limits

Fixed-window counters in process memory are the usual first attempt and they fail on
serverless (every instance has its own memory) and reset abruptly on the boundary. Use a
shared store and a sliding window or token bucket:

```ts
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const limits = {
  ai:   new Ratelimit({ redis: Redis.fromEnv(), limiter: Ratelimit.slidingWindow(20, '1 h'), prefix: 'ai' }),
  auth: new Ratelimit({ redis: Redis.fromEnv(), limiter: Ratelimit.slidingWindow(5, '15 m'), prefix: 'auth' }),
}

export async function POST(req: Request) {
  const session = await auth()
  const key = session?.user.id ?? ipFrom(req)      // authed users by id, anon by IP
  const { success, limit, remaining, reset } = await limits.ai.limit(key)
  if (!success) {
    return new Response('Too many requests', {
      status: 429,
      headers: {
        'Retry-After': String(Math.ceil((reset - Date.now()) / 1000)),
        'RateLimit-Limit': String(limit),
        'RateLimit-Remaining': String(remaining),
      },
    })
  }
  // …
}
```

Points to get right:

- **Key by identity where you can.** IP-only limiting punishes shared networks and is trivially
  bypassed with rotating proxies. Authenticated identity plus a cost for creating identities
  (email verification, payment, or a captcha) is what actually holds.
- **Read the client IP correctly.** Behind a proxy, `req.socket.remoteAddress` is the proxy.
  Use the platform's trusted header (`x-vercel-forwarded-for`, `cf-connecting-ip`) or a
  correctly configured `trust proxy` — naively trusting `X-Forwarded-For` lets anyone spoof it.
- **Weight by cost.** A 4k-token completion isn't one unit and a 200k-token one isn't either.
  Budget tokens or credits, not requests.
- **Layer it.** Platform/WAF rules (Cloudflare, Vercel) absorb crude floods cheaply;
  application limits handle per-user fairness. Neither replaces the other.
- **Cap at the provider too.** Monthly spend limits and budget alerts on OpenAI/Anthropic/AWS/
  Twilio are the backstop for the bug you didn't anticipate. This is a five-minute task and
  it's the one people skip.
- **Timeouts and size limits everywhere.** `AbortSignal.timeout()` on outbound calls,
  `express.json({ limit: '100kb' })` on bodies, max array lengths in schemas, a cap on
  `?limit=` (a request for a million rows is an outage).

## Excessive data exposure

The API returns a whole database row and the frontend renders three fields. The other twelve
still travelled over the wire and sit in the browser's network tab:

```ts
// ✗ ships password_hash, stripe_customer_id, internal_notes, reset_token…
const user = await db.user.findUnique({ where: { id } })
return Response.json(user)

// ✓ select explicitly — an allow-list at the query layer
const user = await db.user.findUnique({
  where: { id },
  select: { id: true, name: true, avatarUrl: true, createdAt: true },
})
```

Check every list endpoint, every `include`/`populate`/join (nested relations drag their own
columns along), every GraphQL type (a field on a type is exposed unless a resolver denies it),
and every error response. Search responses and public profiles are the usual leak sites —
a "search users by name" endpoint that returns email addresses is a P1 privacy finding as well
as a security one.

Also check: `_count` and aggregate endpoints that reveal business metrics, admin-only fields
returned to everyone and hidden by the UI, and soft-deleted rows still returned by queries.

## Mass assignment

Covered in `auth-and-access-control`, restated because it lives at the API boundary: never
spread a request body into a create/update. Allow-list the fields, or use `.strict()` schemas
that reject unknown keys outright.

## CORS

`Access-Control-Allow-Origin: *` on a public read-only API is fine. Combined with
`Allow-Credentials: true` it is a serious flaw — and browsers reject that pair, so the
dangerous version is the one that reflects the request's origin back:

```ts
// ✗ reflects any origin — every website can make credentialed requests as your users
app.use(cors({ origin: true, credentials: true }))
// ✓ explicit allow-list
app.use(cors({ origin: ['https://app.example.com'], credentials: true }))
```

Watch for sloppy origin matching (`origin.endsWith('example.com')` matches
`evil-example.com`), `null` origin allowed, and wildcards in `Allow-Headers` alongside
credentials. Remember CORS is a browser control — it protects your users' browsers, not your
server. Server-to-server callers ignore it entirely.

## Webhooks

Inbound webhook receivers are unauthenticated POST endpoints unless you verify signatures.
An unverified Stripe or payment webhook means anyone can POST "payment succeeded" and get a
free subscription — this is a real, frequently exploited P0.

```ts
const event = stripe.webhooks.constructEvent(await req.text(), sig, process.env.STRIPE_WEBHOOK_SECRET!)
```

Verify against the **raw** body (framework JSON parsers break signatures), use a
constant-time comparison for HMAC, reject stale timestamps to prevent replay, and make
handlers idempotent — providers retry, and double-crediting an account is its own incident.

## GraphQL specifics

Introspection enabled in production hands over your entire schema. Nested queries need a depth
limit and a complexity budget, or one query becomes a database outage. Batched aliases bypass
per-request rate limits — limit by operation cost, not request count. Field-level
authorisation must exist on the resolver; a `@auth` directive on the query root doesn't
protect nested fields.

## Report additions

For each abusable endpoint give the concrete arithmetic — it is what makes people act:

> `POST /api/generate` is unauthenticated and calls GPT-4o with no cap. At ~$0.01 per request
> and 50 req/s from one machine, that is roughly $1,800/hour. **P0.**
