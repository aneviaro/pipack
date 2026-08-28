#!/usr/bin/env node
/** Dependency-free static checks for the implementation contracts. */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, '../../../../');
const implementation = resolve(root, 'agent/skills/implementation');
const contract = resolve(root, 'agent/skills/implementation-agent-contract/SKILL.md');
const skill = resolve(implementation, 'SKILL.md');
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
const files = {
  skill,
  protocol: resolve(implementation, 'references/protocol.md'),
  shared: contract,
  task: resolve(implementation, 'assets/task-packet.md'),
  review: resolve(implementation, 'assets/review-packet.md'),
  checkpoint: resolve(implementation, 'assets/checkpoint.md'),
  worker: resolve(root, 'agent/agents/implementation-worker.md'),
  reviewer: resolve(root, 'agent/agents/task-reviewer.md'),
};
const requiredArtifacts = [...Object.values(files)];
const artifactText = new Map(requiredArtifacts.map((file) => [file, read(file)]));
const text = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, artifactText.get(file) ?? '']));

const requiredLinks = [
  'references/protocol.md',
  'assets/task-packet.md',
  'assets/review-packet.md',
  'assets/checkpoint.md',
  '../implementation-agent-contract/SKILL.md',
];
const linkPattern = /\[[^\]]+\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const links = [];
let match;
while ((match = linkPattern.exec(text.skill)) !== null) links.push(match[1]);
for (const link of links) {
  if (/^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(link)) fail(`non-relative link in SKILL.md: ${link}`);
  else if (!requiredLinks.includes(link)) fail(`out-of-scope link in SKILL.md: ${link}`);
  else if (!existsSync(resolve(implementation, link))) fail(`broken link in SKILL.md: ${link}`);
}
for (const link of requiredLinks) {
  if (!links.includes(link)) fail(`SKILL.md must link ${link}`);
}

