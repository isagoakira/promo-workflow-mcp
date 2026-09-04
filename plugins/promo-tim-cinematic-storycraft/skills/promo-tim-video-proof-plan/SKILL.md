---
name: promo-tim-video-proof-plan
description: Convert an active Promo Workflow video's locked outline into an evidence-traceable N4 storyboard, spoken plan, and material plan ready for downstream CutWorkbench production. Use only when the capsule requests tim-cinematic-video-proof-plan.
---

# 技术影像证据与前期计划

先调用 `promo_get`，仅在当前 capsule 请求 `tim-cinematic-video-proof-plan` 时通过 `promo_guidance` 加载本节点的完整指导与资源。

把每个关键判断连成 `主张 → 条件/测试 → 镜头或屏幕行为 → 可见结果 → 限制/解释`。检查连续时码、音画互补、关键动作的可剪接覆盖、可复用素材以及未被隐藏的失败和不确定性。

主稿锁定后，Promo Workflow 会派生台词、录制执行稿和前期素材计划，再交由 CutWorkbench 生产。这个 Skill 不操作编辑器、不渲染、不导出，也不绕过 MCP 的状态与提交契约。
