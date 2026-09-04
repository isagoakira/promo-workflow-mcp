---
name: product-tweet-article-contract
description: 在活动中的 Promo Workflow 文章 N2 节点建立 APPSO 风格文章契约。用于锁定编辑目光、叙述人格、读者关系、温度主线、情绪动线与事实边界；此节点不写大纲或完整文章。
---

# APPSO 风格文章契约

调用 `promo_guidance` 并加载 `product-tweet-article-contract`。重点读取 `appso-style-model`、`style-control-capsule`、`authorial-warmth` 和 `evidence-standard`。

把文风控制胶囊的稳定上游部分写入现有 `articleEditorialIntent`：

- `readerDecision`：读者最终要形成的决定；
- `humanCenter`：编辑目光选中的人的处境、动作或产品细节；
- `authorStance`：叙述人格、产品关系和第一人称权限；
- `warmThread`：贯穿全文但不过度重复的温度主线；
- `emotionalArc`：注意力和情绪怎样从开篇走到结尾；
- `evidencePosture`：事实底稿、判断权限、披露和未证实边界。

温度必须来自已观察的场景、习惯、摩擦、快乐或小惊喜。材料不足时可使用明确标注的读者处境、产品团队立场或可归属故事，不虚构个人回忆。只有一个答案会改变整篇文章契约时，才提出一个 Grill 问题。
