#!/usr/bin/env node
/** Dependency-free checks for the worker/revmux implementation contract. */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, '../../../../');
const implementation = resolve(root, 'agent/skills/implementation');
const files = {
  skill: resolve(implementation, 'SKILL.md'),
  protocol: resolve(implementation, 'references/protocol.md'),
  shared: resolve(root, 'agent/skills/implementation-agent-contract/SKILL.md'),
  task: resolve(implementation, 'assets/task-packet.md'),
  review: resolve(implementation, 'assets/review-packet.md'),
  checkpoint: resolve(implementation, 'assets/checkpoint.md'),
  worker: resolve(root, 'agent/agents/implementation-worker.md'),
};
const failures = [];
const fail = (message) => failures.push(message);
const read = (file) => {
  if (!existsSync(file)) {
    fail(`missing artifact: ${relative(root, file)}`);
    return '';
  }
  try {
    return readFileSync(file, 'utf8');
  } catch (error) {
    fail(`unreadable artifact: ${relative(root, file)} (${error.code ?? 'read error'})`);
    return '';
  }
};
const text = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, read(file)]));
const profileScriptPath = resolve(implementation, 'scripts/materialize-revmux-profile.mjs');
const profileScript = read(profileScriptPath);
const staleReviewer = resolve(root, 'agent/agents/task-reviewer.md');
if (existsSync(staleReviewer)) fail('obsolete custom task-reviewer definition must be removed');
for (const [key, value] of Object.entries(text)) {
  if (value.includes('task-reviewer') || value.includes('REVIEW_RESULT')) {
    fail(`${key} contains the obsolete custom reviewer contract`);
  }
}

const requiredLinks = [
  'references/protocol.md',
  'assets/task-packet.md',
  'assets/review-packet.md',
  'assets/checkpoint.md',
  '../implementation-agent-contract/SKILL.md',
];
const links = [];
const linkPattern = /\[[^\]]+\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
let match;
while ((match = linkPattern.exec(text.skill)) !== null) links.push(match[1]);
for (const link of links) {
  if (/^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(link)) fail(`non-relative link in SKILL.md: ${link}`);
  else if (!requiredLinks.includes(link)) fail(`out-of-scope link in SKILL.md: ${link}`);
  else if (!existsSync(resolve(implementation, link))) fail(`broken link in SKILL.md: ${link}`);
}
for (const link of requiredLinks) if (!links.includes(link)) fail(`SKILL.md must link ${link}`);

const frontmatter = (file, body) => {
  const header = body.match(/^---\n([\s\S]*?)\n---\n/);
  if (!header) {
    fail(`${file} has no YAML frontmatter`);
    return {};
  }
  const values = {};
  for (const line of header[1].split('\n')) {
    const field = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!field) {
      fail(`${file} has invalid frontmatter line: ${line}`);
      continue;
    }
    if (field[1] in values) fail(`${file} repeats frontmatter field ${field[1]}`);
    values[field[1]] = field[2];
  }
  return values;
};
const workerPath = relative(root, files.worker);
const actual = frontmatter(workerPath, text.worker);
const expected = {
  name: 'implementation-worker', isolation: 'worktree', run_in_background: 'false',
  model: 'openai-codex/gpt-5.6-luna',
  tools: 'read, bash, edit, write, grep, find, ls', prompt_mode: 'replace',
  extensions: 'false', skills: 'implementation-agent-contract', persist_session: 'true',
  output_transcript: 'false', max_turns: '80',
};
for (const [key, value] of Object.entries(expected)) {
  if (actual[key] !== value) fail(`${workerPath} requires ${key}: ${value}; got ${actual[key] ?? '<missing>'}`);
}
for (const key of Object.keys(actual)) {
  if (!['name', 'description', ...Object.keys(expected)].includes(key)) {
    fail(`${workerPath} has unexpected frontmatter field: ${key}`);
  }
}
if (!actual.description) fail(`${workerPath} requires a description`);
if ('isolated' in actual) fail(`${workerPath} must not define isolated`);
if ('thinking' in actual) fail(`${workerPath} must leave thinking to the coordinator`);
if (actual.skills === 'false') fail(`${workerPath} must not disable skills`);

