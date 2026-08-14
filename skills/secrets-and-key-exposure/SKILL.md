---
name: secrets-and-key-exposure
description: Find leaked credentials — API keys in frontend bundles, secrets in git history, service keys shipped to browsers, tokens in logs or error responses, misused NEXT_PUBLIC_/VITE_ prefixes, committed .env files — and produce a rotate-and-move plan. Use whenever the user mentions API keys, .env files, secrets, tokens, credentials, "is my key safe", an unexpected API bill, a key that "might have been pushed", or is preparing any app for production. Also use before making a private repo public, and any time you see a long random-looking string in client-side code.
---

# Secrets and key exposure

The single most common way a small app becomes an expensive incident. It is also the one
finding where the fix is *not* just editing code: a leaked secret is burned the moment it
leaves your control, and moving it without rotating it changes nothing.

## The rule that resolves most confusion

**Anything the browser can run, the browser's user can read.** Minification is not
protection — bundles ship with source maps, and `view-source` plus twenty seconds of Ctrl+F
finds any key. There is no such thing as hiding a secret in frontend code. Not in an env var,
not in a "private" module, not behind obfuscation.

So the question is never "is it hidden well enough". It is: **is this key one that is designed
to be public, or not?**

| Safe in the browser by design | Never in the browser |
|---|---|
| Stripe `pk_live_…` / `pk_test_…` | Stripe `sk_…`, webhook signing secret |
| Supabase `anon` key | Supabase `service_role` key |
| Firebase web config (`apiKey` is an identifier, not a secret) | Firebase Admin SDK service account JSON |
| PostHog/Segment/GA write-only project keys | Any DB connection string |
| Publishable Mapbox/Algolia search-only keys | OpenAI/Anthropic/Google model API keys |
| Public reCAPTCHA site key | Session/JWT signing secrets, SMTP creds, cloud IAM keys |

The right-hand column in a client bundle is **always P0**.

The left-hand column is only safe *because of a server-side control*: Stripe `pk_` is safe
because the server sets the amount; the Supabase `anon` key is safe **only if RLS is on**;
Firebase's config is safe **only if security rules are written**. So when you see a
left-column key, don't wave it through — go verify the control exists. If it doesn't, the
finding is the missing control, and it's P0. Hand off to `datastore-and-cloud-config`.

## Where to look

**Client bundles and client code.** Build the app if you can (`npm run build`) and grep the
output — that's ground truth, better than reading source. In source, the tells are framework
prefixes that mean "inline this into the browser": `NEXT_PUBLIC_`, `VITE_`, `REACT_APP_`,
`PUBLIC_`, `EXPO_PUBLIC_`, `NUXT_PUBLIC_`, `GATSBY_`. Every one of those wrapping a
right-column secret is a P0. Also check anything imported into a `"use client"` component,
`getStaticProps` output, and hydration payloads (`__NEXT_DATA__`, `window.__INITIAL_STATE__`).

**Git history.** Deleting a secret in a later commit does not remove it. Check the whole
history, not the working tree — and note that GitHub keeps orphaned commits reachable via the
API even after a force-push, so anything ever pushed to a public repo must be treated as
compromised forever.

**Committed files.** `.env`, `.env.local`, `.env.production`, `*.pem`, `*.key`, `*.p12`,
`serviceAccount*.json`, `credentials.json`, `.npmrc`, `.pypirc`, `.aws/`, `terraform.tfstate`
(this one holds plaintext secrets and gets committed constantly), `.vscode/settings.json`,
Postman/Insomnia exports, `docker-compose.yml` with inline passwords, and Jupyter notebooks —
`.ipynb` files store cell *output*, which routinely contains printed tokens.

**Logs and errors.** Full request objects logged on error (`console.error(req)`) dump auth
headers. Axios/fetch error objects include the request config with headers. Sentry and
similar capture request context — check for a scrubbing config. Verbose stack traces returned
to the client leak connection strings.

**API responses.** Serializing a whole DB row sends columns you forgot about:
`password_hash`, `stripe_customer_id`, `reset_token`, `internal_notes`. Covered in depth by
`api-abuse-and-rate-limits`, but flag it here when the leaked field is credential-shaped.

**CI and infra.** Secrets echoed in build logs, `env` dumped in a workflow step, secrets
passed as Docker `ARG` (they persist in image layers and `docker history` shows them),
Kubernetes manifests with base64 "secrets" (base64 is encoding, not encryption).

## Detection

Use dedicated tooling first — it has far better patterns than hand-rolled regex, and
`gitleaks` and `trufflehog` both scan history:

