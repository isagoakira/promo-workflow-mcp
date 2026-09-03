# Promo Workflow

把一条产品宣传，从“这条热点能不能讲”推进到可审核、可制作、可发布的本地 MCP 工作流。

Promo Workflow 面向需要持续制作产品视频或公众号文章的团队。它不替你虚构内容，也不把一次聊天当成项目管理：Agent 负责检索、起草、整理和执行；服务负责锁住版本、记录决定、生成明确交付物，并在该由人判断的位置停下来。

```text
选材与证据 → 宣传意图 → 创意/大纲 → 母版 → 素材需求
                                                   ↓
                                           人工审核与版本冻结
                                                   ↓
                                  制作执行 → 标题、封面、发布包
```

## 它解决什么问题

一次宣传制作最容易失控的地方，不是“写不出一段文案”，而是每次都要重新对齐：选题有没有产品承接、核心想让谁改变什么认知、大纲和成片是不是同一件事、素材缺口由谁补、什么版本可以进入制作。

Promo Workflow 用一个可恢复的状态机承接这些决定：

- 把外部热点与产品定位、能力和近期口径一起匹配，而不是只追热度；
- 先锁定宣传核心与用户引导意图，再扩写大纲和完整母版；
- 对视频输出分镜、口播、录制执行、素材需求和 SRT；对文章输出结构、正文、视觉证明计划和本地预览；
- 将节点 1–5 的证据、决定、Grill 记录、候选评审和需求清单汇编为一份人工审核包；
- 人工批准后才能制作；退回指定节点不会删除旧版本；
- 关键阶段交付物可按固定路径读取，并保留不可变版本和内容哈希。

它适合“Agent 参与内容生产，但人必须掌握创意与发布责任”的团队。不适合把它当作自动发布器、网页爬虫或一键视频生成器：抓取、拍摄、AI 生成、剪辑和平台发布仍由接入的宿主或制作工具完成。

## 5 分钟上手

### 1. 安装并构建

唯一前置条件是 Node.js 20 或更高版本。

```bash
git clone https://github.com/isagoakira/promo-workflow-mcp.git
cd promo-workflow-mcp
npm install
npm run build
```

根目录的 [`.mcp.json`](.mcp.json) 已包含 `promo_workflow`。任何支持 stdio MCP 的客户端都可以指向它：

```json
{
  "mcpServers": {
    "promo_workflow": {
      "command": "node",
      "args": ["./packages/promo-mcp/dist/index.js"],
      "cwd": ".",
      "env": { "PROMO_WORKFLOW_DATA_DIR": "data" }
    }
  }
}
```

在 Claude Code 中，进入仓库后启动 `claude`，首次出现提示时批准 `promo_workflow` 即可。其他客户端使用相同的 stdio 配置。`data/` 会自动生成并被 Git 忽略。

> `.mcp.json` 里的 `cut_workbench` 是可选的视频制作后端示例；它需要你自己配置本机的 Cut Workbench 路径。只使用文章、策划或素材规划时，`promo_workflow` 本身不依赖它。

### 2. 告诉 Agent 你要做什么

连接 MCP 后，直接给 Agent 一段正常的制作需求即可，例如：

> 为「产品名」做一篇 2,000–3,500 字的公众号文章。目标读者是正在评估 AI 工作流的产品团队；先从近期行业热点里选一个有真实产品承接的切口。产品能力是……，近期宣传口径是……，可参考来源有……。请用 Promo Workflow 创建流程，并在每个需要我决定的节点停下来。

Agent 会使用 `promo_commit` 创建流程、使用 `promo_run` 运行自动步骤，并在服务返回 `pendingAction` 时向你索取真正需要确认的信息。你不必手动背诵状态名或拼装文件。

若希望从 API/自动化入口创建流程，核心输入是：

```json
{
  "kind": "create_workflow",
  "carrier": "article",
  "summary": "面向产品团队的工作流文章",
  "context": {
    "productProfile": {
      "productName": "产品名",
      "positioning": "一句话定位",
      "capabilities": ["能力一", "能力二"],
      "activeCampaignLines": ["当前口径一", "当前口径二"],
      "targetAudience": "目标读者"
    },
    "topicSources": [
      {
        "id": "industry-rss",
        "label": "行业资讯",
        "kind": "rss",
        "url": "https://example.com/feed.xml"
      }
    ]
  },
  "idempotencyKey": "create-campaign-001"
}
```

