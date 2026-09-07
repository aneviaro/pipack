# Implementation orchestration protocol

This is the canonical, reusable definition of the implementation protocol. Packets
carry current task values; this file owns vocabulary, invariants, lifecycle gates,
correction/recovery rules, and blocked/resume decisions. Do not create a competing
protocol definition in a packet or role contract.

## Canonical vocabulary

| Term | Canonical meaning |
| --- | --- |
| **Base SHA** | The committed `HEAD` captured immediately before a task attempt. Every worker transport tree for that task starts from this commit. |
| **baseline** | The complete pre-task working-tree and index state: status, paths, and content identity of every pre-existing change. Preserve it byte-for-byte. |
| **transport ref** | A newly created `pi-agent-*` preservation branch produced by a worker. It is review or recovery input, never accepted history. |
| **accepted ref** | The one transport ref explicitly approved for the current task after independent review. |
| **authoritative commit** | The coordinator's task-only commit on the active feature branch, made from the accepted tree delta rather than transport history. |
| **attempt** | One worker execution for a task: initial, correction, or recovery restart. Number attempts; never resume a removed worktree. |
| **correction** | A fresh worker execution from the unchanged Base SHA addressing material, in-scope, decision-free review findings. It replaces a rejected ref; the rejected ref is never integrated. |
| **recovery restart** | A fresh worker from the unchanged Base SHA after provider failure, turn limit, interruption, or incomplete work. It may restore only a validated binary delta from one recovery ref. |
| **scope reconciliation** | A coordinator validation that adds a worker-reported, previously unlisted tracked path to the final allowed list without restarting, only when it is a minimal adjacent consequence of an explicit task requirement and needs no new decision. |

## Invariants and ownership

- Tasks are sequential. The coordinator alone owns the plan/checklist, index, active
  branch, integration, authoritative commits, and transport-ref cleanup.
- The index is clean at every delegation boundary. Active branch, `HEAD`, Base SHA,
  and baseline remain unchanged until an approved delta is integrated.
- A valid transport ref is newly created, descends from Base SHA, has no merge commits,
  agrees with the worker report, and changes only initially allowed paths plus any
  paths that pass bounded scope reconciliation. Hard-protected paths are immutable.
- A fresh independent read-only review is required before integration. Main-tree
  verification is required before checklist mutation or an authoritative commit.
- Integration applies the path-limited binary delta, not a worker commit or merge.
  One accepted task produces one task-only authoritative commit.
- Failed, rejected, or interrupted runs retain relevant transport refs. Cleanup is
  compare-and-delete only for refs created by this run and only after a successful
  task commit.
- Learning is a final gate, but raw transcripts, sessions, credentials, and evidence
  files are never persisted.

## Lifecycle and durable-mutation gates

A first-pass success follows:
`Ready → Delegated → Worker validated → Review requested → Reviewed → Integrated →
Verified → Recorded → Committed → Cleaned → Learned`.

The correction path is explicit and optional:
`Review requested → Correcting → Delegated → Worker validated → Review requested`.
A reviewer requesting changes enters `Correcting`; it does not enter `Reviewed` and
cannot integrate. After a fresh correction worker is validated, a fresh reviewer is
required. A first-pass approval can skip `Correcting`. **Reviewed means approval
only**, never merely that inspection occurred. Recovery restarts at `Delegated` from
the unchanged Base SHA and are not corrections.

| State | Entry condition and required transition gates | Durable mutation permitted |
| --- | --- | --- |
| **Ready** | First unchecked task; read plan/spec/guidance; capture branch, Base SHA, baseline, clean index, initially allowed paths, and exact hard-protected paths | None |
| **Delegated** | Ready gates pass; launch one foreground worker from committed Base SHA, or a fresh recovery/correction worker from that same Base SHA | None |
| **Worker validated** | Worker reports success; a new transport ref exists; ancestry, no-merges, path/report agreement, requested checks, branch, Base SHA, index, and baseline validate; every changed path is initially allowed or passes bounded scope reconciliation | None |
| **Review requested** | Worker validated; hand the exact ref/tree, initial and final allowed lists, reconciliation evidence, and complete packet to a fresh read-only reviewer | None |
| **Correcting** | Reviewer returns `request changes` with material, task-scoped, decision-free findings; keep Base SHA and baseline unchanged and remain within correction budget | None |
| **Reviewed** | Fresh reviewer inspects the complete current ref and returns decisive `approve`; any rejected ref remains unaccepted | None |
| **Integrated** | Reviewed approval; recheck branch/Base SHA/index/baseline/ref; apply only the accepted path-limited delta and inspect staged names, content, and diff check | Accepted task paths may be staged; no checklist or commit mutation |
| **Verified** | Integrated; every task command passes in the main tree and protected paths remain unchanged | None until every check passes |
| **Recorded** | Verified; reread completion criteria and confirm every required step is observable | Change only current-task checkboxes; then stage task files plus the plan |
| **Committed** | Recorded and staged; inspect staged scope/check and create one task-only authoritative commit on the active feature branch | Authoritative commit; capture new Base SHA and clean baseline |
| **Cleaned** | Authoritative commit succeeded; compare each run-created ref's recorded SHA, then delete atomically and verify absence | Transport cleanup only; retain/report any mismatch |
| **Learned** | Cleaned and evidence is concise; invoke learning under its confirmation and placement rules | Only user-confirmed learning changes, outside the task commit |

