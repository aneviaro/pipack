---
name: implementation
description: Execute an existing repository-grounded implementation plan task by task, using isolated implementation workers and read-only reviewers while the main session retains plan, Git, verification, and commit authority.
---

# Implementation

Execute a saved implementation plan as a resumable, coordinator-owned task loop. The
main Pi session is the coordinator. It does not implement plan tasks directly:
it delegates each pending task to an `implementation-worker`, obtains a preserved
`pi-agent-*` transport branch, has a fresh `task-reviewer` inspect that ref, and
integrates only an approved result. Plan checkboxes and authoritative commits remain
owned by the coordinator.

This is a skill-only protocol. Use the installed `@tintinweb/pi-subagents` package's
native `Agent` lifecycle, custom agent types, completion notifications, and
`get_subagent_result`. Transport
branches are preservation artifacts, not accepted history. A completed worktree is
removed by the package, so a correction always uses a fresh worker.

## User Input

The user may provide a plan path. If a blocking decision is required, use
`ask_user_question` with one concise question, likely options, and a decisive
`recommendation`. Do not ask in plain chat unless the tool is unavailable. If the
user says to continue after a review rejection, treat that as authorization for the
next bounded correction cycle under this protocol, not as permission to bypass
worker/reviewer gates or implement directly.

## Plan Selection

Resolve the plan in this order:

1. Use the explicit path provided by the user.
2. Otherwise, find Markdown plans with unchecked task items in the repository's established plan directory, then in `docs/plans/`, `docs/implementation/`, and `docs/implementation-plan.md`.
3. If exactly one active plan is found, use it.
4. If multiple active plans are found, use `ask_user_question` to select one.
5. If none is found, ask for the plan path.

An executable plan contains at least one heading matching `### Task N:` or
`### Iteration N:`. Task state is represented by checklist items inside that section.
Completed sections are skipped. The first section containing an unchecked item is the
next task. Do not reorder tasks, infer a replacement task, or mark a later task while
working on an earlier one.

## Coordinator invariants

The following invariants apply for the whole run:

- Tasks remain sequential. Do not launch implementation workers for independent plan
  tasks in parallel.
- The main session alone may edit plan checkboxes, stage files, or create
  authoritative commits. Workers never use the main working tree, and reviewers never
  edit code.
- Every task has one implementation worker followed by a sequence of correction cycles. Each
  correction cycle uses a fresh implementation worker and a
  fresh reviewer from the unchanged task base. The coordinator may continue through
  reviewer-requested changes while findings are material, task-scoped, within the
  frozen allowed paths, and require no new product decision. Stop only when the
  correction budget is exhausted, a finding requires a new decision or expanded
  scope, or a safety gate fails. Default correction budget: three correction cycles
  after the initial worker; after that, a user may explicitly grant one additional
  bounded cycle at a blocked resume point.
- Every accepted task has one authoritative commit on the captured active feature
  branch. The worker's preservation commit(s) and `pi-agent-*` ref are never merged or
  retained as task history.
- A task's base is the committed `HEAD` captured immediately before its delegation.
  Before worker launch, review, correction, integration, checklist mutation, and
  commit, confirm that the active branch, `HEAD`, and baseline ownership still match
  the coordinator's recorded state.
- The coordinator preserves unrelated dirty files byte-for-byte and never stages them.
  The index must be clean at each delegation boundary.
- Keep only concise worker reports, reviewer findings, verification results, and
  coordinator decisions in the main conversation/evidence ledger. Never persist raw
  transcripts, sessions, task packets, credentials, or runtime memory merely for
  learning.

## Preflight

Before implementing any task:

1. Read the full plan and any source spec it identifies. Read repository guidance files
   that apply to the plan and current task. Confirm headings are ordered and every
   pending task has concrete steps, verification commands, and completion criteria.
