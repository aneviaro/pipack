---
name: implementation-planning
description: Turn an existing product/technical spec into a thorough, repository-grounded implementation plan. Use when asked to create an implementation plan, break a spec into tasks, make a Ralphex-compatible plan, or convert requirements into executable engineering steps.
---

# Implementation Planning

Convert a spec into a concrete implementation plan that an autonomous coding agent can execute safely.

The output is a saved Markdown plan, not only chat text.

## Primary Goal

Produce a plan with:

- enough repository context for implementation without re-discovering the whole codebase;
- well-scoped, independently verifiable tasks;
- explicit file touch points, contracts, tests, and risks;
- Ralphex-compatible task headings.

## Workflow

1. Identify the source spec and target plan path.
   - If the user names a spec file, use it.
   - If not, search likely locations: `docs/`, `docs/specs/`, `docs/implementation/`, `specs/`, `requirements/`, issues, or the current prompt.
   - If no usable spec exists, ask for exactly one missing input: the spec location or spec text.
2. Read the full source spec.
3. Inspect only the repository context needed to make the plan executable:
   - project guidance files (`AGENTS.md`, `CLAUDE.md`, `README.md`, package/build files);
   - existing architecture, API, schema, migration, and testing docs mentioned by the spec;
   - relevant source files, tests, fixtures, generated-code scripts, and CI commands.
4. Determine the implementation path.
   - Prefer the smallest coherent sequence that preserves existing conventions.
   - If the spec is ambiguous, make a reasonable assumption and record it in the plan.
   - Ask only when a product/contract decision blocks planning.
5. Write or update a Markdown plan.
6. Confirm the plan is Ralphex-compatible by checking that it contains at least one executable task heading matching exactly:
   - `### Task 1: <title>`
   - `### Task 2: <title>`
   - or `### Iteration 1: <title>`
7. Report the saved file path and no more than three important caveats.

## Default Plan Location

Use the first matching convention:

1. Existing project plan convention if obvious.
2. `docs/plans/YYYYMMDD-<kebab-case-title>.md`.
3. `docs/implementation-plan.md` if the repository already uses a single rolling implementation plan.
4. `implementation-plan.md` if no docs directory exists.

Create directories as needed. If a related plan already exists, update it instead of creating a duplicate.

## Ralphex Compatibility Rules

Ralphex task execution requires executable sections. The plan must include task headings in this form:

```markdown
### Task 1: Short imperative task title
```

Rules:

- Use `### Task N:` headings for implementation tasks.
- Number tasks consecutively starting at 1.
- Do not hide task headings inside code blocks.
- Each task must be completable in one focused implementation pass.
- Each task must include a verification command or manual verification step.
- Prefer unchecked checklist items (`- [ ]`) inside tasks so progress can be marked.
- Do not include tasks that only say "review", "investigate", or "decide" unless they produce a concrete repository artifact.
- If discovery is needed, make it a bounded implementation task with an output file, fixture, test, or documented decision.

## Required Plan Structure

Use this template unless the repository has a stronger established format:

```markdown
# <Plan Title>

## Overview
<What will be built and why.>

## Source Spec
- Spec: `<path or prompt>`
- Status: <Draft/Approved/Assumed>
- Last reviewed: YYYY-MM-DD

## Repository Context
- `<path>` — <why it matters>
- `<path>` — <why it matters>

## Implementation Constraints
- <Language/framework/runtime constraints>
- <Contract/API compatibility constraints>
- <Security/privacy/migration constraints>
- <Generated-code or schema constraints>

## Assumptions
- <Assumption made because the spec or repo did not decide it.>

## Non-goals
- <Explicitly excluded work.>

## Task Summary
1. <Task 1 title and outcome>
2. <Task 2 title and outcome>

## Implementation Tasks

### Task 1: <Short imperative title>

Goal: <Concrete outcome.>

Context:
- <Relevant repo behavior, invariant, or prior decision.>
- <Important dependency from the source spec.>

Files:
- Create: `<path>` — <purpose>
- Modify: `<path>` — <purpose>
- Test: `<path>` — <purpose>

Steps:
- [ ] <Specific implementation step.>
- [ ] <Specific implementation step.>
- [ ] <Update docs/contracts/generated artifacts if applicable.>

Verification:
- `<command>`
- <Manual check if no command exists.>

Completion criteria:
- <Observable done condition.>
- <Observable done condition.>

### Task 2: <Short imperative title>

Goal: <Concrete outcome.>

Context:
- <Relevant repo behavior, invariant, or prior decision.>

Files:
- Modify: `<path>` — <purpose>
- Test: `<path>` — <purpose>

Steps:
- [ ] <Specific implementation step.>

Verification:
- `<command>`

Completion criteria:
- <Observable done condition.>

## Cross-Task Verification
- `<command that should pass after all tasks>`
- <Release/build/manual acceptance check>

## Risks and Mitigations
- Risk: <risk>
  Mitigation: <mitigation>

## Open Questions
- <Question, or `None`.>
```

## Task Design Standards

A good task has:

- a narrow goal;
- a concrete file touch list;
- enough context to avoid broad rediscovery;
- implementation steps in dependency order;
- tests or validation commands;
- completion criteria that can be checked from the repository.

Split tasks when:

- one task would touch unrelated layers;
- contract/schema changes need to land before implementation;
- data migration or generated code must be verified separately;
- UI, API, persistence, and tests are separable;
- rollback or feature-flag work deserves independent validation.

Combine tasks when:

- splitting would force repeated edits to the same tiny code path;
- verification only makes sense after the pieces are together;
- one change is just a test for the other.

## Context to Capture

Prefer concrete, implementation-useful context:

- current architecture and entry points;
- relevant modules/classes/functions/components;
- existing patterns to copy;
- naming conventions;
- schema/API/contract owners;
- generated files and generation commands;
- migrations and backward compatibility rules;
- test fixtures and smallest relevant test commands;
- deployment, build, lint, or contract gates;
- security, privacy, permissions, and data-retention constraints;
- known pitfalls from current code.

Avoid generic context:

- broad summaries of the whole repo;
- restating the entire spec;
- obvious language/framework facts;
- speculative alternatives not chosen.

## Behavior Rules

- Be concise and decisive.
- Make reasonable assumptions and record them.
- Do not brainstorm multiple plans unless asked.
- Do not implement the plan unless the user explicitly asks.
- Do not create vague tasks.
- Do not leave placeholders like `TBD` except in `Open Questions`.
- Preserve existing user edits when updating an existing plan.
