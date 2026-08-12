# My pi setup

Backup of my [pi](https://github.com/earendil-works/pi-coding-agent) agent
configuration: settings, custom skills, and npm dependency manifests.

## What's tracked

| Path | What |
|------|------|
| `agent/settings.json` | Default provider + model, theme, `packages[]` list |
| `agent/mcp-onboarding.json` | Onboarding flags |
| `agent/skills/` | Custom skills |
| `agent/agents/` | `implementation-worker` and `task-reviewer` definitions |
| `agent/subagents.json` | Fail-closed subagent defaults and runtime policy |
| `agent/npm/package.json` (+ lock) | pi npm extensions manifest, including `@tintinweb/pi-subagents` |
| `packages/ask-user-question/` | Published `ask_user_question` Pi package |
| `packages/codex-limit-tracking-footer/` | Published Codex limit footer Pi package |
| `packages/safe-rm/` | Published recursive-force `rm` validation Pi package |
| `bootstrap.sh` | One-command restore on a new machine |

### Orchestrated implementation

The global implementation workflow is backed by `@tintinweb/pi-subagents`. The
following declarative configuration is tracked so a restored setup has the same
agent policy:

| Path | What |
|------|------|
| `agent/agents/` | `implementation-worker` and `task-reviewer` definitions |
| `agent/subagents.json` | Fail-closed subagent defaults and runtime policy |
| `agent/npm/package.json` (+ lock) | Includes the `@tintinweb/pi-subagents` runtime dependency |

For each plan item, the coordinator owns the durable state and Git authority.
The operating lifecycle is exactly:

`task packet → isolated worker → read-only branch review → bounded correction → coordinator verification → checklist update → feature-branch commit`

Workers run in isolated worktrees and reviewers inspect their transport branch
without write tools. The coordinator waits in the foreground for dependent
worker/reviewer calls; periodic polling is not used. A rejected review permits
one fresh correction worker and one fresh review, rather than resuming a cleaned-up
worker worktree.

After a successful authoritative commit, the coordinator compare-and-deletes
only the task-created `pi-agent-*` transport branches whose recorded SHAs still
match. Failed or interrupted runs retain those branches and report their names
and SHAs for recovery; they are not deleted speculatively.

This is a public configuration repository: tracked artifacts are limited to
generic prompts, model/tool policy, non-secret settings, package manifests, and
documentation. Transcripts, sessions, task packets, memory, credentials, and
repository-specific runtime content remain ignored and unpublished. A completed
whole-plan run applies the `learn` skill to concise worker, reviewer, and
coordinator outputs, and asks the user for confirmation before making durable
project-memory edits.

#### Disposable smoke-test requirement

Before declaring orchestration complete, run the workflow in a temporary Git
repository, not in this configuration checkout. Seed and commit one source file,
create one unrelated dirty file, and put a one-task plan on a feature branch.
Use a fresh Pi session (or an explicitly recorded manual/headless equivalent) to
verify that the worker changes only its transport branch, the reviewer remains
read-only, the unrelated dirty file stays byte-identical and uncommitted, and
the authoritative feature-branch commit contains only the task files and plan.
Also exercise a reviewer-rejection fixture: after the first review requests
changes, confirm that it receives at most one fresh correction worker and one
fresh re-review; if that re-review still rejects, the task must remain unchecked
and uncommitted. Exercise one additional controlled failure (for example, a
protected branch or failed verification): the plan item must remain unchecked,
no authoritative commit may be created, and any transport branch must be
retained and reported for recovery.

This section specifies a required test protocol; it is not evidence that the
smoke test has passed. Record the exact commands and observed results before
claiming PASS, and do not add disposable fixtures or generated runtime artifacts
to this repository.

## Included Pi packages

### `@aneviaro/pi-ask-user-question`

A blocking clarification tool with multiple-choice and freeform answers.

![ask_user_question presents a recommended multiple-choice prompt in Pi](packages/ask-user-question/assets/ask-user-question-demo.png)

```bash
pi install npm:@aneviaro/pi-ask-user-question
```

### `@aneviaro/pi-codex-limit-tracking-footer`

Adds a 5-hour/weekly Codex subscription-limit segment to Pi's footer, with semantic colors, stale-data handling, and `/codex-limits [refresh]` diagnostics. It uses Pi-managed OAuth credentials without persisting usage data.

![codex-limit-tracking-footer shows current subscription limits](packages/codex-limit-tracking-footer/assets/codex-limit-tracking-footer.png)

```bash
pi install npm:@aneviaro/pi-codex-limit-tracking-footer
```

### `@aneviaro/pi-safe-rm`

Blocks model-issued recursive-force `rm` commands, requires the model to call `validate_rm` for a deletion summary, then allows one exact retry if the filesystem snapshot is unchanged.

```bash
pi install npm:@aneviaro/pi-safe-rm
```

## What's deliberately NOT tracked (see `.gitignore`)

- **`agent/auth.json`** — ⚠️ live OAuth/API tokens. Never commit. Pi recreates
  this on first run via interactive login. A new machine's `auth.json` is left
  untouched by `bootstrap.sh`.
- **`agent/trust.json`** — machine-specific trusted-project paths (absolute).
  Kept local; each machine maintains its own. `bootstrap.sh` preserves it
  across the force checkout (backs up + restores), so it survives even on
  machines migrating from an older commit where it was tracked.
- **`agent/mcp-cache.json`** — regenerable MCP metadata cache.
- **`agent/sessions/`** — per-project conversation history (large, machine-local).
- **`agent/npm/node_modules/`** — rebuilt from `package.json` (~358 MB).
- **`agent/bin/`** — downloaded helper binaries. Pi re-fetches on demand.
- **`agent/git/`** — git-cloned skills/packages, re-fetched from `settings.json`
  `packages[]` on first run.
- **`context-mode/`** — SQLite knowledge-base DBs + per-pid session stats.

## Restoring on a new machine

`bootstrap.sh` is the single entry point. It handles all three starting
states (missing dir, existing repo, or existing non-empty dir where pi already
seeded defaults), then rebuilds npm extensions. Ignored files — including the
new machine's `auth.json` and `trust.json` — are never touched.

### Option A: curl-pipe (brand-new machine, after `git` + SSH key are set up)

```bash
bash -c "$(curl -fsSL \
  https://raw.githubusercontent.com/aneviaro/pipack/main/bootstrap.sh)"
```

### Option B: clone the repo, then run the helper

```bash
git clone git@github.com:aneviaro/pipack.git ~/.pi
cd ~/.pi && ./bootstrap.sh
```

### Option C: `~/.pi` already exists (pi already ran once → `git clone` fails)

This is the case where `git clone` reports
`fatal: destination path '~/.pi' already exists and is not an empty directory`,
or `git checkout` reports
`untracked working tree files would be overwritten`. Run `bootstrap.sh`
from anywhere — it does `git init` + remote + fetch + `checkout -f -B main`,
overwriting only the tracked files:

```bash
PI_REMOTE=git@github.com:aneviaro/pipack.git \
  bash -c "$(curl -fsSL \
    https://raw.githubusercontent.com/aneviaro/pipack/main/bootstrap.sh)"
```

Prefer HTTPS instead of SSH? Override `PI_REMOTE`:

```bash
PI_REMOTE=https://github.com/aneviaro/pipack.git bash bootstrap.sh
```

### After bootstrap — finish up

```bash
pi   # fetches agent/bin/ + agent/git/ (from settings.json packages[])
     # and prompts for OAuth to (re)create agent/auth.json
```

## Going forward — keeping it in sync

After any pi config change (new skill, settings tweak, package added):

```bash
cd ~/.pi && git add -A && git commit -m "update pi setup" && git push
```

`git add -A` is always safe — the allowlist `.gitignore` means new files under
`sessions/`, `node_modules/`, `context-mode/`, `trust.json`, or a refreshed
`auth.json` can never sneak in.

## Policy reminder

The `.gitignore` uses an **allowlist**: `*` ignores everything, then specific
files are opted back in with `!` rules. To track a new file, add a `!/path` line
to the OPT-INS section. **Never** allowlist `auth.json`, `trust.json`, or
anything under `sessions/`, `node_modules/`, `bin/`, `git/`, or `context-mode/`.