2. Resolve the repository root and capture `git status --short --untracked-files=all`,
   the active symbolic branch, and `git rev-parse HEAD`. Capture the working-tree
   baseline as the complete porcelain status, path list, and content identity of every
   pre-existing tracked or untracked path. Capture index state separately; a non-empty
   index is a blocker, not something to preserve by silently resetting.
3. Capture the active feature branch and `base SHA` (the current committed `HEAD`).
   Automatic commit mode must refuse to run on `main` or `master`; a detached `HEAD`,
   protected branch, or branch drift is also unsafe for this protocol. Do not silently
   switch branches. If commits were explicitly disabled, stop rather than falling back
   to a direct implementation loop that a worktree worker cannot observe.
4. Record all existing `pi-agent-*` refs and their SHAs before launching anything, for
   example with `git for-each-ref refs/heads/pi-agent-*`. They belong to another run or
   are pre-existing recovery evidence and are never deleted by this run.
5. Verify exact custom agent availability before reading work to a worker. The
   configured types must be named exactly `implementation-worker` and `task-reviewer`.
   Verify that they resolve to the intended fail-closed definitions and do not fall
   back to `general-purpose`, with the required write/read-only tool scopes. If either
   type is missing, disabled, ambiguous, misspelled, or falls back, stop before
   delegation.
6. Require a clean index. Compare the next task's pending inputs with the baseline's
   uncommitted paths: source, tests, fixtures, generated inputs, guidance, and any
   expected output path that the worker must read from its worktree. If an input
   overlaps an uncommitted path unavailable to a worktree worker, block delegation.
   Inline plan/spec/guidance text in the task packet can remove the need to read those
   particular dirty documents, but it does not make dirty source or expected output
   files safe. Never overwrite, stage, discard, or commit pre-existing changes.
7. Determine the smallest repository-native validation commands from the task and
   repository. Preserve the baseline and these captures in the coordinator's concise
   run state, not in a new repository state file.

At every later task boundary, repeat the relevant checks. A clean index is required
before each new worker because the preceding task must have been committed and its
base SHA refreshed.

## Self-contained task packet

Before launching an implementation worker, construct one complete task packet. Do not
expect a worker to recover context from the parent conversation or from a plan file
that is absent from its worktree. The packet contains, in explicit labeled fields:

- repository root, active feature branch, captured `base SHA`, and the fact that the
  worker has `isolation: "worktree"` and starts from committed `HEAD`;
- plan path and the source-spec path, plus the relevant source-spec text rather than
  links alone;
- the exact complete `### Task N:` or `### Iteration N:` section, including its goal,
  context, files, steps, verification, evidence, and completion criteria;
- applicable repository guidance paths and the relevant guidance text;
- dependency invariants and observable outputs from earlier checked tasks, without
  copying unrelated conversation;
- the expected/allowed paths, including permitted generated artifacts, and the
  protected baseline paths (all unrelated pre-existing dirty paths, protected config,
  and any path that must remain byte-identical);
- the exact verification commands, their working directory and required environment,
  and the completion criteria the coordinator will independently check;
- explicit prohibitions: implement only this task; do not edit plan files or checklist
  items; do not stage, commit, amend, merge, rebase, reset, push, or switch the active
  branch; do not edit protected or unexpected paths; do not delegate or invoke nested
  agents; do not write transcripts, sessions, credentials, or persistent memory; and
  report all changed paths and verification outcomes concisely.

The packet is also the review contract. Save a concise copy in the main conversation
only as needed for the current run; it is not a file to commit or persist.

## Task loop

Repeat the following workflow for exactly one pending task section at a time.

### 1. Load and freeze the task

Read the complete task section, its plan/spec context, applicable guidance, dependency
invariants, verification commands, and completion criteria. Inspect only the source,
tests, fixtures, contracts, and generated-code workflow needed for this task. Compute
the allowed and protected path sets and freeze them into the task packet. If the task
requires an uncommitted input that cannot be supplied safely in the packet, stop
before launching a worker.

### 2. Launch the implementation worker

