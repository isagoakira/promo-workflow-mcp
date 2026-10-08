# Promo Workflow

A local MCP workflow that takes a product campaign from “is this topic worth covering?” to deliverables ready for review, production, and release.

Promo Workflow is for teams that regularly produce product videos or WeChat Official Account articles. Agents research, draft, organize, and execute; the service locks versions, records decisions, generates explicit deliverables, and pauses where human judgment is required. It does not invent content or treat a single chat as project management.

```text
Topic selection and evidence → Campaign intent → Creative outline → Master → Material requirements
                                                                               ↓
                                                                   Human review and version freeze
                                                                               ↓
                                                          Production → Titles, cover, release package
```

## What it solves

Campaign production often breaks down because the team repeatedly has to realign: does the topic connect to the product, whose understanding should change, do the outline and final video tell the same story, who fills the material gaps, and which version is ready for production?

Promo Workflow captures these decisions in a recoverable state machine:

- Match external topics against product positioning, capabilities, and current campaign messages, rather than popularity alone.
- Lock the campaign's core message and intended user action before expanding the outline and complete master.
- For videos, deliver storyboards, voiceover scripts, recording instructions, material requirements, and SRT subtitles; for articles, deliver structure, full text, a visual evidence plan, and a local preview.
- Compile the evidence, decisions, Grill records, candidate reviews, and requirements from nodes 1–5 into one human review package.
- Require human approval before production; returning to a specified node preserves earlier versions.
- Expose key deliverables at stable paths, with immutable versions and content hashes.

It suits teams where agents participate in content production while people retain responsibility for creative decisions and publication. Fetching, filming, AI generation, editing, and platform publication are performed by connected hosts or production tools; this is not an automatic publisher, web crawler, or one-click video generator.

## Getting started: choose a path

| Goal | Install | Editing software required? |
| --- | --- | --- |
| Planning, scripts, articles | Base package | No |
| Video planning and editable drafts | Base package + VectCut adapter | Optional |
| Full video production, version review, and Jianying collaboration | Base package + Cut Workbench adapter | Jianying synchronization is needed only for the final advanced validation step |

### 1. All users: build and register the local path

Requires Node.js 20+. Git and Python 3.11+ are additional requirements for installing Cut Workbench.

Use the same commands on macOS, Linux, and Windows PowerShell:

```bash
git clone https://github.com/isagoakira/promo-workflow-mcp.git
cd promo-workflow-mcp
npm install
npm run build
npm run setup
```

The last command writes a user-level configuration file so installed plugins can locate the built repository:

| System | Default configuration path |
| --- | --- |
| Windows | `%APPDATA%\\promo-workflow\\local.json` |
| macOS | `~/Library/Application Support/promo-workflow/local.json` |
| Linux | `$XDG_CONFIG_HOME/promo-workflow/local.json`, or `~/.config/promo-workflow/local.json` if unset |

It does not modify shell profiles or require manually entered environment variables. Environment variables remain available for CI, containers, and team automation to override local settings.

### 2. Codex users: install the base package

Run from the repository root:

```bash
codex plugin marketplace add "$(pwd)"
codex plugin add promo-video-article-workflow@promo-workflow
```

The base package installs both the `promo_workflow` MCP and the `$promo-video-article-workflow` entry skill. Open a new Codex task after installation to load them.

Install optional packages from the same marketplace when you need article methods, video preproduction, or production backends. Topic selection, writing, and review work without them.

`promo-human-language-writing` is a high-priority natural-language gate for all Chinese promotional writing and is marked for default installation in the marketplace. It checks concrete people, situations, details, judgments, and evidence boundaries before general style and platform adaptation.

Available packages:

```text
promo-video-article-workflow    Base MCP and workflow entry
promo-human-language-writing   High-priority natural-language writing gate
promo-product-writing          Technology product writing supervision
promo-product-tweet-editor     Technology product article editing
promo-video-preproduction      Video preproduction delivery constraints
promo-tim-cinematic-storycraft  Technical film planning (video N2/N3/N4)
promo-cut-workbench-adapter     Full video production adapter
promo-vectcut-adapter          Lightweight editable draft adapter
```

