---
name: implementation
description: Execute an existing repository-grounded implementation plan task by task, updating plan checkboxes, verifying each task, and preserving resumable progress. Use when asked to implement, execute, continue, or resume a plan created by implementation-planning or another compatible plan.
---

# Implementation

Execute a saved implementation plan as a resumable task loop. Work on one task section at a time, verify it, record progress in the plan, and continue until the plan is complete or genuinely blocked.

## User Input

The user may provide a plan path. If a blocking decision is required, use `ask_user_question` with one concise question, likely options, and a decisive `recommendation`. Do not ask in plain chat unless the tool is unavailable.

## Plan Selection

Resolve the plan in this order:

1. Use the explicit path provided by the user.
2. Otherwise, find Markdown plans with unchecked task items in the repository's established plan directory, then in `docs/plans/`, `docs/implementation/`, and `docs/implementation-plan.md`.
3. If exactly one active plan is found, use it.
4. If multiple active plans are found, use `ask_user_question` to select one.
5. If none is found, ask for the plan path.

An executable plan contains at least one heading matching `### Task N:` or `### Iteration N:`. Task state is represented by checklist items inside that section. Completed sections are skipped. The first section containing an unchecked item is the next task.

## Preflight

Before implementing:

1. Read the full plan and any source spec it identifies.
2. Read repository guidance files that apply to the plan and current task.
3. Confirm task headings are ordered and every pending task has concrete steps, verification, and completion criteria.
4. Capture `git status --short` as the baseline. Preserve all pre-existing changes and never discard, overwrite, stage, or commit unrelated work.
5. If pre-existing changes overlap files required by the next task and safe ownership cannot be inferred, ask whether to build on them or stop.
6. Determine the smallest relevant validation commands from the plan and repository.

Do not broaden the plan during preflight. Record a reasonable implementation assumption when safe; ask only when a product, contract, destructive-operation, or ownership decision blocks execution.

## Task Loop

Repeat the following workflow for exactly one pending `### Task N:` or `### Iteration N:` section at a time.

### 1. Load the task

- Read the complete task section, its goal, context, files, steps, verification, and completion criteria.
- Inspect only the source, tests, fixtures, contracts, and generated-code workflow needed for this task.
- Respect dependencies and invariants documented by earlier tasks.

### 2. Implement

- Complete the unchecked steps in dependency order.
- Follow existing repository patterns and choose the smallest coherent change.
- Add or update tests with the behavior change.
- Update documentation, schemas, migrations, fixtures, or generated artifacts when the task requires them.
- Do not implement later task sections early unless a minimal shared edit is inseparable; if this happens, leave later checkboxes unchecked until their own verification passes.

### 3. Verify

- Run the task's stated verification commands.
- Also run the smallest repository-native test, typecheck, lint, or build command needed to validate changed behavior.
- Diagnose and fix failures caused by the task, then rerun the failing checks.
- Do not mark progress for skipped, failing, or unverifiable steps.

### 4. Review the task diff

Review the task's changes against:

- the task goal and completion criteria;
- the source spec and public contracts;
- correctness, regressions, security/privacy, and backward compatibility;
- test quality and accidental unrelated changes.

Fix material issues before completion. Ignore cosmetic review churn that does not improve the plan outcome.

### 5. Record durable progress

Only after verification passes:

- Change `[ ]` to `[x]` for the steps actually completed in the current section.
- Do not mark later task sections complete.
- Keep any failed or deferred item unchecked and stop with a blocker report.
- Re-read the section and confirm its completion criteria are observable in the repository.

### 6. Commit the completed task

Unless the user explicitly requests no commits:

1. Stage only files belonging to the current task plus the plan file.
2. Inspect the staged diff and remove unrelated paths from the staging area without modifying their working-tree content.
3. Commit with the repository's commit convention, or `feat: <task title>` when none exists.
4. Never amend, rewrite, squash, rebase, or push unless the user explicitly requests it.

If a safe task-only commit cannot be made because changes overlap pre-existing work, leave the verified changes uncommitted, report the conflict, and ask before continuing.

After the task is recorded and, when enabled, committed, continue with the first remaining task section containing `[ ]`.

## Completion Loop

When no unchecked task items remain:

1. Run every command in `Cross-Task Verification` and any required repository-wide gate.
2. Review the complete implementation against the plan for requirement coverage, integration correctness, regressions, security/privacy, and missing tests.
3. Fix material findings and rerun affected checks. Use at most two full review/fix passes; stop and report if the implementation still cannot satisfy the plan.
4. Commit final integration fixes separately when commits are enabled.
5. Confirm no unchecked items remain in task sections before reporting success.

Do not claim completion merely because code was written. Completion requires checked task steps, passing verification, and satisfied completion criteria.

## Blocked and Resume Behavior

Stop the loop when:

- a required product or contract decision is missing;
- verification continues to fail after focused diagnosis;
- required credentials, services, generated tools, or permissions are unavailable;
- the next action is destructive or would overwrite user work;
- safe task-only staging or committing is impossible because of overlapping pre-existing changes.

When blocked:

- leave incomplete plan items unchecked;
- do not commit partial or failing work;
- preserve the working tree exactly as reached;
- report the completed task, failing command or blocker, affected paths, and one concrete next action.

To resume, reread the plan and start from the first unchecked task item. Treat checked tasks as complete unless repository evidence contradicts them.

## Final Report

Be concise. Report:

- plan path;
- tasks completed in this run;
- verification commands and PASS/FAIL status;
- commits created, or that commits were disabled;
- remaining unchecked tasks or the exact blocker.

## Behavior Rules

- Execute rather than re-plan.
- Work on one task section per loop iteration.
- Keep the plan as the durable source of progress.
- Preserve user changes and unrelated work.
- Never skip verification to advance the checklist.
- Never use destructive Git commands.
- Ask only when blocked.
