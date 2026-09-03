---
name: promo-video-article-workflow
description: "Use the connected promo_workflow MCP for a managed product-promotion video or public-account article workflow. Trigger before material selection, positioning, outline, script, production, review, or release packaging; do not use for a standalone creative draft."
---

# Video & Article Promo Workflow

Use this Skill as the campaign entry point. `promo_workflow` supplies the state, artifacts, and mutations; this Skill makes those calls deliberate, ordered, and reviewable. It does not replace the stage-specific writing, storyboard, or delivery guidance.

## When to enter the workflow

Enter the MCP workflow when the user is building or continuing a promotional video or article as a campaign, even if they only name one apparent task such as “write the outline” or “make a storyboard.” Use ordinary creative work instead only when the user clearly wants an isolated draft with no campaign state, approvals, or deliverable lineage.

- For a new campaign, create it with `promo_commit(kind=create_workflow)`, then immediately call `promo_get`.
- For an existing campaign, start with `promo_get`. Do not rely on a remembered stage, projected file, or a previous conversation summary.
- If the `promo_workflow` MCP is unavailable, say that the managed workflow cannot be advanced and do not imitate its state transitions in files.

## One control loop

Read `pendingAction`, `revision`, `agentWork`, and the referenced artifacts from every `promo_get` response. Then perform only the returned action:

| `pendingAction.type` | Required response |
| --- | --- |
| `run` | Call `promo_run` once using the current revision, then work from its returned state. |
| `agent_work` | Load every guide named by `agentWork.guidance` with `promo_guidance`; use the policy's `plugin` hint to load the matching optional host Skill when installed; make and validate only the requested deliverable; submit only `agentWork.nextCommitKind`. |
| `commit` | Explain the one decision requested, obtain the user’s decision, then submit only the named commit. |
| `human_review` | Open the review packet, present its decision, and wait for an explicit human `approve`, `revise`, or `reject` before `submit_human_review`. |
| no action | Report the terminal result; do not reopen or mutate it. |

After every `promo_run` or `promo_commit`, use the returned revision for the next call. Never advance because a later output “looks ready.”

## Show the active node

Make the workflow legible whenever its MCP is used. After the opening `promo_get`, and immediately after every `promo_run` or `promo_commit`, write one short status note in the user-facing progress update before doing further work. For a state-changing call, give the pre-call note only when the current node has not already been shown in this turn; always give the returned node after the call.

Use the capsule’s `decisionCard.node` and `decisionCard.label` when available; otherwise translate the returned state and `pendingAction` into a short business label. Do not make users read raw enum names, revisions, IDs, or tool payloads.

`promo_get` returns `reviewUrl` whenever the local review desk is available. Treat it as the workflow’s primary visual surface: surface or open the workflow-specific URL after the opening read and after each state-changing call, so the user can see the seven-node progress line and the frozen evidence in order. If only a general URL is known, call `promo_review` with the current workflow ID. The review desk is read-only; it never replaces the commit, revision, or human-review gate.

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
- Article nodes may request AppSo editorial guidance.
- Video nodes may request storyboard, voiceover, and delivery-contract guidance.
- The current Skill remains the caller: specialized Skills shape the deliverable; the MCP state machine decides when it may be committed.

At a production node, inspect `adapterStatus` from `promo_get` before choosing a production path. Only use an adapter whose status is both installed and configured; otherwise surface its capability gap in the node-status note and keep the workflow in its declared review or replanning path.

## Keep human control clear

At each human boundary, state the current deliverable, the one decision needed, a recommendation with its trade-off, and what will be created next. Do not manufacture consensus on a positioning, outline, master, release choice, or review outcome.

`AWAITING_HUMAN_REVIEW` is a hard stop. An Agent’s own review is not approval; production can begin only after the human decision is committed against the current review packet and revision. A rejection is terminal, and a revision preserves prior artifacts for traceability.