The root [`.mcp.json`](.mcp.json) already registers `promo_workflow`. Any client supporting stdio MCP can use it:

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

In Claude Code, enter the repository, start `claude`, and approve `promo_workflow` when first prompted. Other clients use the same stdio configuration. `data/` is created automatically and ignored by Git.

> The root `.mcp.json` registers only `promo_workflow`. Cut Workbench connects through a separate plugin, which reads local configuration after `npm run setup:cut-workbench`. It is unnecessary for articles, planning, or material planning alone.

### 3. Tell the agent what you want to produce

After connecting MCP, give the agent a normal production request, for example:

> Create a 2,000–3,500-character WeChat Official Account article for “Product Name.” The target readers are product teams evaluating AI workflows. Start with a recent industry topic that genuinely connects to the product. Product capabilities are …, current campaign messages are …, and reference sources are …. Create the workflow with Promo Workflow and pause at each point that requires my decision.

The agent uses `promo_commit` to create the workflow, `promo_run` for automatic steps, and the service's `pendingAction` to request the information or confirmation actually needed. You do not need to memorize state names or assemble files manually.

For API or automation entry points, the core input is:

```json
{
  "kind": "create_workflow",
  "carrier": "article",
  "summary": "Workflow article for product teams",
  "context": {
    "productProfile": {
      "productName": "Product Name",
      "positioning": "One-sentence positioning",
      "capabilities": ["Capability one", "Capability two"],
      "activeCampaignLines": ["Current message one", "Current message two"],
      "targetAudience": "Target readers"
    },
    "topicSources": [
      {
        "id": "industry-rss",
        "label": "Industry news",
        "kind": "rss",
        "url": "https://example.com/feed.xml"
      }
    ]
  },
  "idempotencyKey": "create-campaign-001"
}
```

The agent reads websites using its own browser, Web Fetch, or enterprise search capabilities. Promo Workflow records sources, selection, and subsequent citations; it does not silently access the network on behalf of the host.

### 4. Create and confirm a dedicated workspace first

Each `create_workflow` creates a project directory structure under `data/workspace/<workflowId>/` and a root `README.md`. This README is the agent's first workspace gate: the agent must read it, explain the directory structure, user-material entry points, and access boundaries, and wait for explicit user confirmation before calling `promo_run` to advance node 1.

Place existing manuscripts, screenshots, screen recordings, redacted attachments, and progress packages that the user can read and authorize the agent to analyze here:

```text
data/workspace/<workflowId>/
├── 00-control/          # State, review packages, decisions, version tracking
├── 01-selection/        # Node 1: topic selection and evidence
├── 02-campaign-intent/  # Node 2: campaign intent
├── 03-creative-outline/ # Node 3: creative routes and outline
├── 04-master/           # Node 4: master and editorial review
├── 05-requirements/     # Node 5: material requirements
├── 06-production/       # Node 6: production and acceptance
├── 07-release/          # Node 7: release packaging
├── 10-user-materials/   # User project materials; read-only for the agent
└── 11-references/       # Authorized references; read-only for the agent
```

Promo maintains `00-control/` through `07-release/`; users maintain the material directories. Agents must not read neighboring workflows, parent directories, project-level `sources/`, or local paths outside the workspace. The service rejects out-of-scope local paths. Artifacts and state must be submitted through `promo_workflow`, rather than bypassing it by editing JSON directly.

If the user requests starting at an intermediate node such as 3, 4, or 5, the agent must first analyze the progress packages in `10-user-materials/` and `11-references/`, populate the current workflow, and submit node coverage, gaps, and evidence. It classifies gaps as “omittable” or “major decision gaps” and recommends continuing or rolling back. If the user insists on continuing, a workspace continuation Grill supplies key facts without forcing rollback.

### 5. Collaborate through the workflow

