# Promo Workflow

一个轻量、本地、可恢复的产品宣传工作流 MCP。它把选材、创意、分镜/文章、制作和发布包装稳定为同一条状态机；Agent 负责提出和执行，人负责在应当介入的位置确认、修改或退回。

当前运行层已落地为一个本地 stdio MCP 服务：

- 薄 Skill：识别任务并调用 MCP。
- Local MCP：暴露少量稳定工具。
- Promo Service：维护状态机、上下文注入点与流程记录。
- 本地 JSON：保存流程状态与已确认决策；不需要数据库服务。

## 最小安装与启动

唯一前置条件是 Node.js 20 或更高版本。

```bash
npm install
npm run build
npm start
```

服务默认把状态写入 `data/workflows.json`。该目录已被 Git 忽略；如需把数据移到其他位置，设置 `PROMO_WORKFLOW_DATA_DIR` 环境变量即可。

材料卡、大纲、母稿、分镜、SRT、预览等内容存入同目录的 `data/artifacts/`。每份工件不可变，带 SHA-256 内容哈希、父工件引用和版本号；工作流状态只保留引用与当前的紧凑胶囊。

任何支持 stdio MCP 的 Agent 都可以直接使用根目录的 [`.mcp.json`](.mcp.json)。它只暴露三个稳定工具：

- `promo_get`：读取一个流程或列出全部流程；
- `promo_run`：推进当前节点中无需确认的自动步骤；
- `promo_commit`：创建流程或写入一次经过确认的决策。

工具调用使用 `expectedRevision` 与 `idempotencyKey`：前者避免并发覆盖，后者保证 Agent 重试不会重复推进流程。

### 第一节点：最小选材配置

创建流程时，在 `promo_commit(kind=create_workflow)` 的 `context` 中提供产品卡与来源池；随后调用一次 `promo_run`。服务返回一个 `fetchBrief`，由当前 Agent 使用自己的 Web Fetch 或浏览器能力读取来源。来源可标为 RSS/Atom（推荐）或 HTML，标签仅用于指导抓取策略。

```json
{
  "productProfile": {
    "productName": "产品名",
    "positioning": "一句定位",
    "capabilities": ["能力一", "能力二"],
    "activeCampaignLines": ["当前宣传口径一", "当前宣传口径二"],
    "recentMessaging": ["最近强调的表达"],
    "targetAudience": "目标用户"
  },
  "topicSources": [
    {
      "id": "industry-rss",
      "label": "行业资讯",
      "kind": "rss",
      "url": "https://example.com/feed.xml",
      "weight": 1
    }
  ]
}
```

Agent 完成抓取后，以 `promo_commit(kind=submit_fetched_topics)` 回填 1–50 张紧凑材料卡：`sourceId`、`title`、`url`、`excerpt`，以及可选 `publishedAt`。再调用一次 `promo_run`，服务会对每个候选题同时计算“产品能否承接”和“当下话题强度”，返回最多三个候选。确认后以 `promo_commit(kind=select_topic)` 提交该卡的 `topicId` 与保留的素材引用。

`fetchBrief` 同时是通用 `agentWork` 胶囊：它包含任务 ID、阶段、输入、约束、期望输出、校验规则和下一条提交类型。基调、创意大纲、母版、制作与包装均已复用这一结构，不依赖 Codex 专有能力。

## 流程图

当前已确认七个大节点：

```text
选材：NEEDS_PROFILE -> READY -> FETCHING -> MATCHING -> AWAITING_SELECTION -> TOPIC_LOCKED
基调：TOPIC_LOCKED -> ALIGNING_BASELINE -> BASELINE_LOCKED
创意与大纲：BASELINE_LOCKED -> GENERATING_CREATIVE -> ALIGNING_OUTLINE -> OUTLINE_LOCKED
母版细化：OUTLINE_LOCKED -> GENERATING_MASTER -> ALIGNING_MASTER -> MASTER_LOCKED
需求编译：MASTER_LOCKED -> COMPILING_REQUIREMENTS -> REQUIREMENTS_READY
制作：REQUIREMENTS_READY -> PRODUCING -> PRODUCTION_LOCKED
发布包装：PRODUCTION_LOCKED -> PACKAGING -> RELEASE_READY
```

当前宣传口径允许同时启用 2–3 条。

七个节点共用同一条可恢复链路。创意和母版先提交草案，再按有限 Grill 锁定；节点 5 自动把主稿素材使用位编译成最小需求集和视频 SRT；节点 6 只允许更新既有制作单元，全部验收后才可锁定；节点 7 的标题、封面和发布文本必须引用锁定制作证据。

基调节点已落地：`promo_run` 生成基调 `agentWork` 胶囊，Agent 通过 `propose_baseline` 提交宣传核心和用户引导意图；每轮只保留一个高影响问题，最终以 `lock_baseline` 写入不可变基调工件。

