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

## 新手上手：先选一条路径

| 你要完成什么 | 安装内容 | 是否需要剪辑软件 |
| --- | --- | --- |
| 策划、脚本、推文 | 基础包 | 不需要 |
| 视频策划与可编辑草稿 | 基础包 + VectCut 适配器 | 可选 |
| 完整视频制作、版本审核与剪映协作 | 基础包 + Cut Workbench 适配器 | 剪映同步仅在最后一项高级验证中需要 |

### 1. 所有用户：构建并登记本机路径

需要 Node.js 20+。只有在安装 Cut Workbench 时才额外需要 Git 和 Python 3.11+。

macOS、Linux 和 Windows PowerShell 都使用同一组命令：

```bash
git clone https://github.com/isagoakira/promo-workflow-mcp.git
cd promo-workflow-mcp
npm install
npm run build
npm run setup
```

最后一条命令会写入一个用户级配置文件，让已安装的插件能找到这个构建后的仓库：

| 系统 | 默认配置位置 |
| --- | --- |
| Windows | `%APPDATA%\\promo-workflow\\local.json` |
| macOS | `~/Library/Application Support/promo-workflow/local.json` |
| Linux | `$XDG_CONFIG_HOME/promo-workflow/local.json`，未设置时为 `~/.config/promo-workflow/local.json` |

它不会写入 shell profile，也不要求你手填环境变量。环境变量只保留给 CI、容器或团队自动化覆盖本机配置。

### 2. Codex 用户：安装基础包

在仓库根目录执行：

```bash
codex plugin marketplace add "$(pwd)"
codex plugin add promo-video-article-workflow@promo-workflow
```

基础包会同时安装 `promo_workflow` MCP 和 `$promo-video-article-workflow` 入口 Skill。安装完成后新开一个 Codex 任务，使新的 MCP 与 Skill 被加载。

需要文章方法、视频前期或制作后端时，再从同一 marketplace 安装对应的可选包；不装它们不影响选题、写作和审核流程。

`promo-human-language-writing` 是所有中文宣发写作的高优先级人话门禁，已标记为 marketplace 默认安装：它会在普通文风与平台适配之前检查具体的人、处境、细节、判断和证据边界。

当前可从这个本地 marketplace 安装的包是：

```text
promo-video-article-workflow    基础 MCP 与流程入口
promo-human-language-writing    高优先级人话写作门禁
promo-product-writing           科技产品表达监督
promo-product-tweet-editor      科技产品推文编辑
promo-video-preproduction       视频前期交付约束
promo-cut-workbench-adapter     完整视频制作适配
promo-vectcut-adapter           轻量可编辑草稿适配
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

> 根目录的 `.mcp.json` 只注册 `promo_workflow`。Cut Workbench 通过独立插件接入；执行 `npm run setup:cut-workbench` 后，插件会自动读取本机配置。只使用文章、策划或素材规划时，不需要安装它。

### 3. 告诉 Agent 你要做什么

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

### 4. 首次启动先建立并确认专属工作区

每次 `create_workflow` 都会先在 `data/workspace/<workflowId>/` 建立本项目自己的目录框架，并生成根目录 `README.md`。这个 README 不是参考建议，而是 Agent 的第一道工作区门禁：Agent 必须先读它，向用户解释目录结构、用户资料入口和越界边界，等待用户明确确认后，才能调用 `promo_run` 推进节点一。

用户可阅读、可交给 Agent 分析的现有稿件、截图、录屏、脱敏附件和进度包，统一放进：

```text
data/workspace/<workflowId>/
├── 00-control/          # 流程状态、审核包、决策与版本追踪
├── 01-selection/        # 节点一：选材与证据
├── 02-campaign-intent/  # 节点二：宣传意图
├── 03-creative-outline/ # 节点三：创意路线与大纲
├── 04-master/           # 节点四：主稿与审校
├── 05-requirements/     # 节点五：素材需求
├── 06-production/       # 节点六：制作与验收
├── 07-release/          # 节点七：发布包装
├── 10-user-materials/   # 用户项目资料；Agent 只读
└── 11-references/       # 用户授权参考资料；Agent 只读
```

`00-control/` 到 `07-release/` 由 Promo 维护，用户资料目录由用户维护。Agent 不得读取相邻 workflow、父目录、项目级 `sources/` 或工作区之外的本地路径；本地路径越界会被服务拒绝。制品和状态也不能通过直接改 JSON 绕过工作流，必须经 `promo_workflow` 提交。

如果用户声明“从节点 3/4/5 等中间节点开始”，确认工作区后不能直接跳入：Agent 先分析 `10-user-materials/` 和 `11-references/` 中的进度包，把现有内容填入当前工作流，并提交节点覆盖、缺失项和证据。缺失项会分为“可省略”和“重大决策断层”，再向用户建议继续或回滚。用户坚持继续时，系统通过工作区接续 Grill 补充关键事实，不强制回滚。

### 5. 按流程协作，而不是等一篇“黑箱成稿”

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
├── README.md                            # 本项目工作区约定；首次启动必须先读
├── 00-control/
│   ├── workspace-scope.json             # 服务维护的边界记录
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
├── 07-release/
├── 10-user-materials/                  # 用户可阅读资料与进度包
└── 11-references/                      # 用户授权参考资料
```