| Node | Automatic work | Your decision | Key deliverables |
| --- | --- | --- | --- |
| 1. Selection and matching | Fetch brief, aggregate material cards, match product relevance | Select topic and retained evidence | Topic cards, matching results, selected topic |
| 2. Campaign intent | Propose a baseline for discussion | Core message, intended perception change, CTA, expression boundaries | Campaign intent card, decision ledger |
| 3. Creative outline | Draft creative routes and outline | Choose route, answer bounded Grill questions, lock outline | Routes, locked outline, outline script |
| 4. Master | Generate a complete article master or video timeline master | Review and lock master | Article/storyboard, voiceover, recording instructions |
| 5. Material requirements | Compile minimum requirements and video SRT from the locked master | Review preproduction feasibility | Material requirements, preproduction execution package, SRT |
| Human review | Compile and freeze all supporting material from nodes 1–5 | Approve, return to nodes 2–5, or reject | `current-review.md` |
| 6. Production | Update existing production units, retain acceptance evidence | Review materials and production results | Production checkpoints, preview/project handoff |
| 7. Release packaging | Generate title options, cover directions, introduction/summary | Select and refine release package | Titles, cover directions, introduction/summary |

Videos support 2-, 5-, and 10-minute pacing profiles. Voiceover can explain the product, present a founder interview, share user experience, or serve another explicit segment purpose rather than mechanically filling the duration. Articles follow platform preferences, reader decisions, and evidence density, with local preview equivalents.

## The key control point: the review package

After requirements are locked, the workflow enters `AWAITING_HUMAN_REVIEW` instead of proceeding directly to production. The service generates:

```text
data/workspace/<workflowId>/
├── README.md                          # Workspace agreement; read on first startup
├── 00-control/
│   ├── workspace-scope.json           # Service-maintained boundary record
│   ├── current-review.md              # Current version awaiting review
│   ├── reviews/                       # Frozen historical review packages
│   ├── decision-ledger.json
│   └── competition-report.json        # When competition mode is enabled
├── 01-selection/
├── 02-campaign-intent/
├── 03-creative-outline/
├── 04-master/
├── 05-requirements/
├── 06-production/
├── 07-release/
├── 10-user-materials/                  # Readable user materials and progress packages
└── 11-references/                      # Authorized references
```

The agent turns the package into a human-readable summary: conclusion first, then node evidence, production plan, event timeline, and current decision. It expands artifact content and version information rather than presenting only links or raw storage JSON. Human decisions must bind to the current revision:

- `approve`: unlock production.
- `revise`: explicitly return to node 2, 3, 4, or 5, preserving artifact history.
- `reject`: terminate the current proposal so it cannot silently enter production.

This gate is central to workflow correctness: an agent saying “reviewed” does not constitute human approval.

### Local end-to-end review desk

To review a complete workflow from selection through release:

```bash
npm run build
npm run review
```

The default address is `http://127.0.0.1:4173`. The desk reads frozen workflow artifacts from `PROMO_WORKFLOW_DATA_DIR` (default: `data/`) and displays selection and evidence, campaign intent, creative outline, master, material requirements, production, and release packaging as an expandable vertical chain. It subscribes to local state and artifact changes, identifies the current node from the state machine, and refreshes content.

The workbench starts with MCP by default. Every `promo_get`, `promo_run`, or `promo_commit` returns `workbench`, including a direct workflow link, what it monitors, and instructions requiring the agent to show/open that link. The desk displays progress, evidence, versions, tasks, and human review points. State changes and approval, revision, or rejection still go through `promo_commit` with the current revision.

The home page has Video and Article tabs, each grouping workflows by project root. Lists show the stable name supplied by the agent, rather than an internal workflow ID. Root directory and carrier form the reuse key: one root can retain at most one video workflow and one article workflow. Recreating the same combination returns the existing workflow with `reused: true`. Supply `rootDirectory` and a concise `displayName` when creating a workflow.