const normalized = Object.fromEntries(Object.entries(text).map(([key, value]) => [key, value.replace(/\s+/g, ' ').toLowerCase()]));
const markers = {
  skill: [
    'select plan', 'preflight', 'render packet', 'worker', 'validate ref', 'integrate candidate',
    'verify task', 'repeat tasks', 'final whole-plan revmux review/correct', 'record', 'cleanup',
    'learn', 'temporary tasks directory outside', 'at most four total review cycles',
    'cycle 4', 'blocking changes only', 'never run revmux between tasks',
    'one authoritative whole-plan commit', 'cumulative candidate', 'three consecutive no-change cycles',
    'Review response', 'worker reasoning', 'review profile', 'implementation-codex',
    'gpt-5.6-sol:low', 'gpt-5.6-luna:xhigh', 'medium', 'high', 'xhigh',
    'Stop/report at cycle 4',
  ],
  protocol: [
    '## Canonical vocabulary', '## Invariants and ownership',
    '## Lifecycle and durable-mutation gates', '## Bounded scope reconciliation',
    '## Final whole-plan revmux review contract', '## Correction and recovery rules',
    '## Blocked / resume decision matrix', 'sources.expected', 'sources.reported',
    'no_change_cycles', 'byte-identical', 'Cycle 4 is always the last cycle',
    'worker reasoning', 'review profile', 'revmux config', 'implementation-codex',
    'gpt-5.6-sol:low', 'gpt-5.6-luna:xhigh', 'candidate Base SHA', 'candidate ref',
  ],
  shared: ['## Instruction and packet precedence', '## Scope and safety', '## Concise reporting'],
  task: [
    '## Identity and execution', 'Worker reasoning:', '## Task contract', '## Scope', '### Initially allowed paths',
    '### Hard-protected paths', '## Verification', '## Prohibitions', '## Worker result (exact schema)',
    'WORKER_RESULT: success|failure', 'Changed paths:', 'Scope additions requested:',
    'Implementation summary:', 'Review response:', 'Blockers/risks:'
  ],
  review: [
    '## Identity and ref evidence', 'revmux new', '--tasks-dir', 'scope.md', 'goal.md', 'Worker reasoning:',
    'Review profile:', 'Resolved review executors:', 'revmux config --profile',
    'implementation-codex', 'materialize-revmux-profile.mjs', 'every selected task has',
    '## Required round input', '## Invocation', '--workdir', '--profile "<review-profile>"',
    '## Required JSON validation and decision mapping', 'sources.expected === sources.reported',
    'sources.degraded', 'findings', 'open_questions', 'pre_existing', 'immaterial',
    'confirmed', 'refined', 'unverified', 'Review response', 'no-change', 'cycle 4',
    'blocking changes only', 'Exit `0`', 'Exit `1`', 'Exit `2`',
    '## Correction rounds', '## Read-only prohibitions',
  ],
  checkpoint: [
    'plan:', 'plan_base_sha:', 'task_base_sha:', 'candidate_ref:', 'candidate_sha:',
    'worker_reasoning:', 'revmux_profile:', 'revmux_executors:', 'worker:', 'outcome:',
    'tasks_total:', 'tasks_completed:', 'revmux_scope:', 'revmux_cycle:', 'revmux_task:',
    'revmux_round:', 'revmux_tasks_dir:', 'no_change_cycles:', 'scope_reconciliation:',
    'retained_transport_refs:', 'retained_candidate_refs:', 'review:', 'review_responses:',
    'stopped_gate:', 'NEXT_SAFE_ACTION:',
  ],
  worker: ['WORKER_RESULT: success|failure', 'Scope additions requested', 'Review response'],
};
for (const [file, required] of Object.entries(markers)) {
  for (const marker of required) if (!normalized[file].includes(marker.toLowerCase())) fail(`${file} missing required marker: ${marker}`);
}
for (const marker of [
  'codex/gpt-5.6-sol:low', 'codex/gpt-5.6-luna:xhigh',
  'lenses: [bugs, impl, architecture, quality, docs, tests, comments, adversarial]',
  "['config', '--profile', 'implementation-codex']", "['login', 'status']",
]) if (!profileScript.includes(marker)) fail(`profile materializer missing required marker: ${marker}`);
if (!normalized.skill.includes('every checklist mutation and commit requires')) fail('SKILL.md omits durable mutation gate');
for (const marker of [
  'Stop without mutating the baseline', 'stop on malformed review', 'leave all checklists unchecked',
  'Stop/report at cycle 4', 'final-review correction', 'fresh worker', 'latest cumulative candidate',
  'full ref validation', 'new review cycle', 'three consecutive no-change cycles (byte-identical',
  'accepted-candidate integration', 'main-tree verification', 'single authoritative whole-plan commit',
  'never run revmux between tasks', 'blocking changes only',
]) if (!normalized.skill.includes(marker.toLowerCase())) fail(`SKILL.md omits required safety/correction marker: ${marker}`);

const obsoleteWorkflowPatterns = [
  ['per-task state machine', /for one pending task[\s\S]*revmux/],
  ['per-task review summary', /for each (?:plan item|task)[^.\n]{0,180}revmux/],
  ['temporary per-task review', /temporary revmux review\s*→/],
  ['old correction budget', /at most three fresh correction workers/],
  ['fifth review cycle', /(?:user-authorized|extra) fifth cycle|one explicitly user-authorized extra cycle/],
  ['task-only authoritative commit', /one authoritative task-only commit/],
  ['old review-to-integration transition', /revmux review\/correct\s*→\s*integrate/],
];
for (const [file, value] of Object.entries(normalized)) {
  for (const [name, pattern] of obsoleteWorkflowPatterns) {
    if (pattern.test(value)) fail(`${file} retains obsolete workflow marker: ${name}`);
  }
}

const metrics = Object.entries(files).map(([key, file]) => ({
  key, path: relative(root, file), chars: text[key].length, lines: text[key].split('\n').length,
}));
if (metrics.find((entry) => entry.key === 'skill').lines > 250) fail('SKILL.md exceeds 250 lines');
const total = metrics.reduce((sum, entry) => sum + entry.chars, 0);
if (total > 36000) fail(`active instruction surface exceeds 36000 characters: ${total}`);
for (const entry of metrics) console.log(`${entry.path}: ${entry.chars} chars, ${entry.lines} lines`);
console.log(`active instruction surface: ${total} chars`);
if (failures.length) {
  console.error('Implementation contract validation failed');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('Implementation contract validation passed');
}