Invoke the installed package's native `Agent` with the exact custom type
`implementation-worker`, the complete task packet, `isolation: "worktree"`, and
`foreground` execution (`background: false`). The worker must implement only the
packet, run its requested checks, and return a concise report containing success or
failure, changed paths, verification commands/results, and blockers. It must not
modify the main tree, plan checkboxes, or Git history. The package may automatically
preserve its completed work as a `pi-agent-*` transport branch and remove the worker
worktree; that preservation is expected and is not an authoritative commit.

Initial implementation is always foreground because the next validation depends on
its branch. Background mode is allowed only for genuinely independent coordinator
work. If it is ever used, consume completion through the package notification or at
most one blocking `get_subagent_result(wait: true)` call for that invocation. Never
periodically `poll` or loop on a non-blocking result, and never use background mode to
parallelize plan tasks.

### 3. Validate the worker result and transport branch

Do not review or integrate until all checks pass. Record the branch name and SHA
returned by the successful worker outcome and require that it is a newly created
`pi-agent-*` ref, not one recorded in the preflight ref set. Validate from the main
repository:

- the worker result explicitly reports success; a timeout, error, incomplete result,
  or missing report is failure;
- `git show-ref --verify refs/heads/<transport>` succeeds and the ref SHA is recorded;
- `git merge-base --is-ancestor <base SHA> <transport>` succeeds, and
  `git rev-list --merges <base SHA>..<transport>` is empty;
- `git diff --name-only <base SHA>...<transport>` is non-empty only for the packet's
  expected/allowed paths. No protected baseline, plan, checklist, unrelated, or
  generated runtime path may appear. Verify path status and content as necessary;
- the worker report's changed paths exactly agree with the ref delta and its requested
  verification is successful;
- the active branch and main `HEAD` still equal the captured feature branch and base
  SHA, the index is still clean, and every pre-existing baseline path still has its
  captured content/status. Main HEAD or baseline ownership drift blocks the task.

A worker failure, no branch, missing branch, pre-existing ref reuse, merge commit,
unknown path, protected-path change, failed worker verification, or any mismatch is a
blocked task. Do not ask the reviewer to bless it and do not mutate a checkbox or
commit. Retain and report any current-run transport ref for recovery.

### 4. Fresh independent task review

Launch a fresh foreground `task-reviewer` in the main repository. The reviewer is
read-only and inspects refs; it does not receive a worker worktree and must not use
`write`, `edit`, staging, or any Git mutation. Pass the exact original task packet,
plus all of the following dynamic fields:

- captured base SHA and active feature branch;
- exact transport branch name and recorded SHA;
- exact changed-path list from the validated branch;
- the worker's concise report and worker verification evidence;
- commands to inspect `git diff <base>...<branch>` and, for every changed path,
  `git show <branch>:<path>`;
- the expected review output: material findings with path/line and severity, task and
  plan coverage, verification evidence, and exactly `approve` or `request changes`.

Require the reviewer to compare the branch to the exact task, source spec, packet
prohibitions, dependency invariants, allowed/protected paths, correctness, regressions,
security/privacy, and verification quality. A malformed, unavailable, or non-decisive
review is not approval. Keep only its concise findings and decision in the evidence
ledger; do not persist its transcript.

### 5. Bounded correction and re-review

If any task reviewer says `request changes`, do not integrate the rejected branch.
Confirm that the main branch, base SHA, index, and baseline are unchanged. If the
review findings are material, task-scoped, compatible with the frozen allowed paths,
and require no new product decision, launch the next correction cycle while correction
budget remains. Use a fresh `implementation-worker` from the unchanged base with
`isolation: "worktree"`, foreground execution, the full original task packet, and a
concise correction section containing only the material findings and the latest
validated rejected branch name/SHA as read-only implementation evidence. The worker
may inspect that branch or its diff, but it must produce a new transport branch whose
merge base is the unchanged task base. Do not resume, steer, or reuse the completed
worker: its worktree has been removed and its transport history is not an accepted
history base.

