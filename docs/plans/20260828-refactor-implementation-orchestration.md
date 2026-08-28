# Refactor Implementation Orchestration into Reusable Contracts

## Overview
Refactor the 540-line `implementation` skill and its two custom agents into a smaller coordinator entry point backed by reusable protocol, packet, checkpoint, and shared agent-instruction artifacts. Preserve every safety gate while removing repeated explanations, making role boundaries authoritative in agent frontmatter, and adding automated contract checks to prevent prompt drift and renewed bloat.

## Source Spec
- Spec: `prompt: Refactor the implementation skill and agents to follow coding best practices, stay precise and simple, and use reusable artifacts instead of overexplaining simple behavior.`
- Status: Approved
- Last reviewed: 2026-08-28

## Repository Context
- `agent/skills/implementation/SKILL.md` — current 540-line/33 KB coordinator protocol; task packets, blockers, Git gates, and correction behavior are repeated across sections.
- `agent/agents/implementation-worker.md` — isolated coding role; currently relies on the caller, rather than frontmatter, to force foreground worktree execution.
- `agent/agents/task-reviewer.md` — read-only review role with an embedded report contract and repeated packet rules.
- `agent/skills/` — Pi and pi-subagents both support named skill preloading, allowing common agent instructions to be shared instead of copied into both prompts.
- `agent/subagents.json` — fail-closed dispatch (`fallbackSubagent: "none"`) and transcript policy that must remain unchanged.
- `agent/npm/node_modules/@tintinweb/pi-subagents/README.md` — authoritative behavior for custom-agent frontmatter, foreground execution, worktree isolation, preserved `pi-agent-*` branches, and removed worktrees.
- `/usr/local/lib/node_modules/@earendil-works/pi-coding-agent/docs/skills.md` — supports progressive disclosure through `references/`, `scripts/`, and `assets/` resolved relative to `SKILL.md`.
- `README.md` — duplicates lifecycle policy; it currently describes one correction cycle while the skill allows three.
- `docs/plans/20260811-subagent-orchestrated-implementation-skill.md` — historical behavior baseline and disposable scenarios.
- `.github/workflows/` — contains package publishing only; no CI currently validates skill/agent contracts.
- `.gitignore` — already allowlists `agent/skills/**`, `agent/agents/**`, and `.github/workflows/**`.

## Implementation Constraints
- Preserve coordinator ownership of plan state, the main index, authoritative commits, transport-ref cleanup, and the concise recovery checkpoint.
- Preserve sequential tasks, a clean-index boundary, unrelated dirty-file protection, committed-HEAD worktree bases, branch ancestry/no-merge/path checks, fresh independent review, main-tree verification, bounded corrections, and one task-only authoritative commit.
- Preserve the current default correction budget: three correction workers after the initial worker, with one explicitly authorized extra cycle after a blocked resume.
- Preserve exact agent names, models, reasoning levels, tool scopes, session/transcript policy, and fail-closed dispatch.
- Make fixed execution policy authoritative in frontmatter: `implementation-worker` is foreground + worktree; `task-reviewer` is foreground + no worktree. The coordinator still verifies effective configuration before delegation.
- Preload only a compact `implementation-agent-contract` instruction skill into both agents; keep extensions disabled and do not inherit the parent’s other skills.
- Agent skill selection is static frontmatter, not a per-call parameter. The shared skill owns stable role-neutral rules; the coordinator must still render task-specific templates and guidance into each self-contained packet.
- Use only Node.js built-ins in validation scripts; do not add dependencies or a coordinator extension.
- Brevity must not remove a safety gate. Simple facts get one canonical owner and are referenced elsewhere.
- Keep all tracked artifacts generic, secret-free, and free of run transcripts or repository-specific runtime state.

## Assumptions
- “Reusable artifacts” means versioned coordinator files inside `agent/skills/implementation/` plus one preloaded `implementation-agent-contract` skill shared by the worker and reviewer.
- The shared agent skill contains only stable packet semantics and common safety rules; role-specific behavior and exact result schemas remain in the agent definitions and rendered packet templates.
- Markdown remains the packet/report interchange format because the orchestration is model-driven and current reviewers already use exact Markdown output contracts.
- Context-size guardrails are appropriate tests for prompt infrastructure: the active instruction surface should shrink by at least 24% from the current 36,860 characters across the skill and two agents.

## Non-goals
- Do not change `@tintinweb/pi-subagents`, replace it with an extension, or automate orchestration outside the skill.
- Do not weaken Git, review, verification, recovery, cleanup, or protected-branch behavior.
- Do not refactor `implementation-planning`, `learn`, or review skills.
- Do not create persisted per-run state, task packets, transcripts, or evidence files in target repositories.
- Do not rewrite the historical completed implementation plan.

