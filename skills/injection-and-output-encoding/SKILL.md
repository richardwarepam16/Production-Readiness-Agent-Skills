---
name: injection-and-output-encoding
description: Find injection and unsafe-rendering flaws — SQL and NoSQL injection, XSS (stored, reflected, DOM-based), command and template injection, path traversal, prototype pollution, XXE, and unsafe deserialization — plus the missing input validation behind them. Use whenever the app queries a database, renders user-supplied content, runs shell commands, handles file paths, parses XML/YAML, or builds strings that end up in an interpreter. Trigger on any mention of SQL, queries, XSS, sanitising input, dangerouslySetInnerHTML, eval, or "is my input validation good enough".
---

# Injection and output encoding

Every injection bug is the same bug: data crossed into a place where it was read as code.
The fix is always structural separation, never cleverer filtering. Blocklists of dangerous
characters get bypassed; parameterised interfaces cannot be.

Two questions per suspicious site: **is any part of this string user-controlled?** and
**is it being parsed by something?** Both yes means fix it.

## SQL injection

Modern ORMs make the common path safe, which is exactly why the unsafe path hides well — it
appears where someone needed something the ORM didn't do neatly.

```bash
grep -rInE '\$queryRawUnsafe|\$executeRawUnsafe|sequelize\.query\(|knex\.raw\(|\.raw\(|execute\(f?["'"'"']|cursor\.execute' . --exclude-dir={node_modules,.git}
grep -rInE '(SELECT|INSERT|UPDATE|DELETE).{0,80}(\+|\|\||\$\{|%s.*%|f["'"'"'])' . --exclude-dir={node_modules,.git}
```

```ts
// ✗ string interpolation into SQL
const users = await db.$queryRawUnsafe(`SELECT * FROM users WHERE email = '${email}'`)
// ✓ parameterised — the driver keeps data and code apart
const users = await db.$queryRaw`SELECT * FROM users WHERE email = ${email}`
```

```python
# ✗
cursor.execute(f"SELECT * FROM users WHERE id = {user_id}")
# ✓
cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
```

**Parameters can't cover identifiers.** Table names, column names, and `ORDER BY` direction
cannot be bound — they must be validated against an allow-list. Dynamic sort is the most
common real-world SQLi in otherwise-clean codebases:

```ts
// ✗ ORDER BY ${req.query.sort}
const SORTABLE = { name: 'name', created: 'created_at' } as const
const col = SORTABLE[req.query.sort as keyof typeof SORTABLE] ?? 'created_at'
const dir = req.query.dir === 'asc' ? 'ASC' : 'DESC'
```

Also check: search/filter builders that concatenate conditions, `LIKE` patterns built from
input, `IN (...)` clauses joined from an array, and any admin "run a query" feature.

## NoSQL injection

Mongo takes objects, so a JSON body can smuggle operators. If `req.body.password` is
`{"$ne": null}`, `find({ password })` matches everything:

```js
// ✗
db.users.findOne({ email: req.body.email, password: req.body.password })
// ✓ coerce to the expected primitive, and validate the whole body first
db.users.findOne({ email: String(req.body.email), password: String(req.body.password) })
```

Check for `$where`, `mapReduce`, and `eval` with any interpolation — those run JavaScript
server-side. Schema validation at the edge (see below) fixes this class wholesale.

## XSS

**Stored** (saved then rendered to others) is worst — one payload, every viewer.
**Reflected** comes back in a response. **DOM-based** never touches the server.

React/Vue/Svelte escape by default, so look for the deliberate exits:

