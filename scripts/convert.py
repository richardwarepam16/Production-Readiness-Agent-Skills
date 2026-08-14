#!/usr/bin/env python3
"""Convert Preflight SKILL.md files into other agents' rule formats.

    python3 scripts/convert.py --target cursor   --out .cursor/rules
    python3 scripts/convert.py --target copilot  --out .github/instructions
    python3 scripts/convert.py --target agents   --out .            # single AGENTS.md

The skill bodies are identical across targets; only the frontmatter wrapper changes.
"""
import argparse
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SKILLS = ROOT / "skills"

# Path globs so each agent loads the right guidance with the right code.
GLOBS = {
    "auth-and-access-control": "**/api/**,**/routes/**,**/server/**,**/middleware*",
    "injection-and-output-encoding": "**/api/**,**/db/**,**/models/**,**/*.sql",
    "api-abuse-and-rate-limits": "**/api/**,**/routes/**",
    "secrets-and-key-exposure": "**/.env*,**/config/**,**/*.config.*",
    "datastore-and-cloud-config": "**/*.rules,**/migrations/**,**/supabase/**,**/prisma/**",
    "security-headers-and-cookies": "**/middleware*,**/next.config.*,**/vercel.json",
    "accessibility-baseline": "**/*.tsx,**/*.jsx,**/*.vue,**/*.svelte,**/*.html",
    "file-uploads-and-ssrf": "**/upload*/**,**/api/**",
    "ai-and-llm-safety": "**/ai/**,**/llm/**,**/chat/**,**/api/**",
}


def parse(path: pathlib.Path):
    """Split a SKILL.md into (name, description, body)."""
    text = path.read_text(encoding="utf-8")
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.S)
    if not m:
        sys.exit(f"! {path} has no YAML frontmatter")
    fm, body = m.group(1), m.group(2).strip()

    name = re.search(r"^name:\s*(.+)$", fm, re.M)
    # description may wrap across indented continuation lines
    desc = re.search(r"^description:\s*(.+(?:\n[ \t]+.+)*)", fm, re.M)
    if not (name and desc):
        sys.exit(f"! {path} is missing name or description")
    return name.group(1).strip(), " ".join(desc.group(1).split()), body


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", required=True, choices=["cursor", "copilot", "agents"])
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    skills = sorted(SKILLS.glob("*/SKILL.md"))
    if not skills:
        sys.exit(f"! no skills found under {SKILLS}")

    if args.target == "agents":
        parts = [
            "# Agent instructions\n",
            "## Pre-production review\n",
            "Before any deploy, launch, or production-readiness question, follow the "
            "Preflight audit below. Every finding needs a file:line reference and an honest "
            "confidence label. Detect and fix — never write proof-of-concept exploits. "
            "Never claim the app is secure or legally compliant.\n",
        ]
        for path in skills:
            name, desc, body = parse(path)
            parts.append(f"\n---\n\n<!-- preflight:{name} — {desc} -->\n\n{body}\n")
        dest = out / "AGENTS.md"
        dest.write_text("\n".join(parts), encoding="utf-8")
        print(f"  wrote {dest} ({len(skills)} skills)")
        return

    for path in skills:
        name, desc, body = parse(path)
        globs = GLOBS.get(name, "")

        if args.target == "cursor":
            header = (
                "---\n"
                f"description: {desc}\n"
                f"globs: {globs}\n"
                "alwaysApply: false\n"
                "---\n\n"
            )
            dest = out / f"{name}.mdc"
        else:  # copilot
            applies = globs or "**"
            header = f'---\napplyTo: "{applies}"\n---\n\n<!-- {desc} -->\n\n'
            dest = out / f"{name}.instructions.md"

        dest.write_text(header + body + "\n", encoding="utf-8")
        print(f"  wrote {dest}")

    print(f"\n{len(skills)} skills converted for {args.target}.")


if __name__ == "__main__":
    main()