## Task Summary
1. Extract canonical protocol, shared agent instructions, and reusable packet/checkpoint artifacts.
2. Refactor the coordinator and agents around those contracts and add static validation.
3. Add CI/documentation and prove behavior in disposable repositories.

## Implementation Tasks

### Task 1: Extract reusable orchestration contracts

Goal: Give each protocol fact one canonical owner and provide reusable instructions and fillable artifacts for every repeated coordinator handoff.

Context:
- Pi skills support progressive disclosure; only `SKILL.md` must load initially.
- Pi-subagents can preload an explicit skill allowlist from agent frontmatter, but cannot choose task-specific skills per `Agent` call.
- The current skill repeats packet fields, branch gates, blocker handling, and resume behavior in multiple sections.

Files:
- Create: `agent/skills/implementation-agent-contract/SKILL.md` — stable role-neutral packet semantics and safety rules preloaded by both custom agents.
- Create: `agent/skills/implementation/references/protocol.md` — canonical coordinator terms, invariants, state transitions, correction/recovery rules, and blocker-to-resume matrix.
- Create: `agent/skills/implementation/assets/task-packet.md` — fillable worker packet with allowed/protected paths, verification, prohibitions, and exact worker-result schema.
- Create: `agent/skills/implementation/assets/review-packet.md` — fillable review packet with ref evidence, inspection commands, coverage criteria, and exact reviewer-result schema.
- Create: `agent/skills/implementation/assets/checkpoint.md` — compact coordinator resume-state template with one next safe action.

Steps:
- [x] Define a vocabulary table for base SHA, baseline, transport ref, accepted ref, authoritative commit, attempt, correction, and recovery restart.
- [x] Create the shared agent skill with only common packet precedence, scope protection, no-delegation/persistence rules, and concise reporting principles; keep coordinator-only Git state transitions out of it.
- [x] Express the coordinator lifecycle once as a state-transition table; attach each durable mutation to its required preceding gates.
- [x] Consolidate all blocked/resume cases into one decision table, including provider/turn-limit recovery, scope violation, review-budget exhaustion, drift, integration/verification failure, cleanup mismatch, and interrupted learning.
- [x] Create task and review packet templates with explicit placeholders and exact output schemas; templates must carry all context agents need without parent-conversation inheritance.
- [x] Create the checkpoint template with only durable identifiers, concise outcomes, retained refs, the stopped gate, and one next action.
- [x] Keep disposable behavior checks outside tracked artifacts and record only concise evidence.
- [x] Add an ownership note stating which file owns each contract so later edits do not duplicate it.

