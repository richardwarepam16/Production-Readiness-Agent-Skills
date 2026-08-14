#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const SOURCE_ROOT = path.join(__dirname, '..');
const SOURCE_SKILLS = path.join(SOURCE_ROOT, 'skills');
const SOURCE_SHARED = path.join(SOURCE_ROOT, 'shared');
const SOURCE_CHECKLISTS = path.join(SOURCE_ROOT, 'checklists');

const TARGETS = ['claude', 'cursor', 'copilot', 'agents'];

// Path globs so each agent loads the right guidance with the right code (mirrors scripts/convert.py).
const GLOBS = {
  'auth-and-access-control': '**/api/**,**/routes/**,**/server/**,**/middleware*',
  'injection-and-output-encoding': '**/api/**,**/db/**,**/models/**,**/*.sql',
  'api-abuse-and-rate-limits': '**/api/**,**/routes/**',
  'secrets-and-key-exposure': '**/.env*,**/config/**,**/*.config.*',
  'datastore-and-cloud-config': '**/*.rules,**/migrations/**,**/supabase/**,**/prisma/**',
  'security-headers-and-cookies': '**/middleware*,**/next.config.*,**/vercel.json',
  'accessibility-baseline': '**/*.tsx,**/*.jsx,**/*.vue,**/*.svelte,**/*.html',
  'file-uploads-and-ssrf': '**/upload*/**,**/api/**',
  'ai-and-llm-safety': '**/ai/**,**/llm/**,**/chat/**,**/api/**',
};

function parseArgs(argv) {
  const args = { target: null, dest: process.cwd(), force: false, yes: false, checklist: true, help: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--force' || a === '-f') args.force = true;
    else if (a === '--yes' || a === '-y') args.yes = true;
    else if (a === '--no-checklist') args.checklist = false;
    else if (a === '--target') args.target = argv[++i];
    else if (a.startsWith('--target=')) args.target = a.slice('--target='.length);
    else if (a === '--dest') args.dest = path.resolve(argv[++i]);
    else if (a.startsWith('--dest=')) args.dest = path.resolve(a.slice('--dest='.length));
    else rest.push(a);
  }
  args.command = rest[0] || 'add';
  return args;
}

function printHelp() {
  console.log(`
Preflight — pre-launch security/privacy/legal audit skills

Usage:
  npx github:richardwarepam16/Production-Readiness-Agent-Skills add [options]

Options:
  --target <claude|cursor|copilot|agents|all>   Which agent to install for (asked if omitted)
  --dest <path>                                 Project directory to install into (default: cwd)
  --force                                       Overwrite existing files
  --yes                                         Skip prompts (defaults target to "claude")
  --no-checklist                                Skip copying checklists/pre-launch-master.md
  --help                                        Show this help
`);
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); }));
}

async function pickTarget(args) {
  if (args.target) return args.target.toLowerCase();
  if (args.yes || !process.stdin.isTTY) return 'claude';

  const dest = args.dest;
  const guesses = [];
  if (fs.existsSync(path.join(dest, '.claude'))) guesses.push('claude');
  if (fs.existsSync(path.join(dest, '.cursor'))) guesses.push('cursor');
  if (fs.existsSync(path.join(dest, '.github'))) guesses.push('copilot');

  console.log('Which agent are you installing for?');
  console.log('  1) Claude Code / Claude Cowork             (.claude/skills/)');
  console.log('  2) Cursor                                  (.cursor/rules/)');
  console.log('  3) GitHub Copilot                          (.github/instructions/)');
  console.log('  4) Windsurf / Cline / Zed / Aider / other  (AGENTS.md)');
  console.log('  5) All of the above');
  const map = { '1': 'claude', '2': 'cursor', '3': 'copilot', '4': 'agents', '5': 'all' };
  const def = guesses[0] ? String(TARGETS.indexOf(guesses[0]) + 1) : '1';
  const answer = await ask(`> [${def}] `);
  return map[answer] || map[def];
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function copyFileSafe(src, dest, opts) {
  if (fs.existsSync(dest) && !opts.force) {
    console.log(`  skip (exists): ${path.relative(process.cwd(), dest)}`);
    return;
  }
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
  console.log(`  wrote ${path.relative(process.cwd(), dest)}`);
}

function copyDirSafe(src, dest, opts) {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirSafe(s, d, opts);
    else copyFileSafe(s, d, opts);
  }
}

function writeTextSafe(dest, content, opts) {
  if (fs.existsSync(dest) && !opts.force) {
    console.log(`  skip (exists): ${path.relative(process.cwd(), dest)}`);
    return;
  }
  ensureDir(path.dirname(dest));
  fs.writeFileSync(dest, content, 'utf8');
  console.log(`  wrote ${path.relative(process.cwd(), dest)}`);
}

function appendOrCreate(file, block, opts, headerIfNew, marker) {
  if (fs.existsSync(file)) {
    const existing = fs.readFileSync(file, 'utf8');
    if (existing.includes(marker)) {
      console.log(`  skip (already present): ${path.relative(process.cwd(), file)}`);
      return;
    }
    fs.appendFileSync(file, '\n' + block, 'utf8');
    console.log(`  appended to ${path.relative(process.cwd(), file)}`);
    return;
  }
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, (headerIfNew || '') + block, 'utf8');
  console.log(`  wrote ${path.relative(process.cwd(), file)}`);
}

