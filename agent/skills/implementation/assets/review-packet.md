# Revmux review packet

This fillable packet is the coordinator's self-contained contract for one external
revmux review. Do not save it or any report in the repository. Revmux agents receive
only the generated round inputs and inspect the supplied repository read-only.

## Identity and ref evidence

- Repository root / `--workdir`: `<absolute repository root>`
- Active feature branch: `<branch>`
- Base SHA: `<task Base SHA>`
- Plan/spec/task: `<paths and complete relevant excerpts>`
- Worker attempt: `<initial | correction N | recovery restart N>`
- Worker reasoning: `<medium | high | xhigh>` (coordinator-selected)
- Consecutive no-change correction cycles: `<number before this round>`
- Transport ref and recorded SHA: `<pi-agent-* / SHA>`
- Changed paths: `<exact git diff --name-only Base...Transport output>`
- Initially allowed paths: `<complete list>`
- Scope additions: `<none, or rationale plus coordinator inspection evidence>`
- Final allowed paths: `<complete list>`
- Hard-protected paths and baseline identity: `<complete list and status/index/content identity>`
- Worker report and verification: `<complete concise report>`
- Revmux temporary tasks directory: `<absolute path outside repository>`
- Revmux task id / round: `<safe id> / <NN-label>`

## Preflight and round creation

Verify `revmux`, every configured child CLI, the branch, Base SHA, clean index,
baseline, and transport-ref gates before creating the round. Use a temporary tasks
directory outside the repository. Run `revmux new` and use only the absolute paths in
its JSON response; never construct paths or create `.revmux/` in the repository:

```sh
review_root=$(mktemp -d)
revmux new --tasks-dir "$review_root/tasks" --task "<task-id>" --run "<NN-label>"
```

Write non-empty `scope.md` and `goal.md` at the returned paths. Do not write `profile.md`
unless an explicitly chosen review bar requires it. The task file may be filled only when
`revmux new` created the blank task template, using the plan/task description and no
repository-specific runtime state.

## Required round input

`scope.md` must contain bullets and plain command blocks with:

- exact review subject and scale;
- `git diff <Base SHA>...<Transport ref>` and `git diff --check <Base SHA>...<Transport ref>`;
- every changed path to read in full and the reason it matters;
- final allowed/protected paths and baseline preservation;
- explicit instruction: inspect only, never edit/write/stage/commit/mutate refs, and do
  not treat worker or coordinator claims as approval.

`goal.md` must contain the task goal, complete observable completion criteria, and this
bar: report only material defects, missing required behavior, unsafe prompt/schema/script
changes, or contradictions that would make a later implementation run wrong. A clean
review is valid.

## Invocation

Run from a temporary working directory or otherwise ensure project `.revmux/` is not
used unintentionally. The reviewed repository is supplied as `--workdir`; the archive
stays outside it. Keep stdout and stderr separate:

```sh
revmux --tasks-dir "<review_root>/tasks" \
  --workdir "<repository root>" \
  --task "<task-id>" --run "<NN-label>" \
  --profile comprehensive --no-tui \
  > "<review_root>/report.json" 2> "<review_root>/progress.log"
```

Exit `0` means a completed report with no findings; exit `1` means a completed report
with findings. Neither is a process failure. Exit `2`, a missing report, invalid JSON,
or a command/CLI error is a blocked review. Never merge stderr into JSON and never retry
exit `1`.

## Required JSON validation and decision mapping

Read the report as JSON and require this shape:

- `scope.task` and `scope.run` match the invocation;
- `sources.expected === sources.reported` and `sources.degraded` is an empty array;
- `findings`, `open_questions`, `pre_existing`, and `immaterial` are arrays;
- every finding has `file`, `line`, `severity`, `confidence`, `title`, `body`, `fix`, and
  `verdict`; `verdict` is `confirmed`, `refined`, or `unverified`;
- `stats` exists and the post-review repository status, index, Base SHA, and protected
  baseline still match the preflight identity.

Normalize the result for the coordinator:

- `confirmed` or `refined` findings are material correction candidates and prevent approval;
- any `unverified` finding, degraded source, invalid field, or unresolved `open_questions`
  blocks approval rather than being guessed through;
- a correction worker's `Review response` is evidence for revmux, not permission to dismiss
  its finding; include each response in the next round's goal and let the fresh review decide;
- `pre_existing` and `immaterial` findings are recorded separately and do not require a
  correction;
- approval is the coordinator decision `Reviewed` only when no blocking item remains.

Preserve the complete report path and concise counts in the checkpoint, but never paste
raw prompts, logs, transcripts, or credentials into repository files.

## Correction rounds

For a correction, keep the same temporary revmux task directory and use a fresh round such
as `02-correction-01`; write a new scope describing the corrected transport ref. Revmux
will carry prior round summaries into the new round. Do not paste prior findings into the
new scope. Include the worker's concise `Review response` in the new goal when a finding
was not changed. The worker still starts from the unchanged Base SHA. Compare the new
transport tree with the preceding reviewed candidate: reset `no_change_cycles` on a real
change and increment it when byte-identical. Stop after three consecutive no-change cycles,
even if the ordinary correction budget remains. The ordinary budget is three fresh workers
plus one explicitly user-authorized extra cycle after a blocked resume. A rejected or
blocked review ref is never integrated.

## Read-only prohibitions

The revmux invocation and its review subprocesses may inspect the repository and transport
ref only. They must not modify source, plans, checklists, Git refs, index, worktrees,
credentials, sessions, or runtime state. After every run, recheck the main-tree baseline;
if it changed, stop before integration and retain the ref and temporary archive.
