# Implementation orchestration protocol

This is the canonical definition of implementation lifecycle, safety gates, and
recovery. Packets carry current task values. Reusable handoff fields live in the
packet templates.

## Canonical vocabulary

| Term | Meaning |
| --- | --- |
| **Base SHA** | Committed `HEAD` captured immediately before a task attempt. |
| **baseline** | Complete pre-task working-tree/index state and content identity. |
| **transport ref** | New `pi-agent-*` branch produced by a worker; review/recovery input only. |
| **accepted ref** | Transport ref approved by a completed revmux review. |
| **authoritative commit** | Coordinator task-only commit made from the accepted tree delta. |
| **attempt** | Initial, correction, or recovery worker execution for one task. |
| **correction** | Fresh worker from unchanged Base SHA addressing material, decision-free findings. |
| **recovery restart** | Fresh worker from unchanged Base SHA after provider, turn-limit, or interruption failure. |
| **revmux task/round** | Temporary external-review archive and one review execution within it. |
| **worker reasoning** | Coordinator-selected `thinking` level: `medium`, `high`, or `xhigh`; default `high`. |

## Invariants and ownership

- Tasks and each task's worker/revmux cycle are sequential. Never overlap a worker with
  the revmux review of the ref it may replace: review only immutable transport trees. The
  coordinator alone owns plan/checklist state, the main index, active branch, integration,
  authoritative commits, and `pi-agent-*` cleanup.
- The worker model, tools, isolation, and role remain fixed. The coordinator chooses one
  allowed worker reasoning level per attempt, records it in the packet/checkpoint, and
  passes it explicitly to `Agent`; `high` is the default.
- The index is clean at every delegation boundary. Active branch, `HEAD`, Base SHA, and
  baseline remain unchanged until an approved delta is integrated.
- A valid transport ref is new, descends from Base SHA, has no merge commits, agrees with
  the worker report, and changes only allowed paths plus bounded scope additions. Protected
  paths are immutable.
- Revmux is an external, read-only review service for this workflow. It may inspect the
  exact transport ref but must not edit source, mutate Git, update checklists, or commit.
  Its task archive and reports live in a temporary directory outside the repository.
- A completed, non-degraded revmux report with no blocking findings or questions is the
  required independent approval before integration. Revmux exit `0` (no findings) and `1`
  (findings reported) both mean the pipeline completed; exit `2` is a tool failure.
- Integration applies a path-limited binary delta, never a worker commit or merge. One
  accepted task produces one authoritative task-only commit.
- Failed, rejected, or interrupted runs retain relevant transport refs. Cleanup is
  compare-and-delete only for refs created by this run and only after a successful commit.

## Lifecycle and durable-mutation gates

A first-pass success follows:
`Ready → Delegated → Worker validated → Review requested → Reviewed → Integrated → Verified → Recorded → Committed → Cleaned → Learned`.

| State | Required gates | Durable mutation permitted |
| --- | --- | --- |
| **Ready** | Select first unchecked task; read plan/spec/guidance; capture branch, Base SHA, baseline, clean index, allowed/protected paths, checks, and worker reasoning level. | None |
| **Delegated** | Worker, revmux, and configured child CLIs available; launch fresh worker from committed Base SHA. | None |
| **Worker validated** | Success report; new ref; ancestry/no-merges; report/path agreement; requested checks; branch/Base SHA/index/baseline; scope. | None |
| **Review requested** | Create temporary revmux task/round, write scope/goal from returned paths, and hand the exact ref and evidence to revmux. | None |
| **Reviewed** | Revmux exit 0/1; valid required JSON; all expected sources reported; no degraded/unverified source or unresolved question; findings are empty after confirmed/refined findings are handled. | None |
| **Integrated** | Recheck branch/Base SHA/index/baseline/ref and review result; apply accepted path-limited delta; inspect staged names/content/check. | Accepted task paths may be staged; no checklist/commit mutation. |
| **Verified** | Every task command passes in the main tree; protected paths remain unchanged. | None until all checks pass. |
| **Recorded** | Reread completion criteria; every required step is observable. | Change only current-task checkboxes, then stage plan plus task files. |
| **Committed** | Recorded and staged; staged scope/check passes. | One authoritative task-only commit on feature branch. |
| **Cleaned** | Commit succeeded; recorded ref SHAs still match. | Compare-delete this run's refs and remove temporary revmux archive. |
| **Learned** | Concise evidence ledger and clean-up outcome. | Only user-confirmed learning changes. |

A correction enters `Correcting`, uses the unchanged Base SHA and complete original worker
packet plus only material task-scoped findings, then returns through worker validation and a
fresh revmux round. The worker must either fix each finding or provide a concrete `Review
response` for every unchanged finding; the coordinator passes that response into the next
revmux goal but cannot dismiss a finding on the worker's say-so. A rejected ref is never
integrated. A recovery restart may restore only a validated binary delta and does not consume
correction budget.

Track consecutive correction cycles whose transport tree is byte-identical to the preceding
reviewed candidate as `no_change_cycles`. Reset it when the worker changes the candidate
and the change is validated. Stop/report with the checklist unchecked at three consecutive
no-change cycles, even if the ordinary correction budget has room; retain the refs, reports,
and worker responses for an explicit user decision.