Validate every correction branch with the same result, ancestry, no-merge, scope,
worker-report, and baseline-drift gates. Then launch a fresh foreground
`task-reviewer` with the same exact task packet and the replacement branch details.
Repeat only while correction budget remains and each rejection is still narrow,
task-scoped, and decision-free. The default budget is three correction cycles after
the initial worker; when exhausted, stop with all current task checkboxes unchecked,
do not integrate, update the plan, or create an authoritative commit, and report the
latest findings plus all current-task transport refs. A user may explicitly authorize
one additional bounded cycle at resume time; record that authorization in the concise
evidence ledger. Worker or branch failure during any correction is blocked and does
not count as approval.

Only an explicit approval for the currently accepted branch can proceed.

### 6. Integrate the approved transport tree without its history

Before integration, recheck the active feature branch, main `HEAD == base SHA`, clean
index, baseline ownership, accepted branch SHA, and accepted path set. Integrate the
tree delta, not the transport commits: apply the binary-safe diff from
`git diff --binary <base SHA>...<accepted-branch>` limited to the validated allowed
paths into the main worktree, without merge or cherry-pick of the `pi-agent-*` history.
Stage only those accepted task paths and inspect the staged task delta:

- `git diff --cached --name-status` and `git diff --cached --stat` contain only
  accepted task paths;
- `git diff --cached --check` passes;
- the staged content matches the accepted branch for every changed path; and
- no pre-existing baseline path, index entry, plan file, or protected path changed.

Treat an apply conflict, staged scope mismatch, content mismatch, or baseline drift as
an integration blocker. If rollback is needed, reverse only the coordinator-applied
accepted delta using a checked, path-limited operation; preserve all baseline files and
the transport refs. Never use a broad reset or checkout to clean up a conflict.

Run every task verification command in the main tree against the integrated staged
content, plus the smallest relevant repository-native test/typecheck/lint/build gate.
A worker's passing check is evidence, not a substitute for main-tree verification.
Check status and protected paths again after commands that can generate files. A
failed, skipped, unverifiable, or newly out-of-scope verification leaves the task
unchecked, prevents commit, and retains the accepted transport ref for recovery.

### 7. Record the task and create the authoritative commit

Only after worker outcome and branch validation, independent reviewer approval,
successful integration, and passing main-tree verification may the coordinator mutate
anything durable. Change `[ ]` to `[x]` only for steps actually completed in the
current task section; never change later sections. Re-read the section and confirm its
completion criteria are observable.

Then stage only the accepted task files plus the plan file. The index must not contain
baseline or unrelated paths. Inspect `git diff --cached --check`, the staged name list,
and the complete staged diff against the task and plan before committing. Create one
authoritative task-only commit on the active feature branch using the repository
convention (or `feat: <task title>` when none exists). Never amend, merge, squash,
rebase, push, or include the transport branch's preservation history. A staging or
commit failure stops without advancing to the next task; preserve the verified state
and report the exact blocker.

Immediately after the authoritative commit succeeds, set the next `base SHA` to the
new `git rev-parse HEAD` and capture a new baseline. Do not launch the next worker
until the new base and clean index are confirmed.

### 8. Compare-and-delete only this task's transport refs

After a successful authoritative task commit, clean only the transport refs recorded
as created by this task's accepted attempt and bounded correction chain, including
rejected in-scope correction refs and the accepted ref. Never clean refs that were
pre-existing at the run/resume preflight. For each ref, first verify it still points
to its recorded SHA, then use Git's atomic
compare-and-delete semantics, equivalent to:

```sh
git update-ref -d refs/heads/<transport> <recorded-sha>
```

Verify that the ref is gone. Never delete a pre-existing `pi-agent-*` ref, use an
unconditional force-delete, or clean a branch from another run. A changed/missing ref
or failed compare-and-delete is a cleanup mismatch: retain/report the ref and its
expected/actual SHA, do not guess, and stop or resume only after the mismatch is
resolved by an owner. Failure, interruption, review rejection, scope violation, or
verification failure before the authoritative commit retains all relevant transport
refs for recovery.