审核包会由 Agent 翻译成“先看结论—节点证据—制作计划—事件时间线—当前决定”的人审摘要，展开对应的制品内容与版本信息，而不只是给一串链接，也不把存储 JSON 原样贴给人。人工决定必须绑定当前 revision：

- `approve`：解锁制作节点；
- `revise`：明确退回节点 2、3、4 或 5，历史制品继续可追溯；
- `reject`：终止当前方案，不让它静默流入制作。

这条门禁是流程正确性的核心：Agent 自己说“审过了”不等于人已经批准。

### 本地纵向审核台

需要把一整个流程从选题到发布连续看完时，启动本地审核台：

```bash
npm run build
npm run review
```

默认打开 `http://127.0.0.1:4173`。它只读取当前 `PROMO_WORKFLOW_DATA_DIR`（默认 `data/`）中已冻结的工作流制品，把选题与证据、宣传意图、创意与大纲、主稿、素材需求、制作、发布包装排成可展开的纵向链路。它会订阅本地流程状态和制品变化，按状态机自动标出当前节点并刷新内容。

启动 MCP 时，工作台会默认随之启动。每次 `promo_get`、`promo_run` 或 `promo_commit` 都返回 `workbench`：其中包含当前工作流直达链接、它负责监控的内容，以及 Agent 必须主动展示/打开链接的说明。工作台只负责让用户看见进度、证据、版本、待办和人工审核点；它不会直接改状态，也不会代替人工决定。批准、退回、拒绝仍须经 `promo_commit` 绑定当前 revision。

工作台首页按“视频 / 推文”分成两个选项卡；每个选项卡再按项目根目录归组并列出可选择的具体工作流。列表展示的是 Agent 在创建时写入的稳定名称，而不是内部工作流 ID。根目录与载体共同构成复用键：同一根目录最多保留一条视频流程和一条推文流程；再次创建同一组合时 MCP 返回已有流程并标记 `reused: true`，不会生成平行副本。创建时应传入 `rootDirectory` 与简洁的 `displayName`。

可用 `PROMO_REVIEW_PORT` 改端口、`PROMO_REVIEW_HOST` 改监听地址；默认只监听本机回环地址。

## 可选的多路径竞争

对低风险、希望多花一点 token 换质量的节点，可在创建流程时开启：

```json
{
  "competition": {
    "enabled": true,
    "fanout": 3,
    "selectionMode": "top_p",
    "topP": 0.85
  }
}
```

Agent 此时应生成 2–5 条真正不同的策略路径，先淘汰不满足事实、证据或制作约束的候选，再结合当前节点注入的编辑指导判断读者决定、产品语境、品牌表达、叙事结构与可视化证明。Top‑p 会留下最小的强候选集，并由 Agent 选出一个最适合当前语境的主推荐方案，说明选择理由；结果通过 `submit_competition_report` 保存，候选与评审会进入审核包。

