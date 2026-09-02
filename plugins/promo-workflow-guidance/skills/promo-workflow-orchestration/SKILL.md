---
name: promo-workflow-orchestration
description: Advance an existing Promo Workflow through its local MCP state capsule. Use for selecting, planning, producing, or packaging promotional video or articles; do not use it for unrelated standalone copywriting.
---

# Promo Workflow Orchestration

The local `promo_workflow` MCP service is the workflow authority. Start with `promo_get`, then follow its `pendingAction` and `agentWork` exactly. Read the shallow `agentWork.guidance` policy list and call `promo_guidance(workflowId, guideIds)` before doing the declared creative, writing, or storyboard work; the MCP-owned route is the authoritative full instruction source.

- Use `promo_run` only for the automatic stage transition it exposes.
- Use `promo_commit` only for the named decision or submission requested by the capsule.
- Preserve `expectedRevision` and reuse the same `idempotencyKey` only for a retry of the same action.
- Do not skip a lock, replace a prior artifact, or infer a later-stage decision.
- `REQUIREMENTS_READY` never enters production directly. Run it once to produce `00-control/current-review.md`; while the state is `AWAITING_HUMAN_REVIEW`, submit only `submit_human_review` with the packet artifact ID and current revision.
- An Agent-passed review is not human approval. Human review may approve, return work to node 2–5 with specific comments, or reject; do not bypass it with a production update.
- When `agentWork.inputs.competition` is present, generate genuinely different candidate paths, use a separate evaluator, and persist the evidence through `submit_competition_report`. Call it Top-p only if its report contains calibrated probabilities; otherwise call it weighted Top-k.

## Load only the matching supervision

- At creative outline or article structure work, load `promo-writing-supervision`.
- At a video master or storyboard review, also load `promo-storyboard-supervision`.
- Do not load either for topic fetching, state inspection, deterministic requirement compilation, or ordinary production-status updates.

The plugin Skills provide host-level reasoning and review reinforcement only. They never change state themselves; return the requested structured submission to the MCP service.
