---
name: promo-product-tweet-editor
description: 在活动中的 Promo Workflow 文章节点内迁移并审查 APPSO 指定编辑风格，覆盖文章契约、结构动线、完整主稿、视觉证明、预览审查与发布包装。仅用于受管的科技产品推文，不用于原始选题抓取、纯视频任务或脱离工作流的单篇仿写。
---

# 科技产品推文编辑：APPSO 指定风格

这是活动宣传工作流中的文风控制入口。迁移 APPSO 的编辑方法，不复制原句、标题公式、刊物身份或作者身份。

## 先读取工作流权威状态

先调用 `promo_get`，再按当前 `agentWork.guidance` 中的策略编号调用 `promo_guidance`。MCP 返回的完整指导、资源列表、事实底稿、已锁定制品和证据边界是当前节点的权威输入；插件 Skill 只负责正确加载和执行，不能越过状态机。

## 按节点加载

- N2：使用 `product-tweet-article-contract`，锁定编辑目光、叙述人格、读者关系、温度主线和事实边界；
- N3：使用 `product-tweet-human-center-outline`，安排注意力动线、比例带与段落职责；
- N4：使用 `product-tweet-manuscript-proof`，完成宏观—中观—微观文风迁移；
- N4／N6 素材：使用 `product-tweet-visual-proof`，把视觉放到它真正证明或解释的位置；
- N6：使用 `product-tweet-preview-review`，检查排版后的整体风格漂移；
- N7：使用 `product-tweet-release-packaging`，压缩标题、摘要、封面语与余味。

## 不得越界

- 不得虚构第一手使用、测试时长、产品行为、测量、引语、用户反应或独立测评身份；
- 不得把评分、数字或对比当成文风主体；
- 不得从模仿句式和标题开始，始终从编辑目光与读者关系开始；
- 不得在后续节点反向改写已经锁定的文章命题、叙述者权限或事实边界；
- 缺少证据时收窄主张或回流补证，不把不确定性润色成确定性。
