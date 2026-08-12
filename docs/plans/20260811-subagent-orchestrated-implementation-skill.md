# Add Subagent Orchestration to the Implementation Skill

## Overview
Upgrade the global `implementation` skill so the main Pi session remains the durable coordinator while fresh, context-isolated subagents implement and review one plan task at a time. The coordinator will own plan selection, baseline protection, task sequencing, branch validation, final verification, checklist updates, and authoritative commits. `@tintinweb/pi-subagents` will provide isolated workers, read-only reviewers, completion handling, and transport branches.

## Source Spec
- Spec: `prompt: Main implementation process delegates each plan task to a subagent, waits for completion, runs an independent review, commits the approved task, and repeats.`
- Status: Approved
- Last reviewed: 2026-08-11

## Repository Context
- `agent/skills/implementation/SKILL.md` — current sequential implementation loop; must become the coordinator protocol without losing its preflight, verification, resumability, or task-only commit guarantees.
- `agent/skills/plan-linked-review/SKILL.md` — established review severity, plan-coverage, and verification conventions to mirror in the dedicated reviewer agent.
- `agent/npm/node_modules/@tintinweb/pi-subagents/README.md` — installed package contract for `Agent`, completion notifications, `get_subagent_result`, custom agents, settings, and worktree isolation.
- `agent/npm/node_modules/@tintinweb/pi-subagents/src/worktree.ts` — confirms isolated workers are removed after completion and changed work is preserved on an automatically committed `pi-agent-<id>` branch.
- `agent/npm/node_modules/@tintinweb/pi-subagents/src/settings.ts` — global settings load from `agent/subagents.json`; project settings may override them.
- `agent/npm/package.json` and `agent/npm/package-lock.json` — already contain the user-installed `@tintinweb/pi-subagents` dependency and are currently modified.
- `.gitignore` — repository-wide allowlist; new global agent definitions and subagent settings must be explicitly opted in.
- `README.md` — documents tracked Pi configuration and restore behavior.
- `docs/plans/README.md` — active plans live in `docs/plans/` and move to `docs/plans/completed/` when complete.

## Implementation Constraints
- Use skill-only orchestration plus custom agent definitions; do not add a coordinator extension unless the skill-only workflow proves unable to recover durable state.
- The main session is the only authority allowed to update plan checkboxes, stage files, or create task commits, and automatic commit mode must refuse to run on `main` or `master`; implementation runs use a feature branch.
- Initial and correction workers run with `isolation: "worktree"`; they must never modify the main working tree directly.
- Implementation workers use `openai-codex/gpt-5.6-luna` with `xhigh` reasoning; task reviewers use `openai-codex/gpt-5.6-sol` with `low` reasoning.
- Worktree workers start from committed `HEAD` and cannot see relevant uncommitted source changes. Block when pending task inputs overlap uncommitted files; preserve unrelated pre-existing changes.
- Treat each `pi-agent-*` branch as transport, not accepted history. Require the branch to descend from the captured base, contain no merge commits, and contain only task-scoped changes before review or integration.
- Reviewer agents are read-only and inspect the transport branch from the main repository using `git diff`, `git show`, and the exact plan task. They do not need a checked-out worker worktree.
- Do not periodically poll. Foreground `Agent` calls synchronously wait for dependent work. If background mode is explicitly chosen, rely on completion notification or one `get_subagent_result(wait: true)` call.
- Do not resume or steer a completed worktree worker: package cleanup removes its working directory. Use a fresh isolated correction worker supplied with the original task packet and exact review findings.
- Keep review correction bounded to one correction worker and one fresh re-review per task.
- After a successful authoritative task commit, the coordinator removes only transport branches created by that task using compare-and-delete against their recorded SHAs. On failure or interruption it retains and reports them for recovery.
- Preserve `agent/settings.json` as environmental noise unless a deliberate setting change is required.
- Keep public-repository artifacts declarative and secret-free. Agent transcripts, sessions, task packets, memory, credentials, and repository-specific runtime content must remain untracked; disable worker/reviewer transcript and persistent-session output where supported.
- Retain concise worker results, reviewer findings, verification outcomes, and coordinator decisions in the main conversation until plan completion, then run the `learn` skill over that combined evidence. Do not persist raw subagent transcripts solely for learning.

