# Coordinator checkpoint

Keep one current checkpoint in the coordinator conversation. Replace every
placeholder; do not save it, transcripts, raw reports, or runtime state in the
repository. It contains only durable IDs, concise outcomes, retained refs, the
stopped gate, and exactly one next action.

```yaml
plan: <plan path>
plan_base_sha: <committed HEAD before the first task>
task: <current Task N or Iteration N>
attempt: <number>
correction: <number, or 0>
active_branch: <feature branch>
candidate_ref: <temporary cumulative candidate ref>
candidate_sha: <latest validated candidate SHA>
task_base_sha: <candidate SHA before current worker attempt>
worker_reasoning: <medium|high|xhigh>
revmux_profile: <implementation-codex|explicit user override>
revmux_executors: <exact resolved executors, or none before final-review preflight>
baseline_status_identity: <concise status/index/content identity>
worker: <agent ID/handle>
worker_outcome: <one concise result or error>
tasks_total: <number selected>
tasks_completed: <number passing in candidate>
revmux_scope: <not started|final whole-plan>
revmux_cycle: <0|1|2|3|4>
revmux_task: <temporary final-review task id, or none>
revmux_round: <temporary round name, or none>
revmux_tasks_dir: <temporary absolute path outside repository, or none>
no_change_cycles: <consecutive unchanged final-review candidates>
outcome: <running|success|provider-error|turn-limit|aborted|blocked|unknown>
scope_reconciliation: <none, pending, rejected, or final added paths with concise rationale>
retained_transport_refs:
  - <pi-agent-* ref @ recorded SHA, or none>
retained_candidate_refs:
  - <candidate ref @ recorded SHA, or none>
review: <not started|pending|approve|request changes|blocked|not applicable>
review_summary: <concise sources/findings/questions result>
review_responses: <concise worker rebuttals, or none>
stopped_gate: <gate name, or none>
NEXT_SAFE_ACTION: <exactly one safe next action>
```

Refresh it before and after each worker, candidate integration, final revmux cycle,
final integration, and authoritative commit transition. On resume, reread the plan and
checkpoint, inspect status, and revalidate plan Base SHA, candidate SHA/ref, branch,
index, baseline, transport refs, and any retained final-review archive before taking the
single named `NEXT_SAFE_ACTION`.