Every durable mutation is gated by the preceding validation, independent approval,
integration, and main-tree verification requirements. A correction never integrates
its rejected ref. A recovery restart never uses native agent resume and never changes
the original Base SHA.

## Bounded scope reconciliation

Initial allowed paths are a strong preflight expectation, not a reason to discard an
otherwise valid implementation for a mechanical omission. Hard-protected paths remain
a frozen safety boundary. Before review, the coordinator may add a changed path to the
final allowed list without restarting only when every condition below holds:

1. The worker listed the path under `Scope additions requested`, listed it under
   `Changed paths`, and gave a concrete necessity tied to an explicit task requirement.
2. The path is tracked, was clean in the baseline, is not hard-protected, and is not a
   generated artifact, plan/checklist, credential/session/runtime file, Git metadata,
   dependency or lockfile change, or unrelated configuration.
3. The coordinator inspects the complete path diff and confirms it is a minimal
   adjacent consequence needed to compile, test, document, or expose the explicitly
   required behavior. It introduces no new product, architecture, security,
   dependency, compatibility, or scope decision and contains no opportunistic cleanup.
4. The complete ref still passes ancestry, no-merge, path/report, diff-check,
   verification-evidence, branch, index, and baseline gates.
5. The coordinator records the initial list, each added path and rationale, and the
   final allowed list in the checkpoint and review packet. The fresh reviewer must
   independently verify necessity and scope before approval.

There is no arbitrary file-count cutoff: every addition must pass individually, while
any broad package expansion is evidence that the task was under-scoped and must stop.
Reconciliation is a validation step, not permission to silently widen scope, repair a
failed worker, excuse an omitted report path, or accept generated output. It does not
consume correction budget and does not require a worker restart. If any changed path
fails these conditions, reject the ref before review and use the scope-violation row
below.

Examples:

- Eligible: a version-bump task changes an adjacent test with a hardcoded old version,
  or exports the required schema constant from the package's existing types file, and
  the worker reports why.
- Ineligible: release artifacts appear in the ref, a changed path is absent from the
  worker report, a plan/checklist changes, a dependency/lockfile changes without prior
  approval, or the extra path contains an unrelated refactor.

## Correction and recovery rules

The initial worker may have at most three fresh correction workers after it. Each
correction uses the unchanged Base SHA, a new transport ref, the complete original
packet, and only material task-scoped findings requiring no new decision. After that
budget, stop; one additional bounded cycle requires explicit user authorization at
resume time. A correction worker is fresh and independent, as is its reviewer.

For provider/turn-limit/incomplete work, retain concise failure state and any ref.
Validate ancestry, merge history, and path scope, then start a fresh worker from Base
SHA. If safe, restore its path-limited binary delta with:

```sh
git diff --binary <base>...<recovery> | git apply
```

Never cherry-pick, merge, or native-resume the removed worktree. If no safe ref exists,
restart from Base SHA without recovery state. Recovery does not consume correction
budget.

## Blocked / resume decision matrix

Stop with current-task items unchecked unless a row explicitly permits resumption.
Retain exact refs and concise evidence; never infer that a gate passed.

| Blocked condition | Required blocked action | Resume rule / next safe action |
| --- | --- | --- |
| Unavailable or malformed worker/reviewer | Do not fall back to another agent type; retain state | Restore the named agent and revalidate preflight, then launch the missing gate |
| Provider error, turn-limit, or incomplete worker | Do not review or integrate; retain error/session state and validate any new ref | Recovery restart from unchanged Base SHA with a validated binary delta, or fresh restart if none |
| Unreconcilable scope violation | Reject before review/integration; retain the offending ref and report each path and failed reconciliation condition | Resolve task scope, then restart from unchanged Base SHA with a corrected packet; do not restart when every extra path passed bounded reconciliation |
| Exhausted review budget | Leave current-task items unchecked; retain relevant refs and findings | User explicitly authorizes one bounded correction, or supplies corrected task inputs |
| Active branch, `HEAD`, index, or baseline drift | Stop before integration, checklist, or commit | Owner restores/records intended state; revalidate Base SHA and baseline |
| Integration conflict or verification failure | Do not mutate checklist or commit; preserve accepted ref and failing command | Owner repairs main tree, reruns every requested command, and reapplies/revalidates accepted delta |
| Cleanup mismatch (missing/changed ref or failed compare-and-delete) | Do not force-delete or touch another run's ref; report expected and actual SHA | Ref owner resolves mismatch; compare-and-delete only at recorded SHA |
| Interrupted learning | Do not undo or rerun accepted task work; do not persist raw evidence | Resume learning confirmation/placement with concise evidence ledger |

After any resume, reread the plan and checkpoint, inspect status, and revalidate the
recorded identifiers before taking the one named safe action.

## Contract ownership note

Each contract has one canonical owner:

- `references/protocol.md` owns vocabulary, invariants, lifecycle/gates, bounded scope
  reconciliation, correction/recovery, and the blocked/resume matrix.
- `implementation-agent-contract/SKILL.md` owns role-neutral packet precedence,
  scope protection, no-delegation/no-persistence rules, and concise reporting.
- `assets/task-packet.md` owns implementation-worker handoff fields and the exact
  worker result schema.
- `assets/review-packet.md` owns task-reviewer evidence fields, inspection/coverage,
  and the exact reviewer result schema.
- `assets/checkpoint.md` owns the compact coordinator resume-state shape.

When changing a contract, edit its canonical owner and link to it rather than copying
a second definition elsewhere.