## Assumptions
- The installed `@tintinweb/pi-subagents` package remains the supported worker runtime and exposes the `Agent` lifecycle to the main model after a fresh Pi session.
- Worker branches normally contain one package-created preservation commit. The coordinator may accept multiple linear commits but will squash the final tree delta into its own task commit.
- Project-local `.pi/subagents.json` can override global settings; the coordinator must fail clearly when required custom agent types are unavailable rather than relying solely on global fallback settings.
- Existing `agent/npm/package.json` and lockfile changes belong to this feature because the user explicitly installed the package; unrelated `agent/settings.json` changes do not.

## Non-goals
- Do not implement parallel plan-task execution; plan tasks remain sequential.
- Do not build durable cross-session orchestration state outside the plan checklist.
- Do not delete pre-existing transport branches, branches from another run, or current-run branches before the authoritative task commit succeeds.
- Do not let reviewers edit code, let workers commit to the active branch, or let the coordinator commit on `main`/`master`.
- Do not preload the entire parent conversation into workers; task packets must be self-contained.

## Task Summary
1. Add fail-closed implementation worker and task reviewer definitions.
2. Convert the implementation skill into a coordinator/worker/reviewer loop.
3. Document and smoke-test the end-to-end orchestration workflow.

## Implementation Tasks

### Task 1: Add scoped implementation and review agents

Goal: Register predictable custom agent types with the minimum tools and settings needed for isolated implementation and read-only branch review.

Context:
- Global custom agents are discovered from `agent/agents/<name>.md`.
- The package defaults unknown agent names to `general-purpose`; orchestration should instead fail closed.
- Worktree isolation is selected by the coordinator call so the agent definition remains reusable, but the implementation skill must always request it for coding workers.

Files:
- Create: `agent/agents/implementation-worker.md` — task-scoped coding worker definition.
- Create: `agent/agents/task-reviewer.md` — independent read-only branch reviewer definition.
- Create: `agent/subagents.json` — fail-closed global subagent defaults.
- Modify: `.gitignore` — allowlist global agents and subagent settings.
- Modify: `agent/npm/package.json` — retain the installed `@tintinweb/pi-subagents` dependency.
- Modify: `agent/npm/package-lock.json` — retain the matching resolved dependency graph.

Steps:
- [x] Define `implementation-worker` with `model: openai-codex/gpt-5.6-luna`, `thinking: xhigh`, `prompt_mode: replace`, only repository inspection/editing tools, no inherited extensions or skills, no nested delegation, disabled transcript/session persistence, a bounded turn budget, and instructions to implement only the supplied task packet, run requested verification, avoid plan/checklist changes, and never stage or commit.
- [x] Define `task-reviewer` with `model: openai-codex/gpt-5.6-sol`, `thinking: low`, `prompt_mode: replace`, read-only repository tools, no inherited extensions or skills, disabled transcript/session persistence, a bounded turn budget, and a strict output contract covering material findings, task coverage, verification evidence, and `approve` or `request changes`.
- [x] Add `agent/subagents.json` with `fallbackSubagent: "none"` so missing, disabled, ambiguous, or misspelled orchestration agent types cannot silently become unrestricted general-purpose agents.
- [x] Allowlist `agent/agents/**` and `agent/subagents.json` without allowing any session, transcript, memory, credential, or generated package data.
- [x] Verify the existing package manifest and lockfile changes resolve to the installed `@tintinweb/pi-subagents` version; do not include `agent/settings.json` noise.

Verification:
- `node -e 'JSON.parse(require("fs").readFileSync("agent/subagents.json", "utf8")); console.log("valid subagents.json")'`
- `git status --short --untracked-files=all -- agent/agents agent/subagents.json agent/npm/package.json agent/npm/package-lock.json .gitignore`
- Start a fresh Pi session, open `/agents`, and confirm `implementation-worker` has write tools but no nested agent tools, while `task-reviewer` has no `write` or `edit` tool.

Verification evidence:
- `node -e ...` — PASS (`valid subagents.json`).
- Manifest/lockfile/install resolution check — PASS (`0.15.0`).
- `git diff --check` — PASS.
- Fresh Pi `/agents` session — PASS; both exact names appeared with `gpt-5.6-luna` / `gpt-5.6-sol`.

Completion criteria:
- Both custom agent types resolve by exact name and configured model/reasoning level after restart.
- Unknown agent types fail instead of falling back to `general-purpose`.
- Only safe declarative agent configuration and npm manifests become trackable.

### Task 2: Implement the coordinator task state machine