const frontmatter = (file, body) => {
  const match = body.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) {
    fail(`${file} has no YAML frontmatter`);
    return {};
  }
  const values = {};
  for (const line of match[1].split('\n')) {
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
const expected = {
  worker: {
    name: 'implementation-worker', isolation: 'worktree', run_in_background: 'false',
    model: 'openai-codex/gpt-5.6-luna', thinking: 'high',
    tools: 'read, bash, edit, write, grep, find, ls', prompt_mode: 'replace',
    extensions: 'false', skills: 'implementation-agent-contract', persist_session: 'true',
    output_transcript: 'false', max_turns: '80',
  },
  reviewer: {
    name: 'task-reviewer', isolation: 'off', run_in_background: 'false',
    model: 'openai-codex/gpt-5.6-sol', thinking: 'low',
    tools: 'read, bash, grep, find, ls', prompt_mode: 'replace',
    extensions: 'false', skills: 'implementation-agent-contract', persist_session: 'false',
    output_transcript: 'false', max_turns: '20',
  },
};
for (const role of ['worker', 'reviewer']) {
  const path = relative(root, files[role]);
  const actual = frontmatter(path, text[role]);
  for (const [key, value] of Object.entries(expected[role])) {
    if (actual[key] !== value) fail(`${path} requires ${key}: ${value}; got ${actual[key] ?? '<missing>'}`);
  }
  for (const key of Object.keys(actual)) {
    if (!['name', 'description', ...Object.keys(expected[role])].includes(key)) {
      fail(`${path} has unexpected frontmatter field: ${key}`);
    }
  }
  if (!actual.description) fail(`${path} requires a description`);
  if ('isolated' in actual) fail(`${path} must not define isolated`);
  if (actual.skills === 'false') fail(`${path} must not disable skills`);
}
const normalized = Object.fromEntries(Object.entries(text).map(([key, value]) => [key, value.replace(/\s+/g, ' ')]));
const markers = {
  skill: ['select', 'preflight', 'render packet', 'worker', 'validate ref', 'review/correct', 'integrate', 'verify', 'record', 'cleanup', 'learn', 'final whole-plan review', 'at most three fresh', 'one explicitly user-', 'fresh isolated worker for the affected task', 'full worker-result/ref', 'accepted-tree integration', 'separate authoritative fix commit', 'accepted path-limited tree delta', 'Atomically compare-delete', 'one task-only authoritative commit', 'Complete learning before success', 'Stop/report when'],
  protocol: ['## Canonical vocabulary', '## Invariants and ownership', '## Lifecycle and durable-mutation gates', '## Correction and recovery rules', '## Blocked / resume decision matrix'],
  shared: ['## Instruction and packet precedence', '## Scope and safety', '## Concise reporting'],
  task: ['## Identity and execution', '## Task contract', '## Scope', '### Allowed paths', '### Protected paths', '## Verification', '## Prohibitions', '## Worker result (exact schema)', 'WORKER_RESULT: success|failure', 'Changed paths:', 'Implementation summary:', 'Blockers/risks:'],
  review: ['## Identity and ref evidence', 'Allowed paths:', 'Protected paths and baseline:', '## Read-only inspection', '## Review coverage and criteria', '## Reviewer result (exact schema)', 'REVIEW_RESULT: approve|request changes', 'Findings:', 'Task/plan coverage:', 'Verification evidence:', 'Recommendation: approve'],
  checkpoint: ['plan:', 'task_base_sha:', 'worker:', 'outcome:', 'retained_transport_refs:', 'review:', 'stopped_gate:', 'NEXT_SAFE_ACTION:'],
  worker: ['WORKER_RESULT: success|failure'],
  reviewer: ['REVIEW_RESULT: approve|request changes', 'Recommendation: approve|request changes'],
};
for (const [file, required] of Object.entries(markers)) {
  for (const marker of required) if (!normalized[file].includes(marker)) fail(`${file} missing required marker: ${marker}`);
}
if (!normalized.skill.includes('Every checklist mutation and commit requires')) fail('SKILL.md omits durable mutation gate');
const skillStops = [
  'Stop without mutating baseline',
  'stop on malformed review',
  'leave checklists unchecked',
  'Stop/report when the correction budget is exhausted',
];
for (const marker of skillStops) if (!normalized.skill.includes(marker)) fail(`SKILL.md omits stop condition: ${marker}`);
for (const marker of [
  'Reviewer-requested corrections, including final whole-plan review fixes',
  'at most three fresh correction workers after the initial attempt/review',
  'one explicitly user-authorized extra after a blocked resume',
  'fresh isolated worker for the affected task',
  'from its task base',
  'full worker-result/ref validation',
  'fresh review',
  'accepted-tree integration',
  'main-tree verification',
  'separate authoritative fix commit',
]) if (!normalized.skill.includes(marker)) fail(`SKILL.md omits correction/final-fix contract: ${marker}`);
if (normalized.skill.includes('two full review/fix passes') || normalized.skill.includes('two final review')) {
  fail('SKILL.md regresses to the historical two-final-pass limit');
}
const finalReview = normalized.skill.slice(normalized.skill.indexOf('When no tasks remain'));
for (const marker of ['fresh isolated worker for the affected task', 'from its task base', 'full worker-result/ref validation', 'fresh review', 'accepted-tree integration', 'main-tree verification', 'separate authoritative fix commit', 'same three-plus-one budget']) {
  if (!finalReview.includes(marker)) fail(`final review/fix policy omits: ${marker}`);
}
if (!text.worker.includes('WORKER_RESULT: success|failure')) fail('worker result contract missing');
const verificationRetryMarkers = {
  task: ['After a verification failure, attempt a task-scoped fix', 'Use `WORKER_RESULT: failure` only if it still fails'],
  shared: ['If verification fails, attempt a task-scoped fix and rerun it', 'report failure only if it still fails'],
  worker: ['If one fails, fix it within scope and rerun it'],
};
for (const [file, required] of Object.entries(verificationRetryMarkers)) {
  for (const marker of required) if (!normalized[file].includes(marker)) fail(`${file} omits verification retry guidance: ${marker}`);
}

const active = ['skill', 'protocol', 'shared', 'task', 'review', 'checkpoint', 'worker', 'reviewer'];
const metrics = active.map((key) => ({ key, path: relative(root, files[key]), chars: text[key].length, lines: text[key].split('\n').length }));
if (metrics.find((entry) => entry.key === 'skill').lines > 250) fail('SKILL.md exceeds 250 lines');
const total = metrics.reduce((sum, entry) => sum + entry.chars, 0);
if (total > 28000) fail(`active instruction surface exceeds 28000 characters: ${total}`);

for (const entry of metrics) console.log(`${entry.path}: ${entry.chars} chars, ${entry.lines} lines`);
console.log(`active instruction surface: ${total} chars`);
if (failures.length) {
  console.error('Implementation contract validation failed');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('Implementation contract validation passed');
}
