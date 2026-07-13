---
name: idea-honing
description: Relentlessly interview the user to sharpen a vague idea into an actionable implementation spec, then save that spec to the repository. Use when the user wants to refine an idea, stress-test a concept, build a spec, write a PRD, or says "hone this idea", "grill me", "turn this into a spec", or similar.
---

# Idea Honing

Turn an idea into a saved, implementation-ready spec through a focused interrogation loop.

## User Input

Use `ask_user_question` for every blocking question in the interrogation loop. Pass one concise `question`, likely `options` when useful, `allowFreeform`, and a decisive `recommendation`. Do not ask in plain chat unless the tool is unavailable.

## Workflow

1. Identify the idea, target product area, and desired output. If the user has not provided enough to start, use `ask_user_question` for the one missing seed detail.
2. Interview the user relentlessly, one question at a time, until the spec is unambiguous enough to implement.
3. For every question:
   - Call `ask_user_question` exactly once.
   - Ask exactly one question.
   - Include your recommended answer in the tool's `recommendation` field.
   - Prefer decisive defaults over open-ended brainstorming.
   - If the answer can be discovered from the repository, inspect the code/docs instead of asking.
4. Resolve dependencies between decisions in order. Do not jump ahead to low-level details before core constraints are settled.
5. Keep a running mental spec and update it after each answer.
6. When enough decisions are resolved, tell the user you are ready to write the spec and use `ask_user_question` for confirmation only if there is a meaningful unresolved product choice. Otherwise proceed.
7. Save the spec as markdown in the repository.
8. Run the `revdiff` skill against the saved spec (`--only <spec-path>`; add `--untracked` for a new file). Process captured annotations and update the spec when needed.
9. Report the created file path and any remaining open questions.

## Question Order

Cover these areas as needed, skipping anything already answered or discoverable:

1. Problem and user
2. Goal and non-goals
3. Success criteria
4. User flows
5. Data model and persistence
6. API/contract changes
7. UI/UX behavior
8. Edge cases and failure states
9. Security, privacy, and permissions
10. Compatibility, migration, rollout
11. Test/verification plan
12. Implementation milestones

## Spec Location

Default location:

- If this repository has `docs/implementation/`, save to `docs/implementation/<kebab-case-title>-spec.md`.
- Otherwise save to `docs/<kebab-case-title>-spec.md`.
- Create the directory if needed.

If a related spec already exists, update it instead of creating a duplicate.

## Spec Template

```markdown
---
Created: YYYY-MM-DD
Status: Draft
Owner: TBD
---

# <Spec Title>

## Summary

<One-paragraph summary.>

## Problem

<Problem and why it matters.>

## Goals

- <Goal>

## Non-goals

- <Non-goal>

## Users and Use Cases

- <User/use case>

## Proposed Behavior

<Concrete behavior and flows.>

## Requirements

### Functional

- <Requirement>

### Non-functional

- <Requirement>

## Data and Contracts

<Data model, persistence, API, schema, and contract impacts.>

## UX Notes

<Screens, states, copy, accessibility, and edge cases.>

## Rollout and Migration

<Rollout, backwards compatibility, migration, feature flags.>

## Test Plan

- <Verification step>

## Open Questions

- <Question, or `None`.>
```

## Behavior Rules

- Be direct and skeptical.
- Ask one question at a time via `ask_user_question`.
- Each question must include a recommended answer.
- Do not produce the final spec until the important branches are resolved.
- Do not ask questions that repository inspection can answer.
- The final output is a saved file, not just chat text.