Verification:
- `for f in agent/skills/implementation-agent-contract/SKILL.md agent/skills/implementation/references/protocol.md agent/skills/implementation/assets/{task-packet,review-packet,checkpoint}.md; do test -s "$f" || exit 1; done``
- `rg -n 'packet|allowed paths|protected paths|delegate|persistent' agent/skills/implementation-agent-contract/SKILL.md`
- `rg -n 'Base SHA|Transport ref|State|Blocked|Resume|WORKER_RESULT|Recommendation: approve|NEXT_SAFE_ACTION' agent/skills/implementation/{references,assets}`
- `git diff --check -- agent/skills/implementation`

Completion criteria:
- Both agents preload one shared instruction skill instead of duplicating stable packet/safety rules.
- Every repeated handoff has a fillable artifact with unambiguous required fields.
- Protocol invariants and blocker behavior have one canonical definition.
- Disposable behavior checks remain outside tracked artifacts.

### Task 2: Refactor the skill and agents around contracts

Goal: Make `SKILL.md` a concise state-machine entry point and make agent frontmatter enforce fixed role policy.

Context:
- Current active instruction size is 36,860 characters: 33,384 in `SKILL.md`, 1,467 in the worker, and 2,009 in the reviewer.
- Subagent frontmatter is authoritative for `isolation`, `run_in_background`, tools, model, thinking, skills, extensions, and persistence.
- The agents preload the shared contract skill, but the coordinator must render templates and task-specific guidance into packets; agents must not discover additional skills at runtime.

Files:
- Modify: `agent/skills/implementation/SKILL.md` — retain selection and orchestration flow; link to canonical protocol/templates instead of restating them.
- Modify: `agent/agents/implementation-worker.md` — concise coding role with authoritative execution frontmatter.
- Modify: `agent/agents/task-reviewer.md` — concise read-only role with authoritative execution frontmatter.
- Create: `agent/skills/implementation/scripts/validate.mjs` — dependency-free contract, link, scope, and prompt-budget validator.

Steps:
- [x] Rewrite `SKILL.md` around `select → preflight → render packet → worker → validate ref → review/correct → integrate → verify → record → cleanup`, with explicit stop conditions and relative links to the owning artifacts.
- [x] Keep plan selection, user-question behavior, completion review, learning gate, and concise final report in the entry point; move detailed field lists and repeated blocker prose to their canonical files.
- [x] Set explicit `name`, `isolation: worktree`, and `run_in_background: false` for `implementation-worker`; preserve its model, `thinking: high`, write-tool scope, persisted session, disabled transcript, and turn limit.
- [x] Set explicit `name`, `isolation: off`, and `run_in_background: false` for `task-reviewer`; preserve its model, `thinking: low`, read-only tool scope, non-persisted session, disabled transcript, and turn limit.
- [x] Replace `isolated: true`/`skills: false` with `extensions: false` and the exact `skills: implementation-agent-contract` allowlist so no other skills or extension tools load.
- [x] Reduce both agent bodies to role-specific behavior and exact result expectations; shared packet, scope, delegation, and persistence rules come from the preloaded skill.
- [x] Implement `validate.mjs` to verify required artifacts and relative links, exact agent types/frontmatter/tool restrictions, required template markers/output contracts, and prompt-size budgets.
- [x] Enforce budgets of at most 250 lines for `SKILL.md` and 28,000 combined characters for the active instruction surface (`SKILL.md`, protocol, shared agent skill, three packet/checkpoint assets, and both agent definitions); print per-file metrics on success.
- [x] Audit every checklist/commit path against the durable-mutation gates after the rewrite; brevity cannot imply a bypass.

Verification:
- `node agent/skills/implementation/scripts/validate.mjs`
- `git diff --check -- agent/skills/implementation agent/agents/implementation-worker.md agent/agents/task-reviewer.md`
- `rg -n '^name: implementation-worker$|^isolation: worktree$|^run_in_background: false$|^persist_session: true$|^skills: implementation-agent-contract$' agent/agents/implementation-worker.md`
- `rg -n '^name: task-reviewer$|^isolation: off$|^run_in_background: false$|^tools: read, bash, grep, find, ls$|^skills: implementation-agent-contract$' agent/agents/task-reviewer.md`
- Fresh Pi session: `/agents` shows both exact types with the intended models, isolation, foreground policy, tool scopes, and only the shared contract skill; unknown dispatch still fails closed.
- Manual protocol audit: every plan mutation and authoritative commit remains gated by successful worker outcome, validated transport ref, fresh approval, accepted-tree integration, and passing main-tree verification.

Completion criteria:
- The initial skill load is a focused coordinator workflow no longer than 250 lines.
- Active runtime instructions, including the shared agent skill, fit the 28,000-character budget without omitting current safety or recovery behavior.
- Fixed execution policy is enforced by agent configuration and the shared skill instead of repeated caller prose.
- Static validation fails on missing artifacts, broken links/contracts, writable reviewers, incorrect isolation/foreground policy, or prompt-budget regressions.

### Task 3: Add regression checks and prove behavior

Goal: Keep the refactor maintainable and demonstrate behavior equivalence under success and failure.

Context:
- README duplicates protocol details and has already drifted from the current correction budget.
- Existing workflows do not validate global skills or custom agents.
- The repository requires orchestration behavior checks in disposable Git repositories, never in this configuration checkout.

Files:
- Modify: `README.md` — replace duplicated lifecycle/correction prose with a concise overview and links to canonical implementation artifacts.
- Create: `.github/workflows/validate-implementation-orchestration.yml` — run the dependency-free validator on pushes and pull requests that touch implementation artifacts.
- Modify: `docs/plans/20260828-refactor-implementation-orchestration.md` — record exact verification and disposable behavior evidence while completing tasks.

Steps:
- [x] Keep README’s restoration, tracked-file, public-boundary, and high-level lifecycle information; link detailed protocol and behavior to the skill artifacts instead of copying it.
- [x] Add a minimal Node CI job that checks out the repository and runs `node agent/skills/implementation/scripts/validate.mjs` with no dependency installation.
- [x] Run disposable behavior checks in a temporary feature-branch repository with a committed source file, one unrelated dirty file, and a one-task plan.
- [x] Verify the success path: worker-only transport changes, read-only approval, main-tree verification, checklist update, one authoritative task commit, compare-and-delete cleanup, and byte-identical unrelated dirty content.
- [x] Verify a reviewer-rejection path uses fresh worker/reviewer instances, retains the unchanged task base, respects the correction budget, and cannot commit an unapproved result.
- [x] Verify one controlled failure (protected branch or failed verification) leaves the task unchecked, creates no authoritative commit, preserves unrelated changes, and retains/reports recovery refs when present.
- [x] Record exact commands, SHAs, branch/ref outcomes, and PASS/FAIL results in this plan; do not commit disposable fixtures or runtime artifacts.

Task 3 evidence (2026-08-28):
- `node agent/skills/implementation/scripts/validate.mjs` — PASS: coordinator 63 lines; active instruction surface 27,885 characters.
- `git diff --check` and `git diff --cached --check` — PASS. Main checkout status contained only the staged Task 3 README/workflow delta before plan recording.
- Disposable Git behavior harness in temporary repositories — PASS. Success Base `21dab46e8a523f9612d04c3ee732f882c23cf4af`, transport `49ce9b86e69358d88b314f2a2465fd5d9d7d96b3`, authoritative commit `2e1d982964051b344d7de96928c4d03cd70f5c3c`, accepted ref absent after compare-delete. Rejection Base `e2435309f7173b322129ce84c0ae82137f790e3e`, rejected ref `4afc53c5bdaa40f7308de1f8c321f9098b4866f4`, fresh Base correction `b0ab99d91e1fe63a5a7b7206d23331d1631e2501`, authoritative commit `41778bfb7dd2c79de57141426cc08b157af82fbc`, correction `1/3`, both refs absent after compare-delete, no rejected history. Controlled failure/recovery Base `1e6fa1e332d98089e0ae217a16d81d9ae9f8b1a0`, verifier status `1`, failure ref `b975376d58142e14d021612b2e691d82a5a8b5b6`, fresh recovery ref `2e0b9c402f2f05ea1874b9ab54f89997d7a225d3`, coordinator unchanged, failure/recovery refs retained.
- Fresh headless Pi success command (`/usr/local/bin/pi --provider openai-codex --model gpt-5.6-sol --thinking high --print --no-session --approve <implementation prompt>`) — PASS in a disposable feature-branch repository. Base `e2f75379acba1031c3a3487d26dd456ed7361750`; authoritative commit `59093df276e62fee283381d65ac1d42d8aa44300`; exact commit paths `plan.md` and `src/greeting.txt`; worker and task/final reviewers approved; task checks passed; transport ref compare-deleted; unrelated untracked content stayed byte-identical at SHA-256 `e8310b6efca47f06289b206406b94c961f2f7bd1e70670faa83886a1933813e8`.
- Fresh headless Pi unknown-agent dispatch with `subagent_type: definitely-unknown-orchestration-agent` — PASS: dispatch refused under `fallbackSubagent: none`; HEAD/status/refs unchanged. Static validator and the live success run confirmed the exact worker/reviewer definitions and one-skill `implementation-agent-contract` allowlist.
- Fresh headless Pi protected-branch command using the implementation skill — PASS: `main` stayed at `1197fc00e60f103af4d5bfd601ec2874df456a08`; plan remained unchecked; no authoritative commit or transport ref was created; `plan.md` and `unrelated.txt` remained the only untracked paths; unrelated SHA-256 stayed `42edd069c415f524bf9859cf555f6cc53dea0cbbb07e9678823484fce488dca2`.
- Every temporary repository was removed after evidence capture; no fixture, transcript, session, credential, or runtime artifact was added to this repository.

Verification:
- `node agent/skills/implementation/scripts/validate.mjs`
- `git diff --check`
- `git status --short --untracked-files=all`
- Fresh Pi `/agents` discovery and fail-closed dispatch check.
- Disposable success, rejection, and controlled-failure behavior checks.

Completion criteria:
- CI prevents contract, scope, link, and prompt-budget regressions.
- README has no independent correction-count or disposable behavior implementation that can drift from the skill.
- Recorded behavior evidence confirms the refactor preserves success, rejection, failure, baseline protection, and transport-ref semantics.

## Cross-Task Verification
- `node agent/skills/implementation/scripts/validate.mjs`
- `git diff --check`
- `git status --short --untracked-files=all`
- Fresh Pi session: exact agent types resolve with authoritative frontmatter, preload only `implementation-agent-contract`, and unknown types fail closed.
- Disposable repositories: success, rejection, and controlled failure all satisfy the recorded behavior checks.
- Manual end-to-end audit confirms no checklist or commit path bypasses worker success, ref validation, independent approval, integration, or main-tree verification.

## Risks and Mitigations
- Risk: Extracting prose hides or drops a safety invariant.
  Mitigation: Inventory current gates into the protocol table first, then run the durable-mutation audit and behavior scenarios before acceptance.
- Risk: Shared skill preloading accidentally grants unrelated instructions or hides task-specific context.
  Mitigation: Use an exact one-skill allowlist, keep extensions disabled, and continue rendering complete task/review packets with applicable guidance.
- Risk: Frontmatter changes alter agent execution unexpectedly.
  Mitigation: Use documented authoritative fields, validate them statically, and confirm effective configuration in a fresh Pi session.
- Risk: Prompt-size tests encourage terse but ambiguous wording.
  Mitigation: Required markers, state transitions, exact output schemas, and behavior checks are acceptance gates alongside size budgets.
- Risk: README and runtime policy drift again.
  Mitigation: README links to canonical artifacts and CI rejects broken contracts or links.

## Open Questions
- None.
