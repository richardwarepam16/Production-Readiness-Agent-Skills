---
name: licensing-and-ip
description: Audit open-source license obligations and intellectual property risk — copyleft (GPL/AGPL) contamination in commercial products, missing attribution and NOTICE files, font and icon licensing, stock image and audio rights, AI-generated code provenance, trademark conflicts in the product name, and domain or brand collisions. Use before any commercial launch, before making a repo public, when the user asks about open-source licenses, AGPL, attribution, using a library commercially, or whether they can use a font, image, icon set, or name.
---

# Licensing and IP

Quiet, cheap to check, and expensive to discover late — a copyleft obligation found after
launch can mean publishing your source or rewriting a core dependency, and a trademark
conflict can cost you the name after you've built recognition on it.

This is an engineering checklist, not legal advice. Have a qualified lawyer review licensing
and trademark questions before a commercial launch.

## Dependency licenses

```bash
npx license-checker --production --summary
npx license-checker --production --onlyAllow "MIT;ISC;Apache-2.0;BSD-2-Clause;BSD-3-Clause;0BSD;CC0-1.0;Unlicense;Python-2.0"
pip-licenses --format=markdown ; go-licenses report ./... ; cargo-license
```

Scan the transitive tree, not just direct dependencies — the contaminating package is usually
four levels down.

**How to read the result:**

- **MIT / ISC / BSD / Apache-2.0 / Unlicense** — fine for commercial use. Apache-2.0 adds a
  patent grant and requires you to preserve NOTICE files and state changes.
- **LGPL** — usable if dynamically linked and the user can replace the library. Statically
  linked or bundled into a JS build, the analysis gets much harder. Flag for review.
- **GPL / GPL-3.0** — distributing your software with GPL code obliges you to release your
  source under GPL. A pure SaaS backend usually escapes because you aren't "distributing", but
  a desktop app, mobile app, CLI, or anything shipped to a user's machine does not. **Note
  that a bundled frontend is shipped to the user.**
- **AGPL-3.0** — closes the SaaS gap deliberately: network use counts as distribution. An AGPL
  package in a closed-source SaaS backend means either open-sourcing your service, buying a
  commercial license, or removing it. This is the single most consequential finding in this
  skill, and it's easy to hit — several popular tools use AGPL precisely to drive commercial
  licensing.
- **SSPL / BUSL / Elastic / "source available"** — not open source, restrictions vary, and
  several specifically prohibit offering the product as a service. Read the actual terms.
- **"UNLICENSED" / no license field** — no permission granted at all. Default copyright means
  you may not use it. Ask the author or drop it.
- **Custom or dual licenses** — read them; "free for non-commercial use" is common and fatal
  for a startup.

Set a CI gate with an allow-list once you've triaged, so the next contaminating dependency is
caught at PR time rather than during diligence.

## Attribution

MIT, BSD, and Apache all require the copyright notice to be preserved in distributions. For a
web app, ship a `/licenses` page or an `ACKNOWLEDGEMENTS` file generated from the dependency
tree — `license-checker --production --out licenses.txt` gets you most of the way. Apache-2.0
NOTICE files must be reproduced. Mobile apps should use the platform's standard
acknowledgements screen. This is low-effort and it is a real obligation.

## Assets

Assets are where solo builders get caught, because copying a file feels different from
installing a package even though the legal analysis is stricter.

- **Fonts** — desktop licenses don't cover web embedding, and web licenses are often capped by
  monthly pageviews. Adobe Fonts and Google Fonts have very different terms. Self-hosting a
  font you found as a `.ttf` on a download site is a straightforward infringement, and font
  foundries actively pursue it. Check every `@font-face`.
- **Icons** — many popular sets (including some Font Awesome tiers and most Flaticon assets)
  require attribution or a paid license for commercial use. Lucide, Heroicons, Feather, and
  Bootstrap Icons are MIT and safe.
- **Images and video** — "found on Google" is not a license. Unsplash and Pexels are broadly
  permissive but have terms (no reselling the photo itself, restrictions on identifiable
  people). Stock licenses distinguish editorial from commercial use.
- **Audio** — background music in a demo video needs sync rights. This is what gets launch
  videos taken down.
- **Code from Stack Overflow / blogs** — SO answers are CC BY-SA, which nominally requires
  attribution and imposes share-alike. Small snippets are generally treated as de minimis;
  a copied 200-line implementation is not.
- **Screenshots of other products** in marketing may implicate their trademarks — comparative
  use is usually fine, implying endorsement is not.

## AI-generated code

If substantial parts were written by an AI assistant, note two things without overstating
either. First, provenance: models can reproduce training data near-verbatim, which is a
practical risk for distinctive, long, or well-known implementations — some tools offer
reference-matching filters worth enabling. Second, copyright status: purely machine-generated
work may not be protectable in some jurisdictions (notably the US), which matters if you plan
to enforce rights or if an acquirer asks. Neither is a reason to avoid AI assistance; both are
reasons to know where you stand and to keep human authorship over the distinctive parts.

## Name and trademark

Before you print stickers, spend twenty minutes:

- Search USPTO TESS, EUIPO, and your local registry for the exact name and near-misses **in
  your class** (software is usually class 9 and 42).
- Check npm/PyPI/crates for a package with the name, the .com and social handles, and app
  store listings.
- Avoid names that incorporate another company's mark — `SlackSync`, `GPT-anything`,
  `Notion-something`. Many vendors' brand guidelines forbid it outright, and it's the cheapest
  possible cease-and-desist for them to send.

A conflict found now costs a rename. Found in eighteen months, it costs the rename plus every
link, mention, and integration you've built.

## Your own repo

If the repo is public, it needs a `LICENSE` file — without one, nobody has permission to use
your code, which is probably not what you intended. Contributions from others without a CLA or
DCO can complicate a future relicense or acquisition. And before flipping a private repo
public, run `secrets-and-key-exposure` over the full git history first — that combination is
its own well-worn disaster.

## Output

Report as: **blocking** (copyleft in a shipped product, unlicensed dependency, infringing
font), **needs a decision** (ambiguous license, trademark near-miss), **housekeeping**
(missing attribution page, no LICENSE file). Name the specific package or asset every time —
"review your licenses" is useless advice.
