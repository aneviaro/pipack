# Implementation worker task packet

This fillable packet is self-contained. Replace every placeholder before handoff; the
worker must not depend on parent-conversation inheritance or an unavailable plan.
Inline complete excerpts where requested. Do not save the filled packet in the
repository.

## Identity and execution

- Repository root: `<absolute repository root>`
- Working directory: `<absolute worker worktree>`
- Active feature branch: `<branch>`
- Candidate Base SHA: `<committed cumulative candidate HEAD immediately before this task>`
- Isolation: `worktree`; starting point: committed candidate `HEAD` at Candidate Base SHA
- Plan path: `<plan path>`
- Source-spec path: `<source-spec path>`
- Attempt: `<initial | correction N | resume N | recovery fallback N>`
- Existing worker/session/ref: `<none, or validated identifiers being resumed>`
- Worker reasoning: `<medium | high | xhigh>` (coordinator-selected; default `high`)
- Existing baseline: `<complete status, index state, path list, and content identity; preserve byte-for-byte>`

## Task contract

### Goal

`<one-sentence goal>`

### Context and source-spec excerpt

`<relevant context>`

`<complete relevant source-spec text, not a link alone>`

### Exact task section

`<complete current ### Task N: or ### Iteration N: section, including goal, context,
files, steps, verification, evidence, and completion criteria>`

### Applicable guidance

- Paths: `<guidance paths>`
- Relevant text: `<complete relevant guidance text>`

### Dependencies and prior outputs

`<dependency invariants and observable outputs from earlier tasks; write "none" when
there are none>`

## Scope

### Initially allowed paths

These paths are pre-approved:

- `<exact allowed path 1>`
- `<exact allowed path 2>`

Permitted generated artifacts: `<none, or exact paths and generation rule>`

A worker may change an unlisted tracked path only when it is a minimal adjacent change
mechanically required by an explicit task requirement, requires no new product,
architecture, security, dependency, or scope decision, and is not hard-protected
below. List every such path and its necessity under `Scope additions requested`.
This is not permission for opportunistic cleanup or related refactoring.

### Hard-protected paths

Never change these paths or any pre-existing dirty path:

- `<exact hard-protected path 1>`
- `<exact hard-protected path 2>`
- `<all plan/checklist, coordinator-owned, credential, runtime-state, and unrelated baseline paths as applicable>`

Hard-protected baseline status/content: `<identity to recheck before reporting>`

## Required implementation behavior

`<precise task-specific instructions and decisions already made>`

Inspect before editing. Keep implementation minimal and generic. Do not infer missing
requirements from other conversations. Do not modify a hard-protected path to make a
check pass. A scope addition must be explicit in the result and satisfy the bounded
rule above; otherwise stop and report the blocker. For a final-review correction, address
each blocking revmux finding. If no change is warranted, explain the concrete rebuttal
under `Review response`; the coordinator may pass it to the next final-review cycle but
may not silently dismiss a finding. Revmux never runs for an individual task.

## Verification

Run every command below from `<working directory>` with environment `<required
environment>`:

```text
<exact command 1>
<exact command 2>
```

Completion criteria to demonstrate: `<observable criteria>`
Report a command as passing only when it was actually run and passed. Report skipped,
failed, or unverifiable commands as such and use a failure result.

## Prohibitions

- Implement only this task; do not re-plan it or edit plan/checklist files. Use only the
  coordinator-selected worker reasoning level supplied in the identity section.
- Do not stage, commit, amend, merge, rebase, reset, push, switch branches, or
  mutate Git history or refs.
- Do not edit, create, delete, rename, or generate a hard-protected path. Do not
  change an unlisted path unless it satisfies the bounded scope-addition rule and is
  reported explicitly.
- Do not delegate or invoke nested agents or other implementers/reviewers.
- Do not write transcripts, sessions, credentials, secrets, or persistent memory.
- Do not overwrite, discard, or normalize pre-existing baseline work.
- Do not claim a check passed without running it or claim success with a missing
  required result.
- If blocked, stop and report the exact blocker and one safe next action.

For a resume or recovery fallback, name the validated worker/session/worktree and one
`pi-agent-*` ref. Prefer continuing it. If reconstruction is required, restore only its
candidate-relative path-limited delta with `git diff --binary <Candidate Base SHA>
<recovery-ref> | git apply`; never cherry-pick or merge. Rerun incomplete or affected
checks, not expensive checks already proven against unchanged bytes.

## Worker result (exact schema)

Return exactly this Markdown structure, replacing placeholders:

```markdown
WORKER_RESULT: success|failure
Changed paths:
- <every exact changed path, or none>
Scope additions requested:
- none or <path> — <explicit task requirement and why this adjacent change is mechanically necessary>
Review response:
- none, or <concise response to each revmux finding that was not changed>
Implementation summary:
- <concise item>
Verification:
- <exact command> — PASS|FAIL (<concise evidence>)
Blockers/risks:
- none or <item>
```

After a verification failure, attempt a task-scoped fix and rerun it. Use
`WORKER_RESULT: failure` only if it still fails, cannot be rerun, or needs broader
scope/new decision. List every changed path and every requested scope addition; do not
claim success when a required check was skipped.