Set `PROMO_REVIEW_PORT` or `PROMO_REVIEW_HOST` to change the port or listening address. The default binds only to loopback.

## Optional competing approaches

For low-risk nodes where extra tokens may improve quality, enable competition at creation:

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

The agent generates 2–5 genuinely different strategic approaches, eliminates candidates that fail factual, evidence, or production constraints, and evaluates reader decisions, product context, brand expression, narrative structure, and visual proof using the node's editorial guidance. Top-p retains the smallest strong candidate set; the agent chooses one primary recommendation suited to the context and explains why. `submit_competition_report` saves the results, candidates, and reviews for the review package.

## MCP tools

| Tool | Purpose |
| --- | --- |
| `promo_get` | Inspect workflows, workspace boundaries, current revision, next action, artifact references, and workbench links |
| `promo_review` | Get the current workflow's live local workbench link and startup status |
| `promo_guidance` | Read complete workflow, style, article, or storyboard guidance for the current node |
| `promo_run` | Execute automatic steps that require no human decision |
| `promo_commit` | Create workflows or submit workspace confirmation, progress audits, continuation Grill, selection, baseline, outline, master, review, production, and release decisions |

Every write carries `expectedRevision` and `idempotencyKey`: the former prevents concurrent overwrites, and the latter makes retries safe. Use `pendingAction` from `promo_get` as the sole basis for the agent's next step to avoid skipping locks or reviews.

## Video and article deliverables

### Video

Supported planning and delivery include narrative outlines, continuous storyboards, voiceover scripts, recording instructions, minimum material requirements, asset reuse relationships, SRT, production units, and acceptance records.

Optionally connect Cut Workbench for project management and staged production, or VectCut for lightweight editable timeline drafts. Final export remains in your chosen editor.

#### Lightweight path: VectCut

Install `promo-vectcut-adapter` and configure an accessible local VectCut service. The workflow produces an editable draft from accepted materials, the locked timeline, and SRT. People review it in Jianying/CapCut. Content changes return affected production units for revision and generate a new draft.

This path has a low installation barrier and does not read or incrementally rewrite existing Jianying projects.

#### Full path: Cut Workbench

Install the plugin, then run the setup command:

```bash
codex plugin add promo-cut-workbench-adapter@promo-workflow
npm run setup:cut-workbench
```

Setup fetches Cut Workbench's `master` branch, selects Python 3.11+, creates an independent runtime directory, writes user-level configuration, and runs an MCP health check. It does not install Jianying or a codec, or modify Jianying projects.

The Cut Workbench repository is currently private; the operator needs the appropriate GitHub access. To use an existing controlled source checkout:

```bash
npm run setup:cut-workbench -- --source-dir /path/to/CutWorkBench
```

Windows PowerShell example:

```powershell
npm run setup:cut-workbench -- --source-dir D:\projects\CutWorkBench --runtime-dir D:\promo-workflow\cut-runtime --python C:\Python311\python.exe
```

After setup, open a new Codex task and ask the agent to call `promo_get`. The video backend is connected only when it returns:

```text
adapterStatus.cut_workbench.installed = true
adapterStatus.cut_workbench.available = true
adapterStatus.cut_workbench.configurationSource = "local_config"
```

For repeated edits by both the agent and Jianying, perform advanced validation: prepare a copyable Jianying Pro 11.3 test project, configure and pin the codec sidecar's version/hash, and complete `sync.open → sync.preview → sync.commit → sync.publish`. Publication creates a project copy and never overwrites the original.

### Article

Supported deliverables include editorial intent, article structure, a complete master, evidence and visual proof plans, platform-specific release packaging, and a local review preview.

The current version does not log into content platforms, synchronize backend layout, or publish automatically. Publication permissions, platform accounts, and final responsibility for facts remain with the team.

## Configuration and data

