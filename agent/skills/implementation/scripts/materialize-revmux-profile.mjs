#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

const reviewRoot = process.argv[2];
if (!reviewRoot || !isAbsolute(reviewRoot)) {
  console.error('usage: materialize-revmux-profile.mjs <absolute-review-root>');
  process.exit(2);
}

mkdirSync(reviewRoot, { recursive: true });
const configRoot = join(reviewRoot, '.revmux');
execFileSync('revmux', ['--dump-defaults', configRoot], {
  cwd: reviewRoot,
  stdio: ['ignore', 'ignore', 'pipe'],
});

const profilesDir = join(configRoot, 'prompts', 'profiles');
const source = readFileSync(join(profilesDir, 'codex-only.md'), 'utf8');
const frontmatterEnd = source.indexOf('\n---', 4);
if (!source.startsWith('---\n') || frontmatterEnd < 0) {
  throw new Error('shipped codex-only profile has invalid front matter');
}

const sourceBody = source.slice(frontmatterEnd + 4);
const body = sourceBody.replace(
  /^\n?You are one reviewer on a panel\.[\s\S]*?lenses find\.\n\n/,
  'You are the sole finder for this bounded review. Apply every assigned lens independently and report only evidence you verify.\n\n',
);
if (body === sourceBody) throw new Error('shipped codex-only profile preamble was not recognized');
const frontmatter = `---
description: "bounded implementation review: one Sol finder, Luna synthesis and verification"
model: codex/gpt-5.6-sol:low
agents:
  - {name: implementation, lenses: [bugs, impl, architecture, quality, docs, tests, comments, adversarial], color: cyan}
stages:
  synthesis: codex/gpt-5.6-luna:xhigh
  verify: codex/gpt-5.6-luna:xhigh
---`;
const profile = `${frontmatter}\n${body}`;
const profilePath = join(profilesDir, 'implementation-codex.md');
if (existsSync(profilePath) && readFileSync(profilePath, 'utf8') !== profile) {
  throw new Error(`refusing to overwrite different profile: ${profilePath}`);
}
writeFileSync(profilePath, profile, { encoding: 'utf8', mode: 0o600 });

const config = JSON.parse(execFileSync(
  'revmux',
  ['config', '--profile', 'implementation-codex'],
  { cwd: reviewRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
));
const resolved = config.profiles.find(({ name }) => name === 'implementation-codex');
const expectedLenses = ['bugs', 'impl', 'architecture', 'quality', 'docs', 'tests', 'comments', 'adversarial'];
const valid = resolved?.runner?.executor === 'codex'
  && resolved.runner.model === 'gpt-5.6-sol'
  && resolved.runner.effort === 'low'
  && resolved.roster?.length === 1
  && JSON.stringify(resolved.roster[0].lenses) === JSON.stringify(expectedLenses)
  && resolved.stages?.length === 2
  && JSON.stringify(resolved.stages.map(({ name }) => name)) === JSON.stringify(['synthesis', 'verify'])
  && resolved.stages.every(({ executor, model, effort }) => (
    executor === 'codex' && model === 'gpt-5.6-luna' && effort === 'xhigh'
  ));
if (!valid) throw new Error('resolved implementation-codex profile does not match the required topology');

execFileSync('codex', ['--version'], { stdio: ['ignore', 'ignore', 'inherit'] });
execFileSync('codex', ['login', 'status'], { stdio: ['ignore', 'ignore', 'inherit'] });
console.log(JSON.stringify({
  profile: resolved.name,
  profilePath,
  finder: 'codex/gpt-5.6-sol:low',
  synthesis: 'codex/gpt-5.6-luna:xhigh',
  verify: 'codex/gpt-5.6-luna:xhigh',
}));