## Bounded scope reconciliation

Before revmux, the coordinator may add a changed path to the final allowed list only when:

1. The worker lists it under both `Changed paths` and `Scope additions requested`, with a
   concrete necessity tied to an explicit task requirement.
2. It is tracked, clean in the baseline, not protected/generated/plan/checklist/
   credential/runtime/Git metadata/dependency/lockfile/unrelated configuration.
3. The complete diff is minimal and mechanically required to compile, test, document, or
   expose the required behavior, with no new product, architecture, security, dependency,
   compatibility, or scope decision.
4. All ref, report, diff-check, verification, branch, index, and baseline gates pass.
5. The initial list, addition rationale, inspection evidence, and final list are recorded
   in the checkpoint and revmux packet.

There is no arbitrary file-count cutoff. Any broad expansion is under-scoped work and must
stop. A missing worker report path or any failed condition is a scope violation, not a
reconciliation opportunity.

## Revmux review contract

For each review, use a new temporary tasks directory and the exact absolute paths emitted
by `revmux new`; never construct paths or create `.revmux/` in the repository. Write a
short `scope.md` containing the Base-SHA-to-transport-ref commands, scale, complete changed
file list, and explicit read-only/protected-path rules. Write `goal.md` with the task goal,
completion criteria, and a material-finding severity bar. Invoke revmux with `--workdir`
set to the repository, `--tasks-dir` set outside it, `--task`, `--run`, `--profile
comprehensive`, and `--no-tui`, capturing stdout separately from stderr.

Validate the report before approval: `scope.task`/`run`, `sources.expected` equals
`sources.reported`, `sources.degraded` is empty, all four result lists are arrays, each
finding has a path/line/severity/confidence/title/body/fix/verdict, and `stats` exists.
Treat confirmed/refined findings as correction requests. Treat non-empty `open_questions`,
any unverified finding, malformed JSON, missing fields, degraded sources, exit `2`, or a
failed post-review baseline check as blocked. Record `pre_existing` and `immaterial` but
do not turn them into corrections. Recheck the repository after the run because revmux
subprocesses are not authorized to mutate it.

## Correction and recovery rules

The initial worker may have at most three fresh correction workers. One additional bounded
cycle requires explicit user authorization after a blocked resume. Every correction starts
from the unchanged Base SHA and gets a fresh worker and revmux round; preserve the temporary
archive until the task is committed or the run is stopped. Provider/turn-limit/incomplete
worker failures use a fresh recovery worker, never native resume. If a recovery ref is safe,
restore only:

```sh
git diff --binary <base>...<recovery> | git apply
```

Do not cherry-pick, merge, rebase, or use transport history.

## Blocked / resume decision matrix

| Blocker | Required action | One safe resume action |
| --- | --- | --- |
| Missing/malformed worker or revmux/CLI | Do not fall back; retain state. | Restore the named dependency and revalidate preflight. |
| Provider/turn-limit/incomplete worker | Do not review/integrate; retain ref/error. | Fresh recovery worker from unchanged Base SHA, with validated binary delta if safe. |
| Revmux exit 2, invalid report, degraded source, or failed baseline check | Do not integrate; retain ref and report. | Fix the environment/input or re-run a fresh round from the same validated ref. |
| Confirmed/refined finding or unresolved open question | Do not integrate; retain accepted candidate as unaccepted. | Apply only decision-free fixes with a fresh correction worker; ask the user for questions. |
| Unreconcilable scope | Reject before review/integration; retain offending ref. | Resolve scope, then restart from unchanged Base SHA with corrected packet. |
| Exhausted review budget | Leave checklist unchecked and retain refs/findings. | User authorizes one bounded correction or supplies corrected inputs. |
| Three consecutive no-change correction cycles | Stop automatic correction; leave checklist unchecked and retain refs/reports/responses. | User supplies a decision or explicitly authorizes a bounded next action. |
| Invalid worker reasoning selection | Do not delegate; retain state. | Choose `medium`, `high`, or `xhigh`, record it, and revalidate preflight. |
| Branch, `HEAD`, index, or baseline drift | Stop before integration/checklist/commit. | Restore or record intended state, then revalidate identifiers. |
| Integration conflict or verification failure | Preserve accepted ref; do not record/commit. | Repair main tree, rerun all checks, and reapply/revalidate the accepted delta. |
| Cleanup mismatch | Do not force-delete or touch another run's ref. | Compare-delete only at the recorded SHA after resolving ownership. |
| Interrupted learning | Do not undo task work or persist raw evidence. | Resume the learning confirmation/placement step. |

After resume, reread the plan and checkpoint, inspect status, and revalidate the recorded
identifiers before taking exactly the named safe action.

## Contract ownership

- This file owns vocabulary, invariants, lifecycle gates, scope reconciliation, revmux
  review semantics, correction/recovery, and the blocked/resume matrix.
- `implementation-agent-contract/SKILL.md` owns worker packet precedence and worker safety.
- `assets/task-packet.md` owns implementation-worker handoff, correction response, and result schema.
- `assets/review-packet.md` owns revmux paths, invocation, JSON validation, and classification.
- `assets/checkpoint.md` owns compact coordinator resume state.