After the task commit and successful cleanup gate, append concise worker, reviewer,
coordinator, and verification evidence to the run ledger and invoke the `learn` skill.
Give `learn` that accumulated concise evidence, not raw subagent transcripts. Follow
`learn`'s project memory placement rules and its user-confirmation choices; do not
silently write memory, credentials, sessions, or task packets and do not automatically
stage a memory edit in the task commit. If confirmed memory changes create a new
baseline, capture and protect them before continuing and inline applicable guidance
in later packets as needed.

## Completion loop

When no unchecked task items remain:

1. Run every command in `Cross-Task Verification` and any required repository-wide
   gate. Verify the active branch, final history, clean index ownership, and that no
   unexpected files were introduced.
2. Construct a final, self-contained read-only review packet containing the plan and
   relevant spec text, all task completion criteria, the initial and final base SHAs,
   active feature branch, authoritative task commits, complete changed-path list,
   baseline protections, cross-task commands/results, and commands such as
   `git diff <initial-base>...<feature-branch>` and
   `git show <feature-branch>:<path>`. Launch a fresh foreground `task-reviewer` when
   available. It must inspect the complete integrated feature-branch result without
   editing and return plan coverage, material findings, verification evidence, and
   `approve` or `request changes`.
3. Review the complete implementation against the plan for requirement coverage,
   integration correctness, regressions, security/privacy, and missing tests. Fix
   material findings and rerun affected checks, using no more than two full
   review/fix passes as in the original completion loop. Any such fix must remain
   coordinator-controlled and task-scoped: use a fresh isolated implementation
   worker with a self-contained packet for the affected task, then a fresh reviewer,
   integrate its tree delta without transport history, run main-tree verification,
   and create a separate authoritative feature-branch fix commit. Do not directly
   edit code or bypass the worker/reviewer gates. If a final finding cannot be fixed
   within those bounded passes, stop and report it rather than claim completion.
4. After the successful cross-task verification and final review/fix gate, invoke the
   `learn` skill again with the accumulated concise evidence from every worker,
   reviewer, and coordinator decision. Follow its confirmation and project-memory
   placement rules. An interrupted or unavailable final learning step means the
   implementation may be committed and verified but the run is not reported as
   fully complete; retain the concise evidence in the conversation and resume at
   learning without rerunning accepted tasks. Never persist raw transcripts for this
   purpose.
5. Confirm no unchecked items remain in task sections before reporting success.

## Durable mutation audit

This is the mandatory manual protocol audit. For every path that changes a checklist
or creates a commit, the coordinator must be able to point to all of the following
preceding gates: successful worker outcome; validated new transport branch descending
from the captured base with no merge commits and in-scope paths; independent fresh
reviewer approval; accepted tree delta integrated in the main tree; and passing
main-tree task verification. Therefore every checklist mutation and every commit
occurs only after worker/branch validation, reviewer approval, integration, and
passing main-tree verification. No earlier step may mutate a plan checkbox, stage
final accepted task files, or commit. The only staging before verification is the
path-limited integration delta; it is inspected and is not a checklist or commit
mutation. Final checklist staging and the authoritative commit occur only after
verification passes. This audit also applies to any bounded completion-loop fix.

## Blocked and resume behavior

Stop the current loop iteration, leave incomplete plan items unchecked, and report the
exact state rather than guessing in each of these cases:

- **Unavailable agent:** exact `implementation-worker` or `task-reviewer` cannot be
  resolved with the required scope, or a review result is unavailable/malformed. Do
  not fall back to `general-purpose`; resume after agent configuration is restored.
- **Protected branch:** automatic commit mode sees `main` or `master`, a detached
  `HEAD`, or another protected branch. Do not switch branches or create a commit;
  resume on an explicitly supplied feature branch.
