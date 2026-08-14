---
name: auth-and-access-control
description: Audit authentication and authorisation — broken object-level authorisation (IDOR), missing ownership and tenant checks, client-side-only auth, JWT and session flaws, weak password reset flows, role escalation, and unprotected admin routes. Use whenever the app has user accounts, login, signup, roles, teams, organisations, or any per-user data, and whenever the user mentions auth, login, permissions, JWT, sessions, "can users see each other's data", multi-tenancy, or admin panels. This is the highest-yield check for any CRUD app — run it even if the user only asked about something else.
---

# Auth and access control

Broken access control is consistently the number one category in the OWASP Top 10, and it is
overwhelmingly the thing AI-assisted code gets wrong — because "fetch the order by id" is a
correct-looking, working, tested-by-hand line of code that happens to hand every order to
every user.

Authentication is *who you are*. Authorisation is *what you may touch*. Almost every app gets
the first right (a library does it) and the second wrong (nobody does it for you).

## The single highest-yield check: object-level authorisation

For **every** endpoint that accepts an identifier — path param, query param, body field,
form value — ask: *does anything verify this caller owns this object?*

```ts
// ✗ IDOR. Change the number in the URL, read anyone's invoice.
app.get('/api/invoices/:id', requireAuth, async (req, res) => {
  const invoice = await db.invoice.findUnique({ where: { id: req.params.id } })
  res.json(invoice)
})

// ✓ ownership is part of the query, not a separate check that can be forgotten
app.get('/api/invoices/:id', requireAuth, async (req, res) => {
  const invoice = await db.invoice.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  })
  if (!invoice) return res.status(404).end()   // 404, not 403 — don't confirm it exists
  res.json(invoice)
})
```

`requireAuth` being present is what makes this bug so easy to miss in review. It looks
protected. It is authenticated and unauthorised.

Work through the endpoint list from recon and mark each one. Every unmarked endpoint that
takes an ID is at minimum a **Likely P0** — verify by reading, don't assume a guard exists
somewhere. Pay special attention to:

- **Nested resources** — `/projects/:pid/tasks/:tid` often checks the project and not the task,
  or checks neither and trusts the join.
- **Bulk endpoints** — `POST /api/items/delete { ids: [...] }` where the filter is applied to
  one id but not the array.
- **Write paths** — PATCH/DELETE are checked less often than GET, and cost more when wrong.
- **Sequential integer IDs** — not a vulnerability by themselves, but they make discovery
  trivial. UUIDs are not authorisation either; they are just harder to guess.

**Multi-tenant apps:** the same bug at organisation level is worse. Every query needs the
tenant boundary, and the reliable pattern is to make it structurally impossible to forget —
a scoped client/repository that always injects `orgId`, or database row-level security, rather
than a rule that every developer must remember at every call site.

## Authorisation that lives in the wrong place

**Client-side-only checks.** `{user.isAdmin && <DeleteButton/>}` hides a button. It does not
protect the endpoint. Any check that exists only in React/Vue/Svelte is decoration — the API
must independently verify. Look for admin pages guarded by a `useEffect` redirect with no
server-side equivalent.

**Trusting client-supplied identity.** Any endpoint reading `userId`, `role`, `isAdmin`,
`orgId`, `plan`, or `price` from the request body or a header instead of the session is
P0 privilege escalation:

```ts
// ✗ the client decides who they are
const { userId, role } = req.body
// ✓ the server decides
const { id: userId, role } = await getSession(req)
```

**Mass assignment.** Spreading a request body into an update lets a user set fields you never
exposed — `role`, `credits`, `emailVerified`, `subscriptionTier`:

```ts
// ✗
await db.user.update({ where: { id }, data: { ...req.body } })
// ✓ allow-list, never deny-list
const { name, bio, avatarUrl } = req.body
await db.user.update({ where: { id }, data: { name, bio, avatarUrl } })
```

