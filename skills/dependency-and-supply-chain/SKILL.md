---
name: dependency-and-supply-chain
description: Audit third-party dependencies and the build pipeline — known CVEs, unpinned or missing lockfiles, abandoned packages, typosquats and hallucinated package names, risky postinstall scripts, unpinned CI actions, over-permissioned workflow tokens, and vulnerable base images. Use before any production deploy, whenever the user mentions npm audit, Dependabot, CVEs, vulnerable packages, updating dependencies, or a supply-chain warning, and whenever a lockfile is missing or months out of date.
---

# Dependency and supply chain

Most of an app is other people's code, plus a pipeline with credentials that can push to
production. Both are attack surface, and both are cheap to check.

The trap in this area is noise. `npm audit` on a fresh React app reports dozens of
"vulnerabilities", nearly all in build tooling with no runtime path. Reporting that raw number
teaches people to ignore the tool forever. Triage before you report.

## Scanning

```bash
npm audit --omit=dev --audit-level=high     # runtime deps only — the ones that matter
pnpm audit --prod ; yarn npm audit --environment production
pip-audit ; safety check
bundle audit check --update
govulncheck ./...        # Go: reports only vulns actually reachable in your code
cargo audit
osv-scanner --recursive .   # multi-ecosystem, good default
```

`govulncheck`'s reachability analysis is the model to aim for: a CVE in a function nobody
calls is not an emergency.

## Triaging a CVE

Four questions, in order:

1. **Is it a runtime dependency, or only in dev/build?** Dev-only issues matter mainly if the
   build machine itself is a target (it often is — it holds deploy credentials — but the
   severity is different).
2. **Is the vulnerable code path reachable?** A ReDoS in a parser you never feed untrusted
   input to isn't your top problem.
3. **Does the attack vector match your deployment?** Many CVEs need local access or a
   configuration you don't use.
4. **Is there a fix?** If yes, upgrade — usually cheaper than debating. If no, look for a
   maintained fork, a workaround, or removing the dependency.

Report the handful that are genuinely reachable at their real severity, then one summary line:
"27 further advisories, all dev-only/unreachable — run `npm audit` for the list." That's an
honest report someone will act on.

## Lockfiles

A missing lockfile means every install resolves differently, so what you tested is not
necessarily what you shipped, and a compromised patch release lands automatically.

- Lockfile committed (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `poetry.lock`,
  `Gemfile.lock`, `Cargo.lock`, `go.sum`). Missing = **P1**.
- CI installs with `npm ci` / `pnpm install --frozen-lockfile` / `pip install -r
  requirements.txt --require-hashes`, not `npm install` — the latter can silently update the
  lockfile mid-build.
- Watch for `"dependency": "*"` or `latest`. Caret ranges are normal and fine *given* a
  lockfile; without one they're a liability.

## Package trust

AI-generated code introduces a failure mode worth checking deliberately: **hallucinated
package names**. A model suggests `import { parse } from 'json-parser-utils'`, the name
doesn't exist, and an attacker registers it — "slopsquatting". For every dependency you don't
recognise, check it actually exists on the registry with a plausible history.

Also worth a look:

- **Typosquats** — `expres`, `lodahs`, `crossenv`, `python-dateutil` vs `dateutil`. Compare
  against what's imported and what the docs of the real thing say.
- **Abandoned packages** — no release in 2+ years, archived repo, open critical issues. Not
  automatically a vulnerability, but it means nobody will fix the next one. P2 for anything
  in the auth/crypto/parsing path.
- **Weight** — a single-function dependency is a supply-chain risk with no upside. `left-pad`
  is the joke; the principle holds.
- **Install scripts** — `postinstall`/`preinstall` run arbitrary code on every `npm install`,
  including on your laptop and your CI runner. `npm install --ignore-scripts` by default (with
  an allow-list for the few that genuinely need it, like `esbuild`) is a meaningful hardening.

```bash
grep -rl '"postinstall"\|"preinstall"\|"prepare"' node_modules/*/package.json 2>/dev/null | head -50
```

## The pipeline

CI has production credentials, so it is production for threat-modelling purposes.

- **Pin actions by commit SHA**, not tag: `actions/checkout@v4` is a mutable pointer, and the
  `tj-actions/changed-files` compromise showed exactly how that plays out — a retagged action
  exfiltrating secrets from thousands of repos.
- **`pull_request_target` with a checkout of the PR head** runs untrusted code with secrets in
  scope. This is the highest-severity CI misconfiguration and it looks innocuous.
- **Least-privilege tokens** — set `permissions: contents: read` at the workflow level and
  grant more only where needed. The default is often write.
- **No secrets in logs** — `set -x`, `env`, or printing a curl command with a token in it.
  GitHub masks known secret values, not derived ones.
- **Branch protection** on the deploy branch, required review, and a way to roll back.
- **Docker**: pin base images by digest, don't run as root, don't pass secrets as `ARG`
  (they're recoverable from image layers), use multi-stage builds so build-time credentials and
  source don't ship, and scan the final image (`trivy image`, `docker scout`).

## Keeping it fixed

- Turn on Dependabot or Renovate with automerge for patch-level updates on dev dependencies —
  the mechanism only helps if it doesn't require a human every week.
- `npm audit --omit=dev --audit-level=high` as a CI gate. Choose a threshold that will
  actually hold; a gate everyone bypasses is worse than none.
- Generate an SBOM (`syft`, `cyclonedx`) if you sell to businesses — enterprise procurement
  increasingly asks, and it's a one-line addition to the build.
- Add `osv-scanner` or `trivy fs` to CI for cross-ecosystem coverage.

## Also check licenses

Dependency review is the natural moment to catch an AGPL package in a closed-source SaaS,
which is a legal problem rather than a security one. That's `licensing-and-ip` — run it in the
same pass while the dependency tree is already in front of you.
