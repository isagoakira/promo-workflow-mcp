---
name: promo-video-article-workflow
description: "Use the connected promo_workflow MCP for a managed product-promotion video or public-account article workflow. Trigger before material selection, positioning, outline, script, production, review, or release packaging; do not use for a standalone creative draft."
---

# Video & Article Promo Workflow

Use this Skill as the campaign entry point. `promo_workflow` supplies the state, artifacts, and mutations; this Skill makes those calls deliberate, ordered, and reviewable. It does not replace the stage-specific writing, storyboard, or delivery guidance.

## When to enter the workflow

Enter the MCP workflow when the user is building or continuing a promotional video or article as a campaign, even if they only name one apparent task such as “write the outline” or “make a storyboard.” Use ordinary creative work instead only when the user clearly wants an isolated draft with no campaign state, approvals, or deliverable lineage.

- For a new campaign, create it with `promo_commit(kind=create_workflow)`, passing the project `rootDirectory` and a concise, agent-written `displayName` that a human can recognize in the workbench. The MCP allows one video and one tweet workflow at that root; if it returns `reused: true`, continue that existing workflow instead of creating a parallel duplicate. Then immediately call `promo_get`.
- For an existing campaign, start with `promo_get`. Do not rely on a remembered stage, projected file, or a previous conversation summary.
- If the `promo_workflow` MCP is unavailable, say that the managed workflow cannot be advanced and do not imitate its state transitions in files.

## One control loop

Read `pendingAction`, `revision`, `agentWork`, `reviewFeedback`, and the referenced artifacts from every `promo_get` response. Before the node action, handle saved text feedback unless the current user asks to defer edits. Read original text with `promo_text_review`, diagnose related comments together, and reply to every exact annotation revision. Submit `context.annotationReceipts` with the revised deliverable: `{annotationId, annotationRevision, action: "changed", reply, verification?}`. The service binds it to the new text artifact from that commit. For explanation or a blocking question without a revision, use `reply_annotations` with action `explained` or `needs_input`. Reading is not completion. Never treat comments as approval or as permission to change unrelated locked requirements; use the existing human-review return path for locked content. Saving a comment does not start a background turn.

Then perform only the returned action:

When an actionable annotation targets already locked text outside the current editable node, use `request_text_revision` with `annotations:[{id,revision}]` and `revisionReason` stating the scoped user request. It reuses the existing return path and preserves earlier decisions; it is not approval or a completed reply. Unclear or conflicting feedback needs a question instead. Do not use it merely because old comments exist. Then follow the returned node and submit the revised text plus receipts.

| `pendingAction.type` | Required response |
| --- | --- |
| `run` | Call `promo_run` once using the current revision, then work from its returned state. |
| `agent_work` | Load every guide named by `agentWork.guidance` with `promo_guidance`; use the policy's `plugin` hint to load the matching optional host Skill when installed; make and validate only the requested deliverable; submit only `agentWork.nextCommitKind`. |
| `commit` | Explain the one decision requested, obtain the user’s decision, then submit only the named commit. |
| `human_review` | Open the review packet, present its decision, and wait for an explicit human `approve`, `revise`, or `reject` before `submit_human_review`. |
| no action | Report the terminal result; do not reopen or mutate it. |

An `agent_work` capsule is a task brief, not a node deliverable. After `promo_run` returns one, continue the same control loop: load its guidance, produce the requested output, validate it, and submit `agentWork.nextCommitKind` before ending the turn. Stop earlier only for a genuinely blocking user decision, missing evidence or authority, or an explicit tool failure. Never report a node as delivered merely because its task brief now appears in the workbench.

The workbench may display that capsule as **当前任务简报** while the current node has no artifact yet. This prevents a blank review surface, but it does not satisfy the node. The formal deliverable remains the artifact created by the declared commit. At REQUIREMENTS_READY, first submit_requirement_details with baseArtifactId and details[{requirementId,productionProcedure}]; include a substantive executionReview:{passed:true,evidence} only when steps and every usageId are executable. Draft details can be saved without that review. Then request the existing human review.