| Item | Default behavior | Optional configuration |
| --- | --- | --- |
| Local workflow installation | `npm run setup` writes user-level configuration | `PROMO_WORKFLOW_ROOT`, `PROMO_WORKFLOW_NODE` for automation overrides |
| Workflow and artifact data | Written to `data/` | `PROMO_WORKFLOW_DATA_DIR` |
| Web fetching | Performed by the agent host | Host browser or Web Fetch capabilities |
| VectCut drafts | An installed but unconfigured adapter reports a capability gap | `PROMO_VECTCUT_BASE_URL` |
| Cut Workbench | `npm run setup:cut-workbench` writes and checks local configuration | `PROMO_CUT_WORKBENCH_*` for automation overrides |
| External adapters | Codex discovers installed adapters; other hosts may supply adapter directories | `PROMO_WORKFLOW_ADAPTER_DIRS` |

The core service requires no database, Docker, platform accounts, or video software. Docker is only for the optional VectCut HTTP service; see [docker-compose.vectcut.yml](docker-compose.vectcut.yml).

## Automatically installed workflow skill

[`promo-video-article-workflow`](plugins/promo-video-article-workflow/skills/promo-video-article-workflow/) is a host skill separate from MCP. It activates for managed product video or article tasks covering selection, positioning, scripts, production, review, or release. It reads current MCP state, makes only state-machine-permitted calls, and pauses at selection, locking, and human review points. MCP itself supplies state, versions, artifacts, and mutation interfaces.

The skill and `promo_workflow` MCP are both in the base `promo-video-article-workflow` package. Codex installs them together without manual skill-directory linking. Other MCP hosts can use the root [`.mcp.json`](.mcp.json); automatic skill installation depends on their plugin mechanism.

In Codex, invoke `$promo-video-article-workflow` explicitly or let a normal video/article campaign request match it automatically.

## Optional task and production plugins

The base package controls when to enter the workflow, how to advance, and when to pause. These packages enhance the agent for specific tasks and nodes without replacing MCP as the state authority:

| Plugin | Applicable tasks | Effect |
| --- | --- | --- |
| `promo-human-language-writing` | Intent, creative routes, outlines, voiceover/article masters, titles, summaries, and revisions for all Chinese campaigns | High-priority gate that identifies and repairs four kinds of formulaic AI prose while preserving evidence boundaries |
| `promo-product-writing` | Video/article creative routes, outlines, masters, titles, introductions | Evidence and style supervision |
| `promo-product-tweet-editor` | Technology product article contracts, structure, masters, visual proof, previews, release packaging | Applies and reviews APPSO's overall editorial style by node without copying sentences or publication identity |
| `promo-video-preproduction` | Video outlines, voiceover, storyboards, preproduction material execution packages | Video preproduction delivery constraints |
| `promo-tim-cinematic-storycraft` | Video N2 intent, N3 creative routes, N4 storyboard master and material plan | Turns real technical problems into a visual promise, narrative beats, and traceable evidence; CutWorkbench handles production after master locking, without imitating a creator's identity or stock phrasing |
| `promo-cut-workbench-adapter` | Local Cut Workbench production | Reads user-level configuration generated by `npm run setup:cut-workbench` |
| `promo-vectcut-adapter` | VectCut editable drafts | VectCut HTTP production bridge configuration |

`promo_get` returns guidance-package hints for the current node and `adapterStatus`, reporting each production adapter's installation, configuration, and availability. Missing adapters produce a reviewable capability gap instead of fabricated completion.

## Development, validation, and troubleshooting

```bash
npm test
npm run build
```

If a client cannot see tools, rerun `npm run build && npm run setup` at the repository root, reinstall/restart the relevant plugin, and open a new task. If connected but unable to continue, call `promo_get`: `pendingAction` identifies the required submission, current revision, and artifact location; `adapterStatus` distinguishes missing installation, missing configuration, and availability.

## Current boundaries

- The service does not fetch websites itself or bypass the host's network permissions.
- It does not film, generate final videos, log into publishing platforms, or publish on your behalf.
- Agents can propose, draft, and coordinate tools; high-impact review decisions must be submitted by people.
- Unavailable production tools return explicit capability gaps rather than claims of completed production.