```bash
gitleaks detect --source . --redact -v
trufflehog filesystem . --results=verified,unknown
git log --all --full-history -- .env .env.local .env.production
```

Then grep for what tools miss — provider-specific prefixes are the highest-signal patterns:

```bash
# high-confidence provider prefixes
grep -rInE 'sk-[A-Za-z0-9_-]{20,}|sk_live_|rk_live_|xoxb-|xoxp-|ghp_|gho_|github_pat_|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|SG\.[A-Za-z0-9_-]{22}|-----BEGIN [A-Z ]*PRIVATE KEY-----' . \
  --exclude-dir={node_modules,.git,dist,build,.next,vendor}

# public-prefixed env vars wrapping something that shouldn't be public
grep -rInE '(NEXT_PUBLIC|VITE|REACT_APP|EXPO_PUBLIC|NUXT_PUBLIC|GATSBY)_[A-Z_]*(SECRET|KEY|TOKEN|PASSWORD|SERVICE_ROLE|PRIVATE|DSN|WEBHOOK)' . \
  --exclude-dir={node_modules,.git}

# the service_role / admin key mistake specifically
grep -rIn 'service_role\|SERVICE_ROLE\|serviceAccount\|admin\.initializeApp' . --exclude-dir={node_modules,.git}

# after building, grep the actual shipped output — this is the real test
grep -rIn 'sk-\|service_role\|BEGIN.*PRIVATE KEY' dist/ build/ .next/static/ 2>/dev/null
```

Triage the hits: a `sk-` string in a test fixture or a docs example is noise; the same string
in `dist/main.js` is a P0. Read the surrounding lines before writing anything up.

## Remediation — order matters

Fixing the code first is the classic mistake. The key is already out; the clock is running.

**1. Rotate first.** Revoke the old credential at the provider, mint a new one. If the secret
touched a public repo, CI log, or client bundle, assume it is known and rotate regardless of
whether you see evidence of abuse — scanners find public-repo keys within minutes of push.

**2. Check for abuse while rotating.** Provider usage dashboards, unexpected charges,
unfamiliar IPs, DB rows you didn't create, new OAuth grants, new IAM users. If a cloud key
leaked, look for spun-up compute — that's the usual crypto-mining payload.

**3. Then move it server-side.** The pattern for every model/payment/admin API:

```ts
// ✗ browser calls the provider directly — key ships to every visitor
const res = await fetch('https://api.openai.com/v1/chat/completions', {
  headers: { Authorization: `Bearer ${import.meta.env.VITE_OPENAI_KEY}` },
  ...
})

// ✓ browser calls your server; only your server holds the key
// app/api/chat/route.ts
export async function POST(req: Request) {
  const session = await auth()                       // who is this
  if (!session) return new Response('Unauthorized', { status: 401 })
  const { ok } = await rateLimit(session.user.id)    // and what's their budget
  if (!ok) return new Response('Rate limited', { status: 429 })

  const { messages } = await req.json()
  return openai.chat.completions.create({            // key stays in process env
    model: 'gpt-4o-mini',
    messages: validate(messages),                    // never forward raw client input
  })
}
```

A proxy without auth and rate limits is not a fix — it's a slightly slower way to lose the
same money. Route to `api-abuse-and-rate-limits`.

**4. Purge history only after rotating.** `git filter-repo` (or BFG) rewrites history, but it
does not un-ring the bell: forks, clones, caches, and GitHub's orphaned-commit API keep
copies. Rewriting is hygiene, not remediation. It also breaks every collaborator's clone, so
coordinate.

**5. Prevent recurrence.**
- `.gitignore`: `.env`, `.env.*`, `!.env.example`, `*.pem`, `*.key`, `serviceAccount*.json`
- Commit a `.env.example` with empty values so the shape is documented and the real file isn't.
- Add secret scanning to CI (`gitleaks` action) and a pre-commit hook so it fails locally.
- Turn on the provider's own alerts: GitHub push protection, AWS budget alarms, spend caps on
  every model provider.
- Scope keys down: read-only where possible, one key per environment, per-key spend limits.

## Report additions

Alongside the standard finding fields, secrets findings need:

- **Exposure window** — when it was committed/deployed and whether it was ever public.
- **Rotated?** — explicit yes/no per secret. This is the field that matters.
- **Abuse check** — what you looked at and what you saw.

Never paste the secret value into the report, chat, or commit message. Reference it by
location and prefix: `OPENAI_API_KEY (sk-proj-abc…) in src/lib/ai.ts:8`.