**Missing middleware coverage.** Check that route protection actually matches the routes that
exist — a `matcher` in Next.js middleware, a router-level guard, a decorator. The classic gap:
middleware covers `/dashboard/*` but the API routes under `/api/*` that the dashboard calls
are wide open, so the attacker skips the UI entirely.

**Unprotected non-obvious routes.** Admin panels on a "secret" path, `/api/debug`,
`/api/seed`, `/api/migrate`, `/api/cron/*` (call it manually — is it authenticated?), GraphQL
introspection, `/actuator`, `/_next/…` internals, health endpoints returning env details.

## Sessions and tokens

**JWTs.** Check the algorithm is pinned server-side (never trust the token's own `alg` header;
`none` and RS256→HS256 confusion are old bugs that keep reappearing in hand-rolled code).
Verify the signature is actually verified — `jwt.decode()` does not verify, `jwt.verify()`
does, and the two are one character apart. Check expiry is short, and understand that a JWT
cannot be revoked before expiry unless you maintain a denylist or check a session version on
each request. Never put anything secret in a JWT payload; it is base64, not encrypted. Never
store one in `localStorage` if you can use an `HttpOnly` cookie — localStorage is readable by
any XSS.

**Cookies.** `HttpOnly`, `Secure`, `SameSite=Lax` (or `Strict`), a sensible `Max-Age`, and
scoped `Path`/`Domain`. Detail in `security-headers-and-cookies`.

**Session lifecycle.** Rotate the session identifier on login (prevents fixation) and
invalidate on logout server-side, not just by deleting the client cookie. On password change
or reset, kill all other sessions — otherwise an attacker who already has a session keeps it
after the victim "secures" the account.

## Account lifecycle flows

These are where the interesting bugs live, because they are written once and rarely reviewed:

- **Password reset** — tokens must be random (CSPRNG, ≥128 bits), single-use, short-lived
  (≤1h), invalidated on use, and tied to the account. Never email the password. Never use a
  predictable token (timestamp, sequential, user id hash). Check the reset endpoint doesn't
  accept an arbitrary `email` alongside a valid token.
- **Email verification** — same token rules. Check whether an unverified account can do
  anything meaningful; if it can, verification is theatre.
- **Email change** — must re-authenticate and confirm at the *old* address too, otherwise
  session theft becomes permanent account takeover.
- **OAuth** — validate `state` (CSRF), use PKCE for public clients, pin `redirect_uri`
  exactly (open redirect here leaks tokens), and never link accounts on unverified email
  alone — that's account takeover by signing up with someone's address.
- **Password storage** — bcrypt/scrypt/argon2id only. Any `md5`, `sha1`, `sha256(password)`,
  or unsalted hash is P0. Check for a password length cap under 64 (a tell for a broken
  implementation) and for silent truncation with bcrypt at 72 bytes.
- **User enumeration** — "no account with that email" on login/reset/signup tells an attacker
  who your users are. Return the same message and roughly the same timing either way.
- **Brute force** — login, reset, and MFA endpoints need attempt limits and lockout/backoff.
  See `api-abuse-and-rate-limits`.

## Rolling your own

If the codebase implements its own session/password/token handling rather than using a
maintained library, that is a finding on its own (**P1** minimum, **P0** if you find a
concrete flaw). Recommend the ecosystem standard — Auth.js/NextAuth, Clerk, Supabase Auth,
Lucia, Devise, Django auth, Spring Security. The cost of migrating before launch is a day.
After launch it's a migration with live sessions.

## How to verify a fix

The reliable test is two accounts. Create user A and user B, take a resource ID from A, and
request it as B. Expect 404. Automate it — one parameterised test across every ID-taking
endpoint catches every future regression:

```ts
test.each(endpoints)('%s denies cross-account access', async (path) => {
  const res = await fetch(path.replace(':id', resourceOwnedByA), { headers: authAs(userB) })
  expect(res.status).toBe(404)
})
```

Do this against the user's own test accounts on their own environment — never against a
system the user hasn't shown they control.
