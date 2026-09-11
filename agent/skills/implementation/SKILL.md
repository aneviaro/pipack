---
name: implementation
description: Run every task in a grounded implementation plan, then perform one bounded revmux review of the complete result.
---

# Implementation

The Pi coordinator owns checklists, refs, commits, cleanup, and learning. The
implementation worker is a Pi subagent; review is performed by the external
`revmux` CLI. Read [protocol](references/protocol.md), [worker packet](assets/task-packet.md),
[revmux packet](assets/review-packet.md), [checkpoint](assets/checkpoint.md), and the
[worker contract](../implementation-agent-contract/SKILL.md) before running a plan.

## State machine

For a plan, first implement every unchecked task sequentially, then review the
complete cumulative result:

`select plan → preflight → render packet → worker → validate ref → integrate candidate → verify task → repeat tasks → final whole-plan revmux review/correct (cycles 1-4) → integrate → verify → record → commit → cleanup → learn`.

- **Select:** use the user's plan path; otherwise search the plan directory, then
  `docs/plans/`, `docs/implementation/`, and `docs/implementation-plan.md` for active
  Markdown plans. Select the sole plan; if several, ask one concise
  `ask_user_question` with options/recommendation (plain chat only if unavailable);
  if none, ask for a path. Require `### Task N:`/`### Iteration N:` and enumerate the
  unchecked sections before starting. Do not start revmux while any task remains.
- **Preflight:** read plan/spec/guidance; capture the feature branch, plan Base SHA,
  current candidate SHA, baseline/index, refs, scope, checks, worker reasoning, and
  review profile. Default to the external `implementation-codex` profile produced by
  `scripts/materialize-revmux-profile.mjs`: one all-lens `gpt-5.6-sol:low` finder, then
  `gpt-5.6-luna:xhigh` synthesis and verify. Resolve its Codex-only roster with
  `revmux config`; use another profile only on explicit user request and never switch
  silently. Require clean index and committed candidate bases; refuse `main`/`master`,
  detached/protected branches, drift, ambiguity, unavailable worker/revmux/CLI, or
  baseline conflicts. Stop without mutating the baseline.
- **Render packet/worker:** fill the worker packet in memory with the current task,
  cumulative candidate base, context, scope, prohibitions, and checks. Use the exact
  custom worker type, choose `thinking` explicitly from `medium`, `high`, or `xhigh`
  (default `high`), and use fresh foreground worktree execution with no polling.
  Recovery restarts restore only a validated binary delta from the unchanged candidate
  base; never resume or merge transport history. Validate success, new ref,
  ancestry/no merges, report/path agreement, checks, branch, candidate base, baseline,
  and scope. Reconcile a reported minimal adjacent tracked path under the protocol's
  bounded gate instead of restarting solely because preflight omitted it; reject every
  unreconcilable scope change.
- **Integrate candidate/verify task:** after a successful worker, apply only its
  path-limited binary delta to a coordinator-owned cumulative candidate ref/worktree
  and verify the task there. Keep the candidate clean and committed so the next worker
  has a committed Base SHA. These staging commits are not authoritative and must not
  update checklists or the active feature branch. Continue until every selected task
  has passed; if any task fails, stop before creating a revmux task or round and leave all
  checklists unchecked.
- **Final whole-plan revmux review/correct:** only after all tasks are implemented and
  verified, create a temporary tasks directory outside the repository, use the paths
  returned by `revmux new`, write a complete whole-plan scope and goal, and run fresh
  JSON review rounds against the exact cumulative candidate ref. Keep the archive and
  profile across rounds. Revmux reviews immutable candidate trees, never a live worker.
  There are at most four total review cycles: cycle 1 is the initial review and cycles
  2-4 are fresh correction-worker/review rounds. Cycle 4's goal must request blocking
  changes only (material correctness, security, data loss, build/test, or release
  blockers); record non-blocking observations as immaterial and do not spend another
  cycle on them. Exit 0 or 1 is a completed report; exit 2, invalid or missing JSON, a
  degraded source, an unverified finding, or an unresolved open question blocks
  approval. Confirmed/refined blocking findings prevent approval. A final-review
  correction worker starts from the latest validated cumulative candidate SHA, not from
  an earlier task, and must address each blocking finding or provide a concrete `Review
  response` for the next round. Stop/report at cycle 4 if a blocking finding remains.
  Also stop after three consecutive no-change cycles (byte-identical correction
  candidates).
- **Integrate/verify:** after a clean final review, recheck branch, plan Base SHA,
  baseline, candidate ref, scope, and review result. Apply only the accepted complete
  candidate delta to the active feature branch; never transport history. Inspect staged
  scope/content/check and run every requested main-tree/native check. Stop on malformed
  review, unreconciled scope, baseline/branch drift, or any blocker.
- **Record/commit/cleanup/learn:** only after final review and all main-tree checks pass,
  change all current-task checkboxes and make one authoritative whole-plan commit. Do
  not create task commits before final review. Compare-delete only this run's temporary
  candidate/transport refs, remove the temporary revmux directory outside the repository,
  invoke `learn` with concise evidence, and report cleanup mismatches.

## Safety and efficiency

Preserve sequential task workers, clean-index boundaries, committed candidate bases,
ancestry/no-merge/path checks, independent final whole-plan revmux review, main-tree
verification, bounded corrections, and one authoritative whole-plan commit. Never run
revmux between tasks. Never let revmux edit source, integrate refs, update checklists,
or commit. Never persist packets, transcripts, credentials, or runtime state in a
repository. Bound verbose output and do not repeat expensive checks during retries.
Provider, timeout, turn-limit, or output-limit failures use recovery, not native resume.
If the same unchanged setup/test/contract failure repeats twice, stop and report it.

When no tasks remain, the final review is mandatory; a plan is not complete merely
because all task workers passed. A requested final fix also remains in the final review
phase: use a fresh worker from the latest cumulative candidate, full ref validation, a
new review cycle within the four-cycle limit, accepted-candidate integration, main-tree
verification, and the same single authoritative whole-plan commit. Complete learning
before success.

Every checklist mutation and commit requires successful task workers, validated
candidate/ref deltas, a completed non-degraded final revmux report with no blocking
findings or questions, accepted-candidate integration, and passing main-tree
verification. Report plan/branch, plan Base SHA, candidate/ref SHAs, review task/cycle,
decisions, cleanup, verification, and unchecked tasks or exactly one resume action.