创意与大纲节点先生成一条跨媒介创意主线，再按当前载体生成视频或推文大纲。它使用有限、由宏观到载体细节的 Grill，并受 `geek-product-promo-writing` 的宏观文风监督。视频支持 2/5/10 分钟，推文支持 800–1,500、2,000–3,500、4,000–6,000 字三档。第三节点只锁定结构，具体成稿与制作属于下一节点。

母版细化节点整稿先行：视频生成完整时间轴分镜母版，推文生成完整文章母稿。它默认自动修复，只对阻塞性决策 Grill，并由 `geek-product-promo-writing` 与 `storyboard-direction` 分别监督文字和分镜。共享素材按 `source asset -> fragment -> usage` 规划，普通素材至少两个有效使用位，必要的一次性素材必须说明理由。

需求编译节点完全自动，将消费侧使用位合并为最小、工具无关的素材需求集，并从视频母版派生 SRT。实际拍摄、AI 生成、剪辑和工具选择属于后续制作节点；只有 `capability_gap` 会触发需求回流。

制作节点共用 `PRODUCING -> PRODUCTION_LOCKED` 和极简 `production_unit` 生命周期。每个已验收单元必须回填制品引用与来源。

- 推文：从锁定母稿自动生成单平台的有序内容块文档、素材清单和本地预览类似物；预览确认后锁定。
- 视频 / Cut Workbench：桥返回已验证项目版本、成品与最终字幕后锁定。
- 视频 / VectCut：把时间轴素材和 Node 5 的 SRT 写入可编辑草稿；编辑器审核后锁定为 `editable_draft`，绝不称作已导出的成片。

无论哪种后端，改动都不是绕过流程直接覆盖：将相关制作单元退回执行、更新已验收制品，再由 `promo_run` 创建新的后端版本。Promo 只保存后端引用、一个待处理人工动作和最终产物 ID。

### VectCut：低门槛视频执行器

在创建视频流程时，将 `context.videoBackend` 设为 `"vectcut"`。在制作单元更新时一并提交 `vectcutMediaSources`：每一条锁定的 `assetUsageId` 对应一个可访问的视频 URL。

```json
{
  "videoBackend": "vectcut",
  "vectcutMediaSources": [
    { "usageId": "usage-1", "videoUrl": "http://127.0.0.1:8080/demo.mp4" }
  ]
}
```

Promo 自身不安装 Python、FFmpeg 或剪辑器依赖；适配器只使用 Node 内置 HTTP 请求。VectCut 则是单独启动的本地服务，当前版本需要 Python 3.10 或更高版本及其自身依赖（本机以 Python 3.11 验证）。启动 MCP 前设置 `PROMO_VECTCUT_BASE_URL=http://127.0.0.1:9001` 即可启用该桥。

若不希望在宿主安装 VectCut 的 Python 依赖，可直接启动随仓库提供的可选容器：

```bash
docker compose -f docker-compose.vectcut.yml up --build -d
```

容器只运行 VectCut HTTP API，提供可下载/导入的编辑草稿；它不把桌面剪映/CapCut 伪装成容器能力。停止它使用 `docker compose -f docker-compose.vectcut.yml down`。

当 VectCut 运行在容器中时，`videoUrl` 必须能被容器访问。局域网或对象存储地址可直接使用；在 macOS Docker Desktop 上引用宿主素材时使用 `http://host.docker.internal:<端口>/...`，不要使用 `127.0.0.1`。

```text
制作单元验收
  -> promo_run 创建草稿、按分镜导入素材与 SRT
  -> 编辑器内审核
     -> 要改：update_production_units 回退相关单元，再 promo_run
     -> 通过：lock_production + vectcutDraftAccepted + vectcutReviewNote
```

真正的视频导出仍在编辑器中完成；这不改变 MCP 的任务流，也不增加新的公开工具。

发布包装节点自动生成三条标题、两张封面和一版载体化发布文本，只进行一次集中选择与微调。视频使用简介，推文使用摘要并重建最终本地预览类似物。平台接口、精确后台排版、草稿同步、上传和正式发布均不属于当前 MVP。

## 目录

```text
plugins/promo-workflow-guidance/ 可选 Codex 插件：阶段化文风、分镜与流程指导
packages/contracts/  MCP 与本地服务共享契约
packages/promo-mcp/  Local MCP adapter
packages/promo-service/ 状态机与 Injector 实现
docs/                已确认架构和后续决策
```

网页抓取由 Agent 宿主能力完成；候选题匹配、Cut Workbench/VectCut 调度和 Article Assembler 的具体执行器接在既有状态机节点之后。服务稳定记录它们的输入、确认点与产物引用，不把重型能力强塞进本地安装包。

## 可选指导插件

`plugins/promo-workflow-guidance/` 与服务一同维护、单独安装。它只提供三类精炼指导：状态机调度、技术产品文风监督、视频分镜监督。`agentWork.guidance` 会在创意大纲、主稿和发布包装节点声明可加载的 Skill；未安装插件的 Agent 仍可依据胶囊自行完成同一 MCP 流程。