- **Worker failure/no branch:** the worker fails, times out, returns no successful
  outcome, or no new `pi-agent-*` branch exists. Do not review or integrate; retain any
  ref and resume with a fresh worker from the same base.
- **Scope violation:** a branch changes an unexpected or protected path, changes the
  plan, or violates packet prohibitions. Reject it before review/integration and
  retain/report the transport ref.
- **Review rejection budget exhausted:** after the configured bounded correction
  cycles, a fresh re-review still requests changes. Stop with task checkboxes
  unchecked; do not create an authoritative commit. Resume only with explicit user
  authorization for one additional bounded cycle or with corrected task inputs; never
  continue an unbounded loop or bypass the worker/reviewer gates.
- **Active-branch drift:** branch name, main `HEAD`, index, or baseline ownership
  changes unexpectedly during worker/reviewer work. Stop before integration or any
  checklist/commit mutation; retain refs and report expected versus observed state.
- **Integration conflict:** path-limited application or staged content checks fail.
  Preserve baseline work, reverse only the coordinator's accepted delta when safe,
  leave the transport ref, and resume after the main tree is repaired by its owner.
- **Failed verification:** any requested main-tree command fails, is skipped, or cannot
  be verified. Keep the task unchecked and uncommitted, retain the accepted ref, and
  report the failing command and one concrete next action.
- **Cleanup mismatch:** a current-task transport ref is missing, changed, or cannot be
  compare-and-deleted at its recorded SHA. Do not delete by force or touch other refs;
  retain/report it. The authoritative commit remains valid, but stop before claiming a
  clean run until ownership is resolved.
- **Interrupted final learning:** do not rerun or undo accepted commits and do not
  persist raw transcripts. Resume the final `learn` confirmation/placement flow with
  the concise evidence ledger before claiming completion.

To resume any blocked run, reread the plan, status, and the recorded base/baseline/ref
state. Treat checked tasks as complete only when repository evidence and their
authoritative commits agree. Start at the first unchecked task, at the named
cleanup/final-learning gate when a task commit already succeeded, or at a bounded
correction cycle explicitly authorized by the user after a review-rejection budget
stop. In that correction resume, keep the original task base unchanged and pass the
latest validated rejected branch only as read-only evidence. Never discard user
changes, rewrite history, or reuse a removed worktree worker.

## Final Report

Be concise. Report:

- plan path and active feature branch;
- tasks completed in this run and authoritative commits created (or that commits were
  disabled/blocked);
- worker and reviewer decisions, transport cleanup status, and the
  cross-task/final-review result;
- verification commands with PASS/FAIL status, including any blocked command;
- remaining unchecked tasks or the exact blocker and one concrete resume action.

Do not claim completion merely because a worker wrote code. Completion requires
validated transport, fresh reviewer approval, successful main-tree integration,
passing verification, task-only authoritative commits, cleanup (or an explicitly
reported cleanup mismatch), completed cross-task gates, and confirmed final learning.

## Behavior Rules

- Execute the selected plan rather than re-plan it; keep one task section in flight.
- Use `implementation-worker` for all coding delegation with `isolation: "worktree"`
  and foreground waiting; use `task-reviewer` as a fresh read-only reviewer.
- Never periodically `poll`; use synchronous foreground completion, notification, or
  at most one blocking `get_subagent_result(wait: true)` for genuine background work.
- Keep the plan as the durable source of task progress and preserve unrelated user
  changes exactly.
- Continue reviewer-requested corrections within the bounded correction budget when
  findings are task-scoped and decision-free; stop only when budget, scope, decision,
  branch, baseline, or verification gates require it.
- Never skip worker/branch validation, independent approval, integration, or main-tree
  verification to advance a checklist or commit.
- Never merge transport history, delete another run's refs, or use destructive Git
  commands.
- Never let workers edit checklists, stage, commit, delegate, or write persistent
  runtime data.
- Ask only when blocked, and report enough exact state for a safe resume.