## MCP 工具一览

| 工具 | 用途 |
| --- | --- |
| `promo_get` | 查看全部流程或单条流程、工作区边界、当前 revision、下一步动作、制品引用与 `workbench` 监控链接 |
| `promo_review` | 获取当前工作流的本地实时工作台链接与启动状态 |
| `promo_guidance` | 按当前节点读取完整流程、文风、文章或分镜指导 |
| `promo_run` | 执行该节点无需人工决定的自动步骤 |
| `promo_commit` | 创建流程，或提交工作区确认、进度审计、接续 Grill、选材、基线、大纲、母版、审核、制作与发布决定 |

每次写操作都带 `expectedRevision` 与 `idempotencyKey`：前者避免并发覆盖，后者让同一个请求可安全重试。把 `promo_get` 返回的 `pendingAction` 交给 Agent 作为下一步的唯一依据，能避免跳过锁定和审核。

## 视频与文章能交付到哪里

### 视频

可稳定规划和交付：叙事大纲、连续分镜、口播稿、录制执行稿、最小素材需求、素材复用关系、SRT、制作单元与验收记录。

可选接入 Cut Workbench 或 VectCut：前者用于项目和阶段化制作，后者用于轻量的可编辑时间线草稿。最终导出仍在你选择的编辑器中完成。

#### 轻量路径：VectCut

安装 `promo-vectcut-adapter` 并配置一个可访问的本地 VectCut 服务后，工作流会把已接受的素材、锁定时间线和 SRT 生成一份可编辑草稿。人工可在剪映/CapCut 中审阅；需要内容改动时，工作流回退受影响的制作单元并生成一份新的草稿。

这条路径强调低安装门槛，不读取或增量改写已有剪映工程。

#### 完整路径：Cut Workbench

先安装插件，再运行一条配置命令：

```bash
codex plugin add promo-cut-workbench-adapter@promo-workflow
npm run setup:cut-workbench
```

配置器会自动：拉取 Cut Workbench 的 `master` 分支、选择 Python 3.11+、创建独立运行目录、写入用户级配置，并运行 MCP 健康检查。它不会安装剪映、codec 或修改任何剪映工程。

Cut Workbench 仓库目前是私有仓库；执行者需要相应的 GitHub 访问权限。已有受控源码副本时，改用：

```bash
npm run setup:cut-workbench -- --source-dir /path/to/CutWorkBench
```

Windows PowerShell 示例：

```powershell
npm run setup:cut-workbench -- --source-dir D:\projects\CutWorkBench --runtime-dir D:\promo-workflow\cut-runtime --python C:\Python311\python.exe
```

成功后，在新的 Codex 任务中让 Agent 调用 `promo_get`。当返回以下状态，视频制作后端才算真正接通：

```text
adapterStatus.cut_workbench.installed = true
adapterStatus.cut_workbench.available = true
adapterStatus.cut_workbench.configurationSource = "local_config"
```

只有需要“Agent 与剪映工程双端反复修改”时，再进行高级验证：准备一份可复制的剪映专业版 11.3 测试工程，配置并固定 codec sidecar 的版本/哈希，再完成一次 `sync.open → sync.preview → sync.commit → sync.publish`。发布动作只生成工程副本，不覆盖原工程。

### 文章

可稳定规划和交付：编辑意图、文章结构、完整母稿、证据与视觉证明计划、平台化发布包装，以及可本地审阅的预览类似物。

当前版本不直接登录内容平台、不做后台排版同步，也不自动发布。这样发布权限、平台账号和最终事实责任始终在团队手里。

## 配置与数据

