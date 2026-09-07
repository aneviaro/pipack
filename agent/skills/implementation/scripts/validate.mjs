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
    'select', 'preflight', 'render packet', 'worker', 'validate ref', 'revmux review/correct',
    'integrate', 'verify', 'record', 'cleanup', 'learn', 'temporary tasks directory outside',
    'final whole-plan revmux review', 'accepted-tree integration', 'one authoritative task commit',
    'worker and review sequential', 'three consecutive no-change cycles', 'Review response',
    'worker reasoning', 'medium', 'high', 'xhigh',
    'Stop/report when',
  ],
  protocol: [
    '## Canonical vocabulary', '## Invariants and ownership',
    '## Lifecycle and durable-mutation gates', '## Bounded scope reconciliation',
    '## Revmux review contract', '## Correction and recovery rules',
    '## Blocked / resume decision matrix', 'sources.expected', 'sources.reported',
    'no_change_cycles', 'byte-identical', 'Three consecutive no-change correction cycles',
    'worker reasoning',
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
    '## Required round input', '## Invocation', '--workdir', '--profile comprehensive',
    '## Required JSON validation and decision mapping', 'sources.expected === sources.reported',
    'sources.degraded', 'findings', 'open_questions', 'pre_existing', 'immaterial',
    'confirmed', 'refined', 'unverified', 'Review response', 'no-change',
    'Exit `0`', 'Exit `1`', 'Exit `2`',
    '## Correction rounds', '## Read-only prohibitions',
  ],
  checkpoint: [
    'plan:', 'task_base_sha:', 'worker_reasoning:', 'worker:', 'outcome:', 'revmux_task:', 'revmux_round:',
    'revmux_tasks_dir:', 'no_change_cycles:', 'scope_reconciliation:', 'retained_transport_refs:',
    'review:', 'review_responses:',
    'stopped_gate:', 'NEXT_SAFE_ACTION:',
  ],
  worker: ['WORKER_RESULT: success|failure', 'Scope additions requested', 'Review response'],
};
for (const [file, required] of Object.entries(markers)) {
  for (const marker of required) if (!normalized[file].includes(marker.toLowerCase())) fail(`${file} missing required marker: ${marker}`);
}
if (!normalized.skill.includes('every checklist mutation and commit requires')) fail('SKILL.md omits durable mutation gate');
for (const marker of [
  'Stop without mutating baseline', 'stop on malformed review', 'leave checklists unchecked',
  'Stop/report when the correction budget is exhausted', 'Revmux-requested corrections',
  'at most three fresh correction workers', 'one explicitly user-authorized extra',
  'fresh worker from its task base', 'full ref validation', 'fresh revmux round',
  'three consecutive no-change cycles', 'accepted-tree integration', 'main-tree verification', 'separate authoritative fix commit',
]) if (!normalized.skill.includes(marker.toLowerCase())) fail(`SKILL.md omits required safety/correction marker: ${marker}`);

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