After every `promo_run` or `promo_commit`, use the returned revision for the next call. Never advance because a later output “looks ready.”

## Show the active node

Make the workflow legible whenever its MCP is used. After the opening `promo_get`, and immediately after every `promo_run` or `promo_commit`, write one short status note in the user-facing progress update before doing further work. For a state-changing call, give the pre-call note only when the current node has not already been shown in this turn; always give the returned node after the call.

Use the capsule’s `decisionCard.node` and `decisionCard.label` when available; otherwise translate the returned state and `pendingAction` into a short business label. Do not make users read raw enum names, revisions, IDs, or tool payloads.

`promo_get`, `promo_run`, and `promo_commit` return `workbench`. The MCP starts this local desk by default; after the opening read and every state-changing call, proactively surface its workflow-specific URL. When the host can open a local webpage, open it as well. The workbench shows seven-node progress, evidence, text annotations and version comparisons. Document text remains read-only; saved comments never replace commit, revision or human approval. If `workbench.url` is null, call `promo_review` once and report its explicit startup problem.

```text
工作流状态｜节点 {编号或业务名称}
已锁定：{已确认的选题、基调或上游制品；没有则写“尚未锁定”}
当前：{这一节点正在处理或允许执行的唯一动作}
下一步：{下一项交付物，或用户现在需要作出的一个决定}
```

Do not emit a duplicate note for a pure read that leaves the node unchanged. At a human gate, `下一步` must say “等待你的确认” plainly, rather than implying the Agent will continue.

## Rules that protect the workflow

- Pass `expectedRevision` on every mutation. If it conflicts, call `promo_get`; retry only when the same mutation was not already applied.
- Give every new semantic mutation a new `idempotencyKey`; reuse one only to retry that exact mutation.
- Never edit projected files, artifacts, or service data to fake a transition. MCP calls are the only way to advance the campaign.
- Never skip a selection, lock, requested Grill answer, review packet, or the `nextCommitKind` set by the current capsule.
- At `FETCHING`, use the host browser/Web Fetch capability to gather material, then submit `submit_fetched_topics`. The MCP manages the result; it does not fetch the web by itself.
- Do not issue concurrent mutations for the same workflow. Parallel candidate work is allowed only when the capsule explicitly asks for competition, and it still resolves through one evaluated submission.

## Use the right depth of guidance

The current capsule decides which specialized Skills apply. Load all of its requested guides before drafting a creative deliverable, but do not load deep writing or production guidance for a status check or a deterministic transition.

- Each policy's `plugin` field identifies the optional capability pack that sharpens this task. Its absence must never be faked: `promo_guidance` remains the canonical, MCP-owned guide and the node still cannot be skipped.
- When a policy has `priority: high`, load and apply it before every normal-priority writing, platform, or production guide. In the current workflow, `human-language-writing` is the human-language gate: it must inspect the human anchor, four AI-cliche risks, evidence boundary, and spoken readability before later polishing. `promo_guidance` automatically keeps high-priority policies in the response even when a caller requests a subset.
- Article nodes may request public-account editorial guidance.
- Video nodes may request storyboard, voiceover, and delivery-contract guidance.
- The current Skill remains the caller: specialized Skills shape the deliverable; the MCP state machine decides when it may be committed.

At a production node, inspect `adapterStatus` from `promo_get` before choosing a production path. Only use an adapter whose status is both installed and configured; otherwise surface its capability gap in the node-status note and keep the workflow in its declared review or replanning path.

## Keep human control clear

At each human boundary, state the current deliverable, the one decision needed, a recommendation with its trade-off, and what will be created next. Do not manufacture consensus on a positioning, outline, master, release choice, or review outcome.

`AWAITING_HUMAN_REVIEW` is a hard stop. An Agent’s own review is not approval; production can begin only after the human decision is committed against the current review packet and revision. A rejection is terminal, and a revision preserves prior artifacts for traceability.