网页读取由 Agent 使用自己的浏览器、Web Fetch 或企业检索能力完成；Promo Workflow 记录来源、筛选与后续引用，不偷偷代替宿主联网。

### 3. 按流程协作，而不是等一篇“黑箱成稿”

| 节点 | 自动完成的部分 | 你要确认的部分 | 关键交付物 |
| --- | --- | --- | --- |
| 1. 选材与匹配 | 生成抓取简报、聚合材料卡、匹配产品承接度 | 选定主题与保留证据 | 题材卡、匹配结果、选题 |
| 2. 宣传意图 | 提出可讨论的基线 | 核心信息、要改变的认知、CTA、表达边界 | 宣传意图卡、决策账本 |
| 3. 创意与大纲 | 生成创意路线和大纲草案 | 选择路线、回答有限 Grill、锁定大纲 | 路线、锁定大纲、大纲脚本 |
| 4. 母版 | 生成完整文章母稿或视频时间轴母版 | 审核与锁定母版 | 正文/分镜、口播、录制执行稿 |
| 5. 素材需求 | 从已锁定母版编译最小需求集与视频 SRT | 审阅前期可行性 | 素材需求、前期执行包、SRT |
| 人工审核 | 汇编并冻结 1–5 的全部依据 | 批准、退回节点 2–5 或拒绝 | `current-review.md` |
| 6. 制作 | 更新既有制作单元、保留验收证据 | 审核素材和制作结果 | 制作检查点、预览/工程交接 |
| 7. 发布包装 | 生成可选标题、封面方向与简介/摘要 | 选择并微调发布包 | 标题、封面方向、简介/摘要 |

视频有 2、5、10 分钟三档节奏；口播可以承担产品说明、创始人访谈、使用体验或其他明确的段落功能，而非机械填满时长。文章按平台偏好、读者决策和证据密度组织，支持本地预览类似物。

## 最关键的控制点：审核包

锁定需求后，流程不会直接跳去制作，而是进入 `AWAITING_HUMAN_REVIEW`。服务会生成：

```text
data/workspace/<workflowId>/
├── 00-control/
│   ├── current-review.md              # 当前待审版本
│   ├── reviews/                       # 每次审核冻结的历史包
│   ├── decision-ledger.json
│   └── competition-report.json        # 如启用竞争模式
├── 01-selection/
├── 02-campaign-intent/
├── 03-creative-outline/
├── 04-master/
├── 05-requirements/
├── 06-production/
└── 07-release/
```

审核包会展开对应的制品内容与版本信息，而不只是给一串链接。人工决定必须绑定当前 revision：

- `approve`：解锁制作节点；
- `revise`：明确退回节点 2、3、4 或 5，历史制品继续可追溯；
- `reject`：终止当前方案，不让它静默流入制作。

这条门禁是流程正确性的核心：Agent 自己说“审过了”不等于人已经批准。

## 可选的多路径竞争

对低风险、希望多花一点 token 换质量的节点，可在创建流程时开启：

```json
{
  "competition": {
    "enabled": true,
    "fanout": 3,
    "selectionMode": "weighted_top_k"
  }
}
```

Agent 此时应生成 2–5 条真正不同的策略路径，使用独立评审做硬约束淘汰与评分，并通过 `submit_competition_report` 保存结果。候选与评审会进入审核包。

没有人工排序数据校准的概率时，服务只允许称为“加权 Top-k”；只有提交完整、已校准概率时才可使用 `calibrated_top_p`。它不会把一次主观评分伪装成 Top-p。

## MCP 工具一览

| 工具 | 用途 |
| --- | --- |
| `promo_get` | 查看全部流程或单条流程、当前 revision、下一步动作与制品引用 |
| `promo_guidance` | 按当前节点读取完整流程、文风、文章或分镜指导 |
| `promo_run` | 执行该节点无需人工决定的自动步骤 |
| `promo_commit` | 创建流程，或提交选材、基线、大纲、母版、审核、制作与发布决定 |