Goal: Make `implementation` delegate each pending task to an isolated worker, independently review its transport branch, integrate only approved changes, verify them, update the plan, commit, and continue.

Context:
- The current skill already owns plan selection, baseline capture, verification, review, checklist updates, and task-only commits.
- A completed isolated worker's temporary worktree is removed, so corrections cannot safely resume that worker session.
- The main working tree may contain unrelated unstaged changes, but the index must be clean and task-overlapping uncommitted files must block delegation.

Files:
- Modify: `agent/skills/implementation/SKILL.md` — add agent availability checks, task packets, worker branch validation, review/correction flow, integration, and failure recovery.

Steps:
- [x] Extend preflight to verify `implementation-worker` and `task-reviewer` are available, refuse automatic commit mode on `main`/`master`, capture the feature branch, base `HEAD`, index state, working-tree baseline, and existing `pi-agent-*` branches, and block when the index is non-empty or pending task inputs overlap uncommitted files unavailable to a worktree worker.
- [x] Define a self-contained task packet containing repository root, base SHA, plan/spec paths and relevant text, exact task section, applicable guidance, dependency invariants, expected/allowed paths, protected baseline paths, verification commands, completion criteria, and explicit prohibitions.
- [x] Launch `implementation-worker` in foreground with `isolation: "worktree"`; use background mode only when there is genuinely independent coordinator work, then consume completion through notification or one blocking result call rather than polling.
- [x] Validate the returned transport branch before review: it exists, descends from the captured base, has no merge commits, reports a successful worker outcome, contains no unexpected or protected paths, and main `HEAD` plus baseline ownership have not drifted.
- [x] Launch a fresh foreground `task-reviewer` in the main repository with the exact task packet, base SHA, transport branch, changed-path list, worker verification report, and commands for inspecting `git diff <base>...<branch>` and `git show <branch>:<path>`.
- [x] If review requests changes, launch one fresh isolated `implementation-worker` from the unchanged base with the full original task packet plus only the material findings; validate and re-review its replacement branch, then stop unchecked if the second review still rejects it.
- [x] After approval, integrate the accepted branch without preserving its transport commit history, inspect the staged task delta, run the task's verification commands in the main tree, and stop without checklist progress if integration or verification fails.
- [x] Only after passing verification, update completed checkboxes, stage only accepted task files plus the plan, inspect the staged diff, create the authoritative task commit on the active feature branch, refresh the base SHA, and continue to the next unchecked task.
- [x] After that commit succeeds, verify each task-created transport branch still points to its recorded SHA and remove it with compare-and-delete semantics; retain and report branches when the run fails, is interrupted, or the ref changed.
- [x] Preserve completion-loop cross-task verification and final integration review, while ensuring those reviews also use a fresh read-only reviewer when available.
- [x] After every task and cross-task gate succeeds, invoke the `learn` skill with the accumulated concise results/findings from all implementation workers and reviewers plus the coordinator's own decisions and verification outcomes; follow its confirmation and project-memory placement rules before the final report.
- [x] Add explicit blocked/resume behavior for unavailable agents, protected-branch execution, worker failure or no branch, branch-scope violation, review rejection after one correction, active-branch drift, integration conflict, failed verification, transport-ref cleanup mismatch, and interrupted final learning.

Verification:
- `rg -n 'implementation-worker|task-reviewer|isolation: "worktree"|transport branch|task packet|correction|foreground|poll|base SHA' agent/skills/implementation/SKILL.md` — PASS.
- `git diff --check -- agent/skills/implementation/SKILL.md` — PASS.
- Manual protocol audit: PASS; every path to checklist mutation or commit is explicitly gated by worker/branch validation, reviewer approval, integration, and passing main-tree verification.

Completion criteria:
- The main session delegates implementation and review while retaining all durable state, Git authority, and the concise combined evidence needed for final project learning.
- A failed, out-of-scope, or twice-rejected worker cannot advance the plan or create an authoritative feature-branch commit.
- Each accepted task produces one authoritative commit on the active feature branch, leaves unrelated baseline changes untouched, and cleans only its own unchanged transport refs.

### Task 3: Document and smoke-test orchestration

Goal: Make the dependency, tracked files, operating model, and recovery behavior understandable and verify the complete workflow in a disposable repository.

Context:
- This repository is a restorable Pi configuration backup; README must identify newly tracked global agents/settings and the required package.
- Static inspection cannot prove that agent discovery, worktree transport, branch review, and task commits cooperate in a live Pi session.