function listSkills() {
  return fs.readdirSync(SOURCE_SKILLS, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

function parseSkill(dirName) {
  const file = path.join(SOURCE_SKILLS, dirName, 'SKILL.md');
  const text = fs.readFileSync(file, 'utf8');
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`${file} has no YAML frontmatter`);
  const [, fm, bodyRaw] = m;
  const nameMatch = fm.match(/^name:\s*(.+)$/m);
  const descMatch = fm.match(/^description:\s*(.+(?:\n[ \t]+.+)*)/m);
  if (!nameMatch || !descMatch) throw new Error(`${file} is missing name or description`);
  return {
    name: nameMatch[1].trim(),
    description: descMatch[1].replace(/\s+/g, ' ').trim(),
    body: bodyRaw.trim(),
  };
}

// The orchestrator's body says "shared/severity-rubric.md" etc, assuming shared/ is a
// sibling of skills/. Once shared/ lands somewhere else, patch that one file's links.
function rewriteSharedLinks(file, prefix) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, text.replace(/shared\//g, prefix), 'utf8');
}

function installClaude(dest, opts) {
  const skillsDest = path.join(dest, '.claude', 'skills');
  console.log(`\nInstalling for Claude Code -> ${path.relative(dest, skillsDest) || '.claude/skills'}`);
  copyDirSafe(SOURCE_SKILLS, skillsDest, opts);
  copyDirSafe(SOURCE_SHARED, path.join(skillsDest, 'shared'), opts);
  rewriteSharedLinks(path.join(skillsDest, 'preflight-audit', 'SKILL.md'), '../shared/');
}

function installCursor(dest, opts) {
  const rulesDest = path.join(dest, '.cursor', 'rules');
  console.log(`\nInstalling for Cursor -> ${path.relative(dest, rulesDest) || '.cursor/rules'}`);
  for (const dirName of listSkills()) {
    const skill = parseSkill(dirName);
    const globs = GLOBS[skill.name] || '';
    const header = `---\ndescription: ${skill.description}\nglobs: ${globs}\nalwaysApply: false\n---\n\n`;
    writeTextSafe(path.join(rulesDest, `${skill.name}.mdc`), header + skill.body + '\n', opts);
  }
  copyDirSafe(SOURCE_SHARED, path.join(rulesDest, 'shared'), opts);
}

function installCopilot(dest, opts) {
  const instrDest = path.join(dest, '.github', 'instructions');
  console.log(`\nInstalling for GitHub Copilot -> ${path.relative(dest, instrDest) || '.github/instructions'}`);
  for (const dirName of listSkills()) {
    const skill = parseSkill(dirName);
    const globs = GLOBS[skill.name] || '';
    const applies = globs || '**';
    const header = `---\napplyTo: "${applies}"\n---\n\n<!-- ${skill.description} -->\n\n`;
    writeTextSafe(path.join(instrDest, `${skill.name}.instructions.md`), header + skill.body + '\n', opts);
  }
  copyDirSafe(SOURCE_SHARED, path.join(instrDest, 'shared'), opts);
}

function installAgents(dest, opts) {
  console.log('\nInstalling for Windsurf / Cline / Zed / Aider / other -> AGENTS.md');
  const parts = [
    '## Pre-production review\n',
    'Before any deploy, launch, or production-readiness question, follow the Preflight audit ' +
      'below. Every finding needs a file:line reference and an honest confidence label. Detect ' +
      'and fix — never write proof-of-concept exploits. Never claim the app is secure or legally ' +
      'compliant.\n',
  ];
  for (const dirName of listSkills()) {
    const skill = parseSkill(dirName);
    parts.push(`\n---\n\n<!-- preflight:${skill.name} — ${skill.description} -->\n\n${skill.body}\n`);
  }
  copyDirSafe(SOURCE_SHARED, path.join(dest, 'shared'), opts);
  appendOrCreate(
    path.join(dest, 'AGENTS.md'),
    parts.join('\n'),
    opts,
    '# Agent instructions\n\n',
    '<!-- preflight:preflight-audit'
  );
}

function installChecklist(dest, opts) {
  copyDirSafe(SOURCE_CHECKLISTS, path.join(dest, 'checklists'), opts);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (args.command !== 'add') {
    printHelp();
    process.exitCode = 1;
    return;
  }

  const target = await pickTarget(args);
  const opts = { force: args.force };
  const runners = { claude: installClaude, cursor: installCursor, copilot: installCopilot, agents: installAgents };

  console.log('Preflight installer');

  if (target === 'all') {
    for (const t of TARGETS) runners[t](args.dest, opts);
  } else if (runners[target]) {
    runners[target](args.dest, opts);
  } else {
    console.error(`\nUnknown target "${target}". Use one of: ${TARGETS.join(', ')}, all`);
    process.exitCode = 1;
    return;
  }

  if (args.checklist) installChecklist(args.dest, opts);

  console.log('\nDone. Now ask your agent:\n  Run a preflight audit on this codebase.\n');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
});