每次写操作都带 `expectedRevision` 与 `idempotencyKey`：前者避免并发覆盖，后者让同一个请求可安全重试。把 `promo_get` 返回的 `pendingAction` 交给 Agent 作为下一步的唯一依据，能避免跳过锁定和审核。

## 视频与文章能交付到哪里

### 视频

可稳定规划和交付：叙事大纲、连续分镜、口播稿、录制执行稿、最小素材需求、素材复用关系、SRT、制作单元与验收记录。

可选接入 Cut Workbench 或 VectCut：前者用于项目和阶段化制作，后者用于轻量的可编辑时间线草稿。最终导出仍在你选择的编辑器中完成。

### 文章

可稳定规划和交付：编辑意图、文章结构、完整母稿、证据与视觉证明计划、平台化发布包装，以及可本地审阅的预览类似物。

当前版本不直接登录内容平台、不做后台排版同步，也不自动发布。这样发布权限、平台账号和最终事实责任始终在团队手里。

## 配置与数据

| 项目 | 默认行为 | 可选配置 |
| --- | --- | --- |
| 流程与制品数据 | 写入 `data/` | `PROMO_WORKFLOW_DATA_DIR` |
| 网页抓取 | 由 Agent 宿主执行 | 使用宿主的浏览器或 Web Fetch 能力 |
| VectCut 草稿 | 未配置时返回能力缺口，不伪造结果 | `PROMO_VECTCUT_BASE_URL` |
| Cut Workbench | 仅在配置对应环境变量时接入 | `PROMO_CUT_WORKBENCH_ROOT`、`PROMO_CUT_WORKBENCH_SOURCE_DIR` 等 |

核心服务不要求数据库、Docker、平台账号或视频软件。Docker 仅用于可选的 VectCut HTTP 服务，启动方式见 [docker-compose.vectcut.yml](docker-compose.vectcut.yml)。

## 自动安装的工作流 Skill

[`promo-video-article-workflow`](plugins/promo-workflow-guidance/skills/promo-video-article-workflow/) 是独立于 MCP 的宿主 Skill。它在用户提出“为产品做视频或推文的选题、定位、脚本、制作、审核或发布”这类受管流程任务时触发：先读取 MCP 的当前状态，再只执行状态机允许的调用，并在选择、锁定和人工审核点停下来。MCP 本身只提供状态、版本、制品和变更接口。

它与 `promo_workflow` MCP 位于同一个插件包。Codex 安装 `promo-workflow-guidance` 时会同时安装这个 Skill 和 MCP，不需要手工链接 Skill 目录。其他 MCP 宿主仍可使用根目录的 [`.mcp.json`](.mcp.json)，但是否自动安装 Skill 取决于该宿主自己的插件机制。

在 Codex 中可显式写 `$promo-video-article-workflow`；正常的视频/推文宣发策划请求也会自动匹配它。

## 可选阶段指导插件

仓库内的 [`plugins/promo-workflow-guidance/`](plugins/promo-workflow-guidance/) 只提供阶段化的创作约束：视频前期交付模板、分镜监督，以及按文章节点拆分的编辑方法。它能让支持 Skill 的客户端在创意、写作和分镜时获得更强约束；不安装它，MCP 的状态机、版本和交付物仍然正常工作。

## 开发、验证与排障

```bash
npm test
npm run build
```

如果客户端看不到工具，先确认已在仓库根目录构建并批准 `promo_workflow`，再查看客户端的 MCP 健康状态。若连接成功但流程无法继续，调用 `promo_get`，不要猜下一步：返回的 `pendingAction` 会说明所需提交、当前 revision 和制品位置。

## 当前边界

- 服务不自行抓取网页，也不绕过宿主的联网权限；
- 服务不自动拍摄、生成最终视频、替你登录发布平台或替你发布；
- Agent 可以提出方案、写稿和协调工具，但高影响的审核决定必须由人提交；
- 外部制作工具不可用时，服务返回明确的能力缺口，而不是声称已经完成制作。
