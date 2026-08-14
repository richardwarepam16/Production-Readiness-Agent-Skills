---
name: file-uploads-and-ssrf
description: Audit file uploads and server-side request forgery — unvalidated file types and sizes, dangerous SVG and HTML uploads, path traversal in filenames, zip slip, image and PDF parser exploits, missing malware scanning, and any server-side fetching of user-supplied URLs including webhooks, link previews, avatar imports, and cloud metadata access. Use whenever the app accepts file uploads, avatars, imports, or attachments, or fetches URLs the user provides. Trigger on mentions of multer, presigned URLs, image processing, thumbnails, PDF generation, link previews, or webhook delivery.
---

# File uploads and SSRF

Two features that both hand an attacker partial control of what your server does: uploads let
them put bytes on your infrastructure, and URL fetching lets them make your server issue
requests from inside your network.

## Uploads

### Validate what it is, not what it's called

Extension and `Content-Type` both come from the client and both are trivially forged. Check
magic bytes, and cross-check against the claimed extension:

```ts
import { fileTypeFromBuffer } from 'file-type'

const ALLOWED = new Map([
  ['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp'], ['application/pdf', 'pdf'],
])

const type = await fileTypeFromBuffer(buf)          // reads the actual bytes
if (!type || !ALLOWED.has(type.mime)) throw new BadRequest('Unsupported file type')
```

Allow-list, never deny-list — a deny-list of `.php`, `.exe`, `.sh` misses `.phtml`, `.jsp`,
`.svg`, `.html`, `.htaccess`, and whatever the next one is.

### Never trust the filename

Generate your own: `${crypto.randomUUID()}.${ext}` where `ext` comes from the detected type.
That removes path traversal (`../../../etc/cron.d/x`), null bytes, double extensions
(`invoice.pdf.php`), Unicode right-to-left override tricks, and collisions in one move. Keep
the original name as a display-only string in the database if users need it, escaped on render.

### Limits and cost

Cap size at the edge, before the body is buffered — `express.json({ limit })`, nginx
`client_max_body_size`, the platform's own limit. Cap the count per request and per user per
hour. Cap total storage per account. Decompression bombs deserve their own check: a 1MB zip
that expands to 40GB fills the disk, and image parsers have the same issue — set pixel and
dimension limits before decoding (`sharp` has `limitInputPixels`).

### The dangerous formats

- **SVG is executable.** It can contain `<script>` and event handlers, so serving a
  user-uploaded SVG inline is stored XSS. Either rasterise on upload, or sanitise with DOMPurify
  in SVG mode, or serve with `Content-Disposition: attachment` from another origin. Treating it
  as "just an image" is the mistake.
- **HTML/SVG/PDF served from your app's origin** run in your origin's context — cookies, CSP,
  same-origin requests. Serve user files from a separate domain (`usercontent-yourapp.com`),
  always with `X-Content-Type-Options: nosniff` and an explicit `Content-Type`.
- **Office documents and PDFs** carry macros and JavaScript. If you render or parse them,
  you're exposing a large C parser to hostile input.
- **Image parsers** (ImageMagick, libwebp, ffmpeg) have a long CVE history — ImageTragick and
  the 2023 libwebp bug were both remote code execution from an image. Keep them patched, run
  processing in a sandbox or separate worker where practical, and prefer `sharp` (libvips)
  over shelling out to ImageMagick.
- **Zip slip** — validate every archive entry path resolves inside the destination before
  writing, and reject symlinks in archives.

### Storage and access

Store outside the web root, or in object storage — never in a directory the server will
execute from. Presign uploads directly to S3/R2 so files never touch your app server, but
constrain the presigned policy: content-type, max size, key prefix, and a short expiry.
Authorise downloads rather than relying on unguessable URLs, unless the file is genuinely
public. Malware scanning (ClamAV, or a vendor) matters most when users download each other's
files — otherwise you're a distribution channel.

## SSRF

Any server-side fetch of a URL the user supplied: link previews and unfurling, "import from
URL", avatar-by-URL, webhook delivery, PDF-from-URL rendering, RSS ingestion, OAuth discovery
documents, integration configuration, headless-browser screenshotting.

The prize is usually the cloud metadata endpoint. On an unprotected instance,
`http://169.254.169.254/latest/meta-data/iam/security-credentials/` returns IAM credentials —
one SSRF becomes full cloud account compromise. Internal admin panels, Redis, Elasticsearch,
and `localhost` services are the other targets.

**Blocklists don't work here.** `127.0.0.1` has many spellings — `localhost`, `0.0.0.0`,
`127.1`, `2130706433` (decimal), `0x7f000001` (hex), `[::1]`, `[::ffff:127.0.0.1]`, a
DNS name that resolves to a private IP, a redirect to a private IP after passing your check,
and DNS rebinding where the address changes between validation and connection.

What actually works, in decreasing order of reliability:

1. **Send the traffic somewhere that can't reach anything.** A dedicated egress proxy or a
   network with no route to private ranges or metadata. This is the only defence that survives
   redirects and rebinding, because it doesn't depend on parsing the URL correctly.
2. **Allow-list destination hosts** where the use case permits it (a fixed set of integration
   partners).
3. **Validate carefully** if you must: parse the URL, require `https`, resolve the hostname,
   reject every private/loopback/link-local/reserved range (including IPv6 and IPv4-mapped
   IPv6), then **connect to the resolved IP** with the `Host` header set — this closes the
   rebinding gap. Disable redirect following, or re-validate each hop.

Regardless of approach: short timeouts, a response size cap, no credentials or internal
headers on the outbound request, and don't return the raw response body to the user (that
turns blind SSRF into a readable internal-network proxy). On AWS, enforce IMDSv2 — it requires
a PUT with a token, which most SSRF primitives can't produce.

```ts
const res = await fetch(url, {
  redirect: 'manual',
  signal: AbortSignal.timeout(5000),
  headers: { 'User-Agent': 'YourApp/1.0' },
})
```

## Outbound webhooks

Your own webhook sender is an SSRF engine users configure themselves. Same protections, plus:
sign your payloads (HMAC with a per-endpoint secret and a timestamp) so receivers can verify
you, cap retries with backoff so a dead endpoint doesn't become a self-inflicted flood, and
don't include more data in the payload than the receiver needs.