| 项目 | 默认行为 | 可选配置 |
| --- | --- | --- |
| 工作流本机位置 | `npm run setup` 写入用户级配置 | `PROMO_WORKFLOW_ROOT`、`PROMO_WORKFLOW_NODE` 仅用于自动化覆盖 |
| 流程与制品数据 | 写入 `data/` | `PROMO_WORKFLOW_DATA_DIR` |
| 网页抓取 | 由 Agent 宿主执行 | 使用宿主的浏览器或 Web Fetch 能力 |
| VectCut 草稿 | 安装 VectCut 适配包且未配置时返回能力缺口，不伪造结果 | `PROMO_VECTCUT_BASE_URL` |
| Cut Workbench | `npm run setup:cut-workbench` 写入本机配置并自检 | `PROMO_CUT_WORKBENCH_*` 仅用于自动化覆盖 |
| 外部适配器 | Codex 自动识别已安装的适配包；其他宿主可显式提供适配器目录 | `PROMO_WORKFLOW_ADAPTER_DIRS` |

核心服务不要求数据库、Docker、平台账号或视频软件。Docker 仅用于可选的 VectCut HTTP 服务，启动方式见 [docker-compose.vectcut.yml](docker-compose.vectcut.yml)。

## 自动安装的工作流 Skill

[`promo-video-article-workflow`](plugins/promo-video-article-workflow/skills/promo-video-article-workflow/) 是独立于 MCP 的宿主 Skill。它在用户提出“为产品做视频或推文的选题、定位、脚本、制作、审核或发布”这类受管流程任务时触发：先读取 MCP 的当前状态，再只执行状态机允许的调用，并在选择、锁定和人工审核点停下来。MCP 本身只提供状态、版本、制品和变更接口。

它与 `promo_workflow` MCP 位于基础包 `promo-video-article-workflow`。Codex 安装这个基础包时会同时安装入口 Skill 和 MCP，不需要手工链接 Skill 目录。其他 MCP 宿主仍可使用根目录的 [`.mcp.json`](.mcp.json)，但是否自动安装 Skill 取决于该宿主自己的插件机制。

在 Codex 中可显式写 `$promo-video-article-workflow`；正常的视频/推文宣发策划请求也会自动匹配它。

## 可选任务与制作插件

基础包负责“何时进入流程、如何推进、何时停下”。以下包只在对应任务和节点出现时增强 Agent，不替代 MCP 的状态权威：

| 插件包 | 适用任务 | 对流程的影响 |
| --- | --- | --- |
| `promo-human-language-writing` | 所有中文宣发的宣传意图、创意、大纲、口播/推文主稿、标题简介与修订 | 以高优先级门禁识别并修复四类 AI 八股；不突破证据边界 |
| `promo-product-writing` | 视频或推文的创意、大纲、母稿、标题与简介 | 增加证据与文风监督 |
| `promo-product-tweet-editor` | 科技产品推文的编辑契约、结构、主稿、视觉证明、预览与发布包装 | 按节点迁移并审查 APPSO 整体编辑风格；不复制原句或刊物身份 |
| `promo-video-preproduction` | 视频大纲、口播、分镜、前期素材执行包 | 增加视频前期交付约束 |
| `promo-cut-workbench-adapter` | 接入本机 Cut Workbench 制作 | 读取 `npm run setup:cut-workbench` 生成的用户级配置 |
| `promo-vectcut-adapter` | 生成 VectCut 可编辑草稿 | 提供 VectCut HTTP 制作桥接配置 |

`promo_get` 会返回当前节点所需指导包的提示，以及 `adapterStatus`：每个制作适配器的安装、配置和可用状态。未安装或未配置时，服务保持在可审阅的能力缺口，而不会虚构制作完成。

## 开发、验证与排障

```bash
npm test
npm run build
```

如果客户端看不到工具，先在仓库根目录重新执行 `npm run build && npm run setup`，再重新安装/重启对应插件并新开一个任务。若连接成功但流程无法继续，调用 `promo_get`，不要猜下一步：返回的 `pendingAction` 会说明所需提交、当前 revision 和制品位置；`adapterStatus` 会说明制作后端是未安装、未配置还是已可用。

## 当前边界

- 服务不自行抓取网页，也不绕过宿主的联网权限；
- 服务不自动拍摄、生成最终视频、替你登录发布平台或替你发布；
- Agent 可以提出方案、写稿和协调工具，但高影响的审核决定必须由人提交；
- 外部制作工具不可用时，服务返回明确的能力缺口，而不是声称已经完成制作。
