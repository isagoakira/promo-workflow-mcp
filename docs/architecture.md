# Architecture

## Fixed shape

```text
Codex / Agent
  -> thin Skill
  -> Local MCP adapter
  -> Promo Service
       -> Injector
       -> State Machine
       -> Agent Web Fetch brief
       -> Bidirectional Matcher
       -> Cut Workbench Adapter
       -> Article Assembler
       -> Local JSON workflow store + immutable artifact store
```

The workflow driver Skill is the only trigger for managed promotional work. The local service is the source of truth.

## Installable extension boundary

```text
promo-video-article-workflow (required)
  -> promo_workflow MCP + workflow driver Skill

optional task packs
  -> promo-human-language-writing (high-priority writing gate)
  -> promo-product-writing
  -> promo-product-tweet-editor (APPSO 指定风格按文章节点拆分)
  -> promo-video-preproduction

optional production adapters
  -> promo-cut-workbench-adapter
  -> promo-vectcut-adapter
```

The core state machine never depends on an optional package. An Agent-work capsule names the focused host package for each guidance policy, while `promo_guidance` remains the canonical MCP-owned text. Human-language guidance is marked high priority and is loaded before normal-priority writing guidance whenever the current node allows it. At production, `promo_get` adds `adapterStatus` with each adapter's installation, configuration, availability, and remediation. A missing adapter is a capability gap rather than an implicit fallback.

## MCP interface

The intended external interface has three tools:

- `promo_get`: return the current state capsule and pending work.
- `promo_run`: execute the automatic action allowed by the current state.
- `promo_commit`: persist a human choice or edit and advance the state.

## Workflow states

```text
NEEDS_PROFILE
  -> READY
  -> FETCHING
  -> MATCHING
  -> AWAITING_SELECTION
  -> TOPIC_LOCKED
  -> ALIGNING_BASELINE
  -> BASELINE_LOCKED
  -> GENERATING_CREATIVE
  -> ALIGNING_OUTLINE
  -> OUTLINE_LOCKED
  -> GENERATING_MASTER
  -> ALIGNING_MASTER
  -> MASTER_LOCKED
  -> COMPILING_REQUIREMENTS
  -> REQUIREMENTS_READY
  -> PRODUCING
  -> PRODUCTION_LOCKED
  -> PACKAGING
  -> RELEASE_READY
```

The product profile contains stable positioning, core capabilities, and 2–3 active campaign lines. `promo_run` first generates a compact fetch brief. The Agent uses its own Web Fetch or browser ability and returns source-preserving topic cards through `promo_commit(kind=submit_fetched_topics)`. A second `promo_run` performs local matching and returns Top 3 candidates for human selection. This keeps the service agent-neutral and removes crawler/network dependencies from local installation.

`ALIGNING_BASELINE` is a conversational loop. The Injector provides the locked topic, selected materials, product context, and inferred user intent. The agent recommends a baseline and grills one unresolved decision at a time. Each answer is submitted through `promo_commit`, then `promo_get` returns the next capsule. No automatic `promo_run` is needed inside this state.

The state advances to `BASELINE_LOCKED` only when the user confirms both:

- `core_message`: the single idea the audience should remember.
- `guidance_intent`: the understanding or action the content should lead the audience toward.

Only the confirmed baseline is durable. The full grill transcript is not part of the workflow record.

`GENERATING_CREATIVE` is an automatic, transient state entered through `promo_run`. It creates one cross-media creative spine and one current-carrier outline. `ALIGNING_OUTLINE` then uses a bounded, one-question-at-a-time grill through `promo_get` and `promo_commit`. The Injector applies `geek-product-promo-writing` macro supervision during generation and review. The locked spine and outline are durable; the grill transcript is not.

`GENERATING_MASTER` produces one complete video timeline or article manuscript before local refinement. `ALIGNING_MASTER` uses `geek-product-promo-writing` and, for video, `storyboard-direction`. It fixes local issues automatically and grills only blocking choices, with hard limits of 2/3/4 questions for short/standard/long work. The locked master and shared cross-media asset plan are durable; the Grill transcript is not.

`COMPILING_REQUIREMENTS` is automatic. It converts all master usages into the smallest tool-independent material requirement set and derives video SRT cues. It advances directly to `REQUIREMENTS_READY`. Node 6 returns a `capability_gap` when no available workflow can satisfy a requirement without changing its intent or constraints.

Node 6 uses one shared active state: `PRODUCING`. Promo translates Node 5 requirements into minimal `production_unit` references and binds one carrier-specific backend. Video binds Cut Workbench; article binds a lightweight Article Assembler. Promo owns only the backend reference, one pending human action, blockers, and locked output IDs.

Units use `human`, `generative`, or `local` routes and move through `queued`, `active`, `waiting_human`, `review`, `accepted`, or `needs_replan`. `promo_get` exposes at most one `produce`, `approve`, `review`, or `resolve` action. Detailed packs and Cut Workbench job state remain inside the implementation.

The video backend owns stages, revisions, generation jobs, editor synchronization, verification, and immutable handoff. The Node 5 SRT remains planned timing; Node 6 derives the final SRT from the audio actually heard after fine cut.

The article backend creates one platform branch per target and locks a versioned local platform profile. Its truth source is an ordered content-block document. It produces a local preview analogue and asset manifest, not a platform draft, exact backend layout, upload, or publication. Full behavior for both carriers is specified in [06-production-execution.md](06-production-execution.md).

`PACKAGING` is one automatic draft plus one human selection action. It creates three titles, two covers, and either a video introduction or article summary. Article packaging also derives one final local preview analogue. It never publishes or reopens the production backend. Full behavior is specified in [07-release-packaging.md](07-release-packaging.md).

## Deferred decisions

- Injector capsule schema
- Web sources and fetch cadence
- Matching implementation
- SQLite schema and migrations
- Service lifecycle and local startup mechanism
- Cut Workbench process discovery and local launch configuration
- Concrete platform-profile content and refresh commands
- Exact platform layout adapters, upload, draft synchronization, and publishing