Files:
- Modify: `README.md` — document the subagents dependency, tracked agent configuration, implementation orchestration lifecycle, public-repository boundary, and transport-branch cleanup policy.

Steps:
- [ ] Add `agent/agents/` and `agent/subagents.json` to the tracked-files documentation and list `@tintinweb/pi-subagents` as an included runtime dependency.
- [ ] Document the lifecycle as `task packet → isolated worker → read-only branch review → bounded correction → coordinator verification → checklist update → feature-branch commit`, including that foreground waiting replaces periodic polling.
- [ ] Document that task-created `pi-agent-*` branches are compare-and-deleted by the coordinator only after a successful authoritative commit, while failed/interrupted runs retain and report their branches for recovery.
- [ ] Document the public-repository boundary: tracked files contain only generic prompts, model/tool policy, non-secret settings, package manifests, and docs; transcripts, sessions, task packets, memory, credentials, and runtime repository content remain ignored and unpublished.
- [ ] Document that a successful whole-plan run finishes by applying the `learn` skill to concise outputs from every worker/reviewer and the coordinator, with user confirmation before durable project-memory edits.
- [ ] Create a disposable Git repository outside this configuration repo with one committed source file, one unrelated dirty file, and a one-task implementation plan on a feature branch; run the implementation skill from a fresh Pi session.
- [ ] Confirm the worker changes only its transport branch, the reviewer is read-only, the unrelated dirty file remains byte-identical and uncommitted, the authoritative feature-branch commit contains only task files plus the plan, and a rejected-review fixture receives at most one correction worker.
- [ ] Exercise one failure path (protected branch, unknown agent type, worker scope violation, or failed verification) and confirm the plan item remains unchecked and no authoritative commit is created.

Verification:
- `git diff --check`
- `git status --short --untracked-files=all`
- Manual fresh-session `/agents` discovery check and disposable-repository end-to-end smoke test described above.

Completion criteria:
- README accurately documents restoration and operation of the orchestrated implementation workflow.
- One successful task completes through worker, reviewer, main verification, checklist update, and task commit.
- One controlled failure leaves durable plan state and main history unchanged.

## Cross-Task Verification
- `node -e 'JSON.parse(require("fs").readFileSync("agent/subagents.json", "utf8")); console.log("valid subagents.json")'`
- `git diff --check`
- `git status --short --untracked-files=all`
- Fresh Pi session: `/agents` shows exact `implementation-worker` and `task-reviewer` tool scopes and unknown agent dispatch fails closed.
- Disposable repository: execute one successful one-task plan and one controlled failure/review-rejection case.
- Successful run: confirm final `learn` receives all concise worker/reviewer/coordinator evidence and follows its confirmation flow before changing project memory.

## Risks and Mitigations
- Risk: Worktree workers cannot see task-relevant uncommitted files.
  Mitigation: Capture the baseline and block delegation on overlap; include plan/spec text directly in the task packet.
- Risk: A project-local `.pi/subagents.json` overrides global fail-closed settings.
  Mitigation: Require exact agent availability before task launch and treat any fallback/mismatch as a blocker.
- Risk: Package cleanup removes the completed worker cwd, making resume or steering unsafe for fixes.
  Mitigation: Use a fresh isolated correction worker from the unchanged base and provide the complete task plus findings.
- Risk: Reviewer cannot execute the transport branch because it remains checked out only as a Git ref.
  Mitigation: Require worker verification, review the exact branch delta, and rerun all task verification after approved integration in the main tree.
- Risk: Transport branch cleanup deletes the wrong ref or loses recovery evidence.
  Mitigation: Track only branches created by the current task, record their SHAs, compare-and-delete only after the authoritative feature-branch commit succeeds, and retain/report every branch on mismatch or failure.
- Risk: Generic agent configuration accidentally publishes sensitive task context.
  Mitigation: Track only declarative agent policy, disable subagent transcript/session persistence where supported, and keep sessions, task packets, memory, credentials, and runtime outputs ignored.
- Risk: A worker changes paths outside the declared task scope.
  Mitigation: Compare branch paths to the task packet before review; reject unexpected paths and never integrate them.
- Risk: Existing `agent/settings.json` changes are accidentally committed with this feature.
  Mitigation: Preserve the baseline, stage explicit task paths only, and exclude settings noise from the plan.

## Open Questions
- None.
