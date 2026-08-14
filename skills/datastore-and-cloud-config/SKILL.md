---
name: datastore-and-cloud-config
description: Audit database and cloud configuration for exposure — Supabase row-level security, Firebase/Firestore security rules, public S3/R2/GCS buckets, internet-reachable databases, default credentials, over-permissive IAM, missing backups, unencrypted PII at rest, and tenant isolation. Use whenever the app uses Supabase, Firebase, Appwrite, PocketBase, MongoDB Atlas, Postgres, S3/R2/GCS/Blob storage, or any backend-as-a-service the browser talks to directly. Trigger on any mention of RLS, security rules, buckets, "my database is public", storage permissions, or BaaS platforms.
---

# Datastore and cloud config

The defining risk of the backend-as-a-service era: with a traditional server, the database is
unreachable from the internet and every query passes through your code. With Supabase or
Firebase, the browser talks to the database directly, and **the security rules are the entire
access control layer**. If they're off or permissive, the app has no authorisation at all —
regardless of how careful the application code is.

This has produced a long series of public incidents where every user's records were readable
by anyone with the app's own public key. Check it first, and check it directly.

## Supabase

**Row-level security is the whole game.** The `anon` key is public by design; it is safe only
because RLS restricts what it can reach. Enumerate every table and confirm RLS is enabled
*and* that policies exist — a table with RLS enabled and zero policies denies everything
(safe but broken), while RLS disabled means the anon key reads and writes everything (P0).

```sql
-- run in the SQL editor: any row with rowsecurity = false on a real table is a P0
select schemaname, tablename, rowsecurity
from pg_tables where schemaname = 'public' order by rowsecurity, tablename;

-- and the policies that exist
select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies where schemaname = 'public' order by tablename;
```

What to look for in the policies themselves:

- `using (true)` on SELECT means public read. Sometimes intended (a blog), usually not.
- **A `USING` clause without `WITH CHECK`** on INSERT/UPDATE. `USING` filters what rows you
  can see and modify; `WITH CHECK` constrains what you can write. Without it, a user can
  update a row to belong to someone else. This is the most-missed Supabase bug.
- Policies written for `authenticated` but the table also grants `anon`.
- `auth.uid()` compared against a column the user controls.
- Storage buckets: public vs private, and separate RLS policies on `storage.objects`. A
  "private" bucket with no object policy is not private.
- Realtime subscriptions respect RLS only when RLS is on — otherwise they stream everything.
- Postgres functions marked `SECURITY DEFINER` bypass RLS by design. Every one needs review,
  and needs `set search_path = ''` to avoid search-path hijacking.
- Views: pre-PG15 they run as owner and can leak past RLS. Use `security_invoker = on`.

Also check the `service_role` key never reaches the client (see `secrets-and-key-exposure`),
that email confirmations are on before launch, and that the JWT secret hasn't been shared.

## Firebase / Firestore

The web `apiKey` is an identifier, not a secret — don't report it as a leak. The security
rules are the control. Test-mode rules expire but people extend them and forget:

```
// ✗ P0 — anyone with the (public) config reads and writes your whole database
match /{document=**} { allow read, write: if true; }

// ✗ still wrong — any logged-in user, including one who just signed themselves up,
// can read and write every other user's documents
match /{document=**} { allow read, write: if request.auth != null; }

// ✓ ownership enforced per collection, with writes validated
match /users/{userId} {
  allow read:   if request.auth != null && request.auth.uid == userId;
  allow update: if request.auth != null && request.auth.uid == userId
                && !request.resource.data.diff(resource.data).affectedKeys()
                     .hasAny(['role', 'credits', 'plan']);
}
```

Key points: rules do not cascade to subcollections unless you use `{document=**}`; `list`
differs from `get`, so an unconstrained `list` dumps a collection even when `get` looks fine;
validate `request.resource.data` on writes or clients set any field they like; Storage rules
are a separate ruleset (check file size and content-type constraints there); and Cloud
Functions run with admin privileges and bypass rules entirely, so each one needs its own auth
check. Use the Rules Playground and the emulator's unit tests to verify.

## Object storage (S3, R2, GCS, Azure Blob)

- **Public buckets.** Check Block Public Access is on and the bucket policy/ACL doesn't grant
  `AllUsers`/`AuthenticatedUsers`. `AuthenticatedUsers` in S3 means *any AWS account*, which
  surprises people.
- **Directory listing enabled** turns one guessable filename into the whole dataset.
- **Presigned URLs** — short expiry, method-scoped, and not logged anywhere public. A
  presigned URL in a shared log or a Referer header is a leaked file.
- **User uploads served from the same origin** as the app inherit its cookies and CSP context.
  Serve untrusted files from a separate domain, with `Content-Disposition: attachment` and
  `X-Content-Type-Options: nosniff`.
- **Predictable object keys** (`/uploads/1.jpg`, `/invoices/2024-03.pdf`) allow enumeration.
  Use random keys, and authorise downloads rather than relying on unguessability.
- Encryption at rest on, versioning on for anything you'd cry about losing.

## Databases you manage yourself

- Not reachable from `0.0.0.0/0`. Check security groups, `pg_hba.conf`, MongoDB's `bindIp`,
  Redis (`protected-mode`, `requirepass` — open Redis instances are found and wiped within
  hours), and Elasticsearch (historically no auth at all by default).
- No default or absent credentials. No shared superuser for the app — the app's user should
  not be able to `DROP TABLE` or read other databases.
- TLS on the connection, not just at the load balancer.
- Admin tooling (pgAdmin, Adminer, phpMyAdmin, Mongo Express) not exposed publicly. These get
  found by scanners immediately.

## Data at rest and tenancy

- Which columns hold sensitive personal data, and are any encrypted at column level? Full disk
  encryption protects against a stolen drive, not against a leaked query. Health, financial,
  government-ID, and biometric data usually warrant more.
- Tokens and secrets stored in the DB (OAuth refresh tokens, API keys you issue) should be
  hashed or encrypted, not plaintext. Password reset tokens: store a hash, compare hashes.
- **Tenant isolation** — if one customer's data can be reached by another via a missing
  `orgId` filter, that is P0 and it's usually a systemic pattern rather than one endpoint.
  Prefer a mechanism that can't be forgotten (RLS, a scoped client) over per-query discipline.

## Backups

Not glamorous, and the reason some of these apps never recover. Confirm: backups exist, run
automatically, are stored separately from the primary (a backup in the same account that a
compromised key can delete is not a backup), have a defined retention, and — the part nobody
does — **have been restored at least once**. An untested backup is a hypothesis.

Point-in-time recovery matters more than daily snapshots for anything transactional, because
the common disaster isn't a dead disk, it's a bad migration or an accidental `DELETE` at 2pm.

## Verifying

Much of this needs console access, so mark it **needs human check** and give the user the
exact queries and console paths above rather than guessing from the code. The one thing you
can verify from the repo: committed rule files (`firestore.rules`, `storage.rules`,
`supabase/migrations/*.sql`) and whether policies exist there at all. If rules aren't in the
repo, that's a finding in itself — security rules that live only in a web console are
unreviewable, untestable, and undeployable.