```bash
grep -rInE 'dangerouslySetInnerHTML|v-html|\{@html|innerHTML\s*=|outerHTML\s*=|insertAdjacentHTML|document\.write|\$\(.*\)\.html\(' . --exclude-dir={node_modules,.git}
grep -rInE '\beval\(|new Function\(|setTimeout\(["'"'"'`]|setInterval\(["'"'"'`]' . --exclude-dir={node_modules,.git}
```

If user content must render as HTML (rich text, markdown, an email preview), sanitise with a
maintained library on the server, allow-list mode:

```ts
import DOMPurify from 'isomorphic-dompurify'
const clean = DOMPurify.sanitize(userHtml, {
  ALLOWED_TAGS: ['p','b','i','em','strong','a','ul','ol','li','code','pre','blockquote','br'],
  ALLOWED_ATTR: ['href','title'],
  ALLOWED_URI_REGEXP: /^(?:https?|mailto):/i,
})
```

Never hand-roll `.replace(/<script>/g, '')` — it is bypassed by `<img onerror>`, `<svg>`,
nested tags, encoding tricks, and mutation XSS. Markdown renderers need `html: false`
(marked's `sanitize` option is deprecated and was never sufficient).

**Other XSS sinks that get missed:**
- `href={userUrl}` allows `javascript:` and `data:` — validate the scheme is http/https.
- Rendering user data into a `<script>` block or `JSON.parse('...')` — needs JS-context
  escaping, not HTML escaping. Serialize with a library that escapes `<`, `\u2028`, `\u2029`.
- SVG uploads rendered inline — SVG is a document format that executes script. See
  `file-uploads-and-ssrf`.
- Attribute injection where the value isn't quoted, and unescaped values in `style`.
- URLs and filenames echoed into error pages.

A Content-Security-Policy is a strong second layer that turns many XSS bugs into non-events —
but it is not a substitute for escaping. See `security-headers-and-cookies`.

## Command injection

```bash
grep -rInE 'child_process|exec\(|execSync\(|spawn\(.*shell:\s*true|os\.system|subprocess.*shell=True|`.*\$\{.*\}`.*exec' . --exclude-dir={node_modules,.git}
```

```js
// ✗ shell metacharacters in a filename become commands
exec(`convert ${filename} out.png`)
// ✓ no shell, args passed as an array
execFile('convert', [filename, 'out.png'])
```

`ffmpeg`, `imagemagick`, `pdftk`, `git`, and `yt-dlp` wrappers are the usual sites. Validate
the filename separately anyway — some tools interpret leading `-` as flags.

## Path traversal

```js
// ✗ ../../../../etc/passwd, or on Windows, ..\..\
res.sendFile(path.join(UPLOADS, req.params.name))
// ✓ resolve, then confirm the result is still inside the base
const target = path.resolve(UPLOADS, req.params.name)
if (!target.startsWith(path.resolve(UPLOADS) + path.sep)) return res.status(400).end()
```

Check zip extraction too — "zip slip" writes outside the target directory via `../` entries in
archive paths. Validate each entry before writing.

## Template and expression injection

User input compiled as a template runs code: Jinja2 `render_template_string`, Handlebars
`compile`, EJS, Pug, Thymeleaf, Freemarker. Data goes in the *context*, never in the template
source. Same for any expression evaluator (`vm.runInNewContext`, `mathjs.evaluate` without a
restricted scope).

## Prototype pollution, deserialization, XXE

- **Prototype pollution** — deep-merge/clone/`set(path, value)` helpers that let a key be
  `__proto__` or `constructor.prototype`. Reject those keys; prefer `Object.create(null)` for
  maps and `structuredClone`. Old `lodash.merge`/`set` versions are the classic vector.
- **Unsafe deserialization** — Python `pickle.loads`, `yaml.load` (use `yaml.safe_load`),
  Java `ObjectInputStream`, PHP `unserialize`, Node `node-serialize` on any untrusted bytes.
  All are remote code execution.
- **XXE** — XML parsers with external entities enabled. Disable DTDs and external entity
  resolution; use `defusedxml` in Python. Affects SVG, DOCX/XLSX, SOAP, and RSS ingestion.

## The structural fix: validate at the boundary

Most of the above collapses if every request is parsed into a typed shape before any handler
logic touches it. One schema per endpoint, applied to body, query, and params:

```ts
import { z } from 'zod'

const CreatePost = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().max(50_000),
  tags: z.array(z.string().regex(/^[a-z0-9-]{1,30}$/)).max(10),
  visibility: z.enum(['public', 'private']),
}).strict()          // .strict() rejects unknown keys — kills mass assignment too

export async function POST(req: Request) {
  const parsed = CreatePost.safeParse(await req.json())
  if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 })
  // parsed.data is now the only thing the rest of the handler may use
}
```

Report "no validation layer on any endpoint" as a single **P1** systemic finding rather than
one finding per endpoint — it is one decision, not forty bugs. Note the equivalents:
`pydantic` (Python), `valibot`/`yup` (JS), `class-validator` (Nest), Rails strong parameters,
Django forms/serializers.

Client-side validation is UX, not security. It must be duplicated server-side; anyone can
send a request that never touches your form.

## Verifying fixes without writing exploits

Prove the fix with a test, not a payload: assert that a request containing `' OR 1=1--` or
`<script>alert(1)</script>` is rejected with 400 or stored-and-rendered as literal text.
That demonstrates the control works, gives you a regression test, and leaves no exploit code
in the repo. Run any active scanning only against the user's own environment.
