import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { watch, type FSWatcher } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

type JsonRecord = Record<string, unknown>;

interface ReviewHostOptions {
  dataDirectory: string;
  host?: string | undefined;
  port?: number | undefined;
}

interface WorkflowSummary {
  workflowId: string;
  carrier: string;
  state: string;
  revision: number;
  summary: string;
  updatedAt: string | null;
  progress: WorkflowProgress;
}

interface WorkflowProgress {
  node: number;
  label: string;
  detail: string;
  terminal: boolean;
}

interface ReviewArtifact {
  artifactId: string;
  kind: string;
  content: unknown;
}

interface ReviewStep {
  node: number;
  label: string;
  state: "complete" | "current" | "pending";
  artifacts: ReviewArtifact[];
}

const STEPS = [
  { node: 1, label: "选题与证据", kinds: ["fetched_topic_cards", "topic_match", "selected_topic"] },
  { node: 2, label: "核心诉求", kinds: ["baseline"] },
  { node: 3, label: "创意路线与大纲", kinds: ["creative_routes", "creative_route_selection", "creative_outline_draft", "creative_outline", "outline_script"] },
  { node: 4, label: "主稿与审校", kinds: ["content_master_draft", "master_review", "content_master", "spoken_script", "recording_execution"] },
  { node: 5, label: "素材需求", kinds: ["requirement_set", "preproduction_material_plan", "asset_plan", "subtitle"] },
  { node: 6, label: "制作与验收", kinds: ["production_plan", "production_checkpoint", "production_handoff", "production_locked", "article_document", "preview", "asset_manifest", "vectcut_draft"] },
  { node: 7, label: "发布包装", kinds: ["release_package_draft", "release_package"] },
] as const;

/**
 * Read-only local review server. It deliberately serves only paths already
 * projected into a workflow's own workspace and never exposes the parent data
 * directory as static files.
 */
export function createReviewHost(options: ReviewHostOptions): Server {
  const dataDirectory = resolve(options.dataDirectory);
  const subscribers = new Set<ServerResponse>();
  let notifyTimer: NodeJS.Timeout | undefined;
  const notify = (): void => {
    if (notifyTimer) return;
    notifyTimer = setTimeout(() => {
      notifyTimer = undefined;
      const message = `event: workflow-change\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`;
      for (const subscriber of subscribers) subscriber.write(message);
    }, 120);
  };
  let watcher: FSWatcher | undefined;
  try {
    watcher = watch(dataDirectory, { recursive: true }, (_eventType, filename) => {
      if (!filename || filename === "workflows.json" || filename.startsWith(`workspace${sep}`)) notify();
    });
  } catch {
    // The interface still works with manual refresh on filesystems without recursive watch support.
  }
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (url.pathname === "/api/updates") return subscribe(request, response, subscribers);
      if (url.pathname === "/api/workflows") {
        return sendJson(response, await listWorkflows(dataDirectory));
      }
      const workflowMatch = /^\/api\/workflows\/([A-Za-z0-9_-]+)$/.exec(url.pathname);
      if (workflowMatch?.[1]) {
        return sendJson(response, await readWorkflowReview(dataDirectory, workflowMatch[1]));
      }
      if (url.pathname === "/" || url.pathname === "/index.html") return sendText(response, INDEX_HTML, "text/html; charset=utf-8");
      if (url.pathname === "/review.css") return sendText(response, REVIEW_CSS, "text/css; charset=utf-8");
      if (url.pathname === "/review.js") return sendText(response, REVIEW_JS, "text/javascript; charset=utf-8");
      return sendText(response, "Not found", "text/plain; charset=utf-8", 404);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return sendJson(response, { error: message }, 500);
    }
  });
  server.on("close", () => {
    watcher?.close();
    if (notifyTimer) clearTimeout(notifyTimer);
    for (const subscriber of subscribers) subscriber.end();
    subscribers.clear();
  });
  return server;
}

export async function startReviewHost(options: ReviewHostOptions): Promise<Server> {
  const server = createReviewHost(options);
  await new Promise<void>((resolveListening, rejectListening) => {
    server.once("error", rejectListening);
    server.listen(options.port ?? 4173, options.host ?? "127.0.0.1", () => {
      server.off("error", rejectListening);
      resolveListening();
    });
  });
  return server;
}

async function listWorkflows(dataDirectory: string): Promise<WorkflowSummary[]> {
  const store = asRecord(await readJson(join(dataDirectory, "workflows.json")));
  const workflows = asRecord(store?.workflows) ?? {};
  return Object.values(workflows)
    .map((value) => asRecord(value))
    .filter((value): value is JsonRecord => value !== null)
    .map((workflow) => ({
      workflowId: text(workflow.id) ?? "unknown",
      carrier: text(workflow.carrier) ?? "article",
      state: text(workflow.state) ?? "UNKNOWN",
      revision: number(workflow.revision) ?? 0,
      summary: text(workflow.summary) ?? "暂无流程摘要。",
      updatedAt: text(workflow.updatedAt),
      progress: progressForState(text(workflow.state) ?? "UNKNOWN"),
    }))
    .sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""));
}

async function readWorkflowReview(dataDirectory: string, workflowId: string): Promise<JsonRecord> {
  const workspaceRoot = resolve(dataDirectory, "workspace", workflowId);
  const manifest = asRecord(await readJson(join(workspaceRoot, "manifest.json")));
  if (!manifest) throw new Error("工作流审核台缺少 manifest.json。请先让 Promo Workflow 同步工作区制品。");

  const workflow = (await listWorkflows(dataDirectory)).find((item) => item.workflowId === workflowId) ?? {
    workflowId,
    carrier: text(manifest.carrier) ?? "article",
    state: text(manifest.state) ?? "UNKNOWN",
    revision: number(manifest.revision) ?? 0,
    summary: text(manifest.summary) ?? "暂无流程摘要。",
    updatedAt: null,
    progress: progressForState(text(manifest.state) ?? "UNKNOWN"),
  };
  const deliverables = array(manifest.deliverables) ?? [];
  const artifacts = await Promise.all(deliverables.map(async (value) => readArtifact(workspaceRoot, asRecord(value))));

  const steps: ReviewStep[] = STEPS.map((step) => {
    const stepArtifacts = artifacts.filter((artifact): artifact is ReviewArtifact => artifact !== null && step.kinds.includes(artifact.kind as never));
    return {
      node: step.node,
      label: step.label,
      state: workflow.progress.terminal || step.node < workflow.progress.node
        ? "complete"
        : step.node === workflow.progress.node ? "current" : "pending",
      artifacts: stepArtifacts,
    };
  });
  const control = artifacts.filter((artifact): artifact is ReviewArtifact => artifact !== null && !STEPS.some((step) => step.kinds.includes(artifact.kind as never)));
  const record = asRecord(asRecord(await readJson(join(dataDirectory, "workflows.json")))?.workflows);
  const workflowRecord = asRecord(record?.[workflowId]);

  return {
    workflow,
    steps,
    control,
    events: array(workflowRecord?.events) ?? [],
    reviewMode: workflow.state === "AWAITING_HUMAN_REVIEW",
  };
}

function progressForState(state: string): WorkflowProgress {
  const progress: Record<string, WorkflowProgress> = {
    NEEDS_PROFILE: { node: 1, label: "选题与证据", detail: "等待产品信息", terminal: false },
    READY: { node: 1, label: "选题与证据", detail: "准备找材料", terminal: false },
    FETCHING: { node: 1, label: "选题与证据", detail: "正在收集材料", terminal: false },
    MATCHING: { node: 1, label: "选题与证据", detail: "正在比较候选", terminal: false },
    AWAITING_SELECTION: { node: 1, label: "选题与证据", detail: "等待选定点子", terminal: false },
    TOPIC_LOCKED: { node: 2, label: "核心诉求", detail: "准备明确内容方向", terminal: false },
    ALIGNING_BASELINE: { node: 2, label: "核心诉求", detail: "正在对齐读者与诉求", terminal: false },
    BASELINE_LOCKED: { node: 3, label: "创意路线与大纲", detail: "准备提出路线", terminal: false },
    GENERATING_CREATIVE: { node: 3, label: "创意路线与大纲", detail: "正在生成路线", terminal: false },
    ALIGNING_OUTLINE: { node: 3, label: "创意路线与大纲", detail: "正在锁定路线与结构", terminal: false },
    OUTLINE_LOCKED: { node: 4, label: "主稿与审校", detail: "准备扩写主稿", terminal: false },
    GENERATING_MASTER: { node: 4, label: "主稿与审校", detail: "正在生成主稿", terminal: false },
    ALIGNING_MASTER: { node: 4, label: "主稿与审校", detail: "正在写作与审校", terminal: false },
    MASTER_LOCKED: { node: 5, label: "素材需求", detail: "准备梳理证明素材", terminal: false },
    COMPILING_REQUIREMENTS: { node: 5, label: "素材需求", detail: "正在编译素材需求", terminal: false },
    REQUIREMENTS_READY: { node: 5, label: "素材需求", detail: "等待生成审核包", terminal: false },
    AWAITING_HUMAN_REVIEW: { node: 5, label: "素材需求", detail: "等待人工审核后进入制作", terminal: false },
    PRODUCING: { node: 6, label: "制作与验收", detail: "正在制作并验收", terminal: false },
    PRODUCTION_LOCKED: { node: 7, label: "发布包装", detail: "准备发布包装", terminal: false },
    PACKAGING: { node: 7, label: "发布包装", detail: "正在准备标题、封面与摘要", terminal: false },
    RELEASE_READY: { node: 7, label: "发布包装", detail: "流程已完成", terminal: true },
    REJECTED: { node: 5, label: "素材需求", detail: "本轮方案已终止", terminal: true },
  };
  return progress[state] ?? { node: 1, label: "选题与证据", detail: "等待流程同步", terminal: false };
}

async function readArtifact(workspaceRoot: string, deliverable: JsonRecord | null): Promise<ReviewArtifact | null> {
  if (!deliverable) return null;
  const artifactId = text(deliverable.artifactId);
  const kind = text(deliverable.kind);
  const path = text(deliverable.path);
  if (!artifactId || !kind || !path || !isInside(workspaceRoot, path)) return null;
  if (path.endsWith(".md")) return { artifactId, kind, content: await readFile(path, "utf8") };
  const artifact = asRecord(await readJson(path));
  return { artifactId, kind, content: artifact?.content ?? artifact };
}

function isInside(root: string, target: string): boolean {
  const resolvedTarget = resolve(target);
  const relativeTarget = relative(root, resolvedTarget);
  return relativeTarget === "" || (!relativeTarget.startsWith(`..${sep}`) && relativeTarget !== ".." && !relativeTarget.startsWith(".."));
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonRecord : null;
}

function array(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sendJson(response: ServerResponse, value: unknown, status = 200): void {
  sendText(response, JSON.stringify(value), "application/json; charset=utf-8", status);
}

function sendText(response: ServerResponse, value: string, contentType: string, status = 200): void {
  response.writeHead(status, {
    "content-type": contentType,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(value);
}

function subscribe(request: IncomingMessage, response: ServerResponse, subscribers: Set<ServerResponse>): void {
  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  response.write(`event: connected\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
  subscribers.add(response);
  request.on("close", () => subscribers.delete(response));
}

const INDEX_HTML = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Promo Review Desk</title>
    <link rel="stylesheet" href="/review.css" />
  </head>
  <body>
    <div class="paper-noise"></div>
    <header class="topbar">
      <a class="wordmark" href="/">PROMO <em>REVIEW</em></a>
      <div class="toolbar">
        <span id="live-indicator" class="live-indicator">正在连接</span>
        <label>当前工作流 <select id="workflow-picker" aria-label="切换工作流"></select></label>
        <button id="refresh" type="button">刷新制品</button>
      </div>
    </header>
    <main id="app" aria-live="polite"><div class="loading">正在铺开审核链路…</div></main>
    <script src="/review.js"></script>
  </body>
</html>`;

const REVIEW_CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Noto+Serif+SC:wght@400;500;600;700;900&display=swap');
:root { --paper:#eee9dc; --ink:#17202d; --muted:#69717a; --line:#c9c0ae; --blue:#0e5b73; --rust:#c85432; --yellow:#e9be55; --card:#f8f5eb; --shadow:0 15px 40px rgba(23,32,45,.10); }
* { box-sizing:border-box; }
body { margin:0; color:var(--ink); background:var(--paper); font-family:'Noto Serif SC','Songti SC',serif; }
button, select { font:inherit; color:inherit; }
.paper-noise { position:fixed; inset:0; pointer-events:none; opacity:.3; background-image:radial-gradient(rgba(17,28,37,.16) .55px,transparent .65px); background-size:5px 5px; mix-blend-mode:multiply; }
.topbar { height:74px; display:flex; align-items:center; justify-content:space-between; gap:24px; padding:0 clamp(20px,5vw,84px); border-bottom:1px solid var(--line); position:sticky; top:0; z-index:5; background:rgba(238,233,220,.92); backdrop-filter:blur(12px); }
.wordmark { letter-spacing:.12em; font-family:'DM Mono',monospace; font-size:15px; text-decoration:none; color:var(--ink); } .wordmark em { color:var(--rust); font-style:normal; }
.toolbar { display:flex; align-items:center; gap:13px; font:12px 'DM Mono',monospace; letter-spacing:.04em; } .toolbar label { color:var(--muted); } .live-indicator { color:var(--muted); font-size:10px; white-space:nowrap; }.live-indicator::before { content:''; display:inline-block; width:7px; height:7px; margin-right:5px; border-radius:50%; background:var(--muted); }.live-indicator.live { color:var(--blue); }.live-indicator.live::before { background:var(--blue); box-shadow:0 0 0 4px rgba(14,91,115,.14); animation:pulse 1.5s infinite; }.live-indicator.stale { color:var(--rust); }.live-indicator.stale::before { background:var(--rust); } @keyframes pulse { 50% { box-shadow:0 0 0 8px rgba(14,91,115,0); } } select { max-width:250px; margin-left:6px; padding:8px 25px 8px 8px; border:1px solid var(--line); background:var(--card); } button { padding:9px 13px; border:1px solid var(--ink); background:var(--ink); color:var(--paper); cursor:pointer; } button:hover { background:var(--rust); border-color:var(--rust); }
.loading,.empty,.error { max-width:720px; margin:19vh auto; padding:28px; font-size:20px; text-align:center; }
.page { max-width:1260px; margin:0 auto; padding:66px clamp(20px,5vw,84px) 120px; }
.eyebrow { font:12px 'DM Mono',monospace; letter-spacing:.08em; color:var(--rust); text-transform:uppercase; }.hero { display:grid; grid-template-columns:minmax(0,1.4fr) minmax(230px,.6fr); gap:40px; padding-bottom:58px; border-bottom:2px solid var(--ink); }
h1 { font-weight:900; font-size:clamp(32px,4.4vw,54px); line-height:1.08; letter-spacing:-.06em; margin:13px 0 16px; max-width:850px; } .hero-summary { max-width:780px; font-size:17px; line-height:1.75; margin:0; } .meta { display:flex; flex-wrap:wrap; gap:10px; margin-top:22px; font:11px 'DM Mono',monospace; color:var(--muted); }.meta span { border:1px solid var(--line); padding:6px 8px; }
.review-card { align-self:end; border:1px solid var(--ink); background:var(--ink); color:var(--paper); padding:23px; box-shadow:7px 7px 0 var(--rust); }.review-card .label { font:11px 'DM Mono',monospace; color:var(--yellow); letter-spacing:.1em; }.review-card p { font-size:17px; line-height:1.55; margin:12px 0 17px; }.review-card small { color:#bdc5c4; line-height:1.6; }
.review-board { display:grid; grid-template-columns:190px minmax(0,1fr) 270px; gap:44px; padding-top:48px; }.rail { position:sticky; top:108px; align-self:start; }.rail::before { content:''; position:absolute; width:1px; background:var(--line); top:13px; bottom:13px; left:13px; }.rail button { position:relative; width:100%; display:flex; gap:12px; align-items:center; border:0; padding:10px 0; background:none; color:var(--muted); text-align:left; font:12px 'DM Mono',monospace; }.rail button b { width:27px; height:27px; display:grid; place-items:center; background:var(--paper); border:1px solid var(--line); color:var(--muted); font-weight:400; }.rail button.complete b { color:var(--paper); background:var(--blue); border-color:var(--blue); }.rail button.current b { color:var(--ink); background:var(--yellow); border-color:var(--yellow); }.rail button:hover { color:var(--ink); }
.timeline { min-width:0; }.step { position:relative; padding:0 0 54px 38px; scroll-margin-top:110px; }.step::before { content:counter(step); counter-increment:step; position:absolute; left:-2px; top:1px; font:700 14px 'DM Mono',monospace; color:var(--rust); }.timeline { counter-reset:step; }.step:not(:last-child)::after { content:''; position:absolute; top:28px; bottom:0; left:5px; width:1px; background:var(--line); }.step-title { display:flex; justify-content:space-between; align-items:baseline; gap:10px; border-bottom:1px solid var(--line); padding-bottom:13px; margin-bottom:16px; }.step-title h2 { margin:0; font-size:25px; letter-spacing:-.04em; }.state { font:11px 'DM Mono',monospace; color:var(--muted); }.state.complete { color:var(--blue); }.state.current { color:var(--rust); }
.artifact { background:rgba(248,245,235,.74); border:1px solid var(--line); margin:12px 0; }.artifact summary { cursor:pointer; list-style:none; padding:14px 16px; display:flex; align-items:center; justify-content:space-between; gap:15px; }.artifact summary::-webkit-details-marker { display:none; }.artifact-label { font:600 15px 'Noto Serif SC',serif; }.artifact-label::before { content:'↳'; margin-right:8px; color:var(--rust); }.artifact-hint { font:10px 'DM Mono',monospace; color:var(--muted); }.artifact[open] { box-shadow:var(--shadow); border-color:var(--ink); }.artifact-body { padding:0 18px 20px; border-top:1px solid var(--line); }.artifact-body h3 { font-size:20px; margin:20px 0 8px; }.artifact-body h4 { font-size:15px; margin:20px 0 6px; }.artifact-body p { font-size:15px; line-height:1.8; margin:6px 0; }.artifact-body .lead { font-size:18px; font-weight:600; line-height:1.6; }.field { padding:9px 0; border-bottom:1px dotted var(--line); }.field:last-child { border-bottom:0; }.field dt { font:11px 'DM Mono',monospace; color:var(--rust); }.field dd { margin:5px 0 0; line-height:1.65; }.list { margin:8px 0; padding-left:20px; }.list li { padding:4px 0; line-height:1.6; }.route-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:10px; margin:12px 0; }.route { padding:12px; background:#f0ead9; border-left:3px solid var(--blue); }.route strong { display:block; margin-bottom:4px; }.markdown { white-space:pre-wrap; font-size:15px; line-height:1.85; }.placeholder { padding:18px; color:var(--muted); font-size:14px; border:1px dashed var(--line); }
.side { position:sticky; top:108px; align-self:start; }.side-card { border-top:2px solid var(--ink); padding:15px 0 20px; margin-bottom:20px; }.side-card h3 { margin:0 0 10px; font:12px 'DM Mono',monospace; letter-spacing:.07em; }.event { margin:11px 0; padding-left:12px; border-left:2px solid var(--yellow); }.event time { display:block; font:10px 'DM Mono',monospace; color:var(--muted); margin-bottom:3px; }.event p { margin:0; font-size:13px; line-height:1.5; }.rule { padding:15px; background:var(--yellow); font-size:14px; line-height:1.65; }.rule strong { display:block; margin-bottom:4px; }
@media (max-width:940px) { .hero,.review-board { grid-template-columns:1fr; }.rail,.side { position:static; }.rail { display:flex; overflow:auto; gap:8px; }.rail::before { display:none; }.rail button { min-width:105px; }.step { padding-left:27px; }.toolbar label { display:none; } }.@media (max-width:550px) { .topbar { padding:0 16px; }.page { padding:38px 18px 80px; }.artifact-hint { display:none; }.hero { gap:25px; } }
`;

const REVIEW_JS = `
const app = document.getElementById('app');
const picker = document.getElementById('workflow-picker');
const refresh = document.getElementById('refresh');
const live = document.getElementById('live-indicator');
const titles = { fetched_topic_cards:'来源材料', topic_match:'候选评估', selected_topic:'已选点子', baseline:'核心诉求', creative_routes:'创意路线', creative_route_selection:'已选路线', creative_outline_draft:'大纲草案', creative_outline:'锁定大纲', outline_script:'大纲脚本', content_master_draft:'主稿草案', master_review:'主稿审校', content_master:'锁定主稿', spoken_script:'口播稿', recording_execution:'录制执行', requirement_set:'素材需求', preproduction_material_plan:'前期素材计划', production_plan:'制作计划', production_checkpoint:'制作验收', production_handoff:'制作交接', production_locked:'制作结果', article_document:'文章文件', preview:'预览', asset_manifest:'素材清单', vectcut_draft:'可编辑草稿', release_package_draft:'发布草案', release_package:'发布包装', competition_report:'候选竞争', human_review_packet:'人工审核摘要', decision_ledger:'决策记录' };
const labels = { coreMessage:'这篇内容想让读者相信什么', guidanceIntent:'读者看完要完成什么动作', audienceMoment:'读者正在经历什么', immediateBenefit:'读者立刻得到什么', longTermBenefit:'长期会少掉什么麻烦', beliefToChange:'希望读者改掉的旧看法', proofToShow:'必须看见什么证明', evidenceBoundary:'哪些话不能说过头', primaryCallToAction:'最后希望读者做什么', readerDecision:'读者最后要做的判断', humanCenter:'这件事和谁的真实处境有关', authorStance:'我们以什么身份说这件事', warmThread:'贯穿全文的感受', emotionalArc:'读者的理解如何推进', rationale:'为什么选它', whyThisRoute:'为什么选这条路线', centralTension:'文章抓住的矛盾', openingScene:'从哪里开场', proofMethod:'如何证明', readerShift:'希望读者理解发生什么变化', openingDirection:'开篇怎么进入', content:'这一段要说什么', sceneOrAction:'让读者看到什么场景', sectionPurpose:'这一段承担什么作用', visualAsset:'需要什么画面', avoid:'这一段不能夸大的地方', findings:'审校观察', evidenceBlockers:'还缺什么证明', constraints:'素材使用限制', materialType:'需要准备什么素材', purpose:'这个素材证明什么', capabilityGaps:'制作前还缺什么能力', title:'标题', summary:'摘要' };
let data = null;
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const human = key => labels[key] || key.replaceAll('_',' ');
const text = value => typeof value === 'string' ? value : '';
const isObj = value => value && typeof value === 'object' && !Array.isArray(value);
function keyFields(obj, keys) { return keys.filter(key => obj[key] !== undefined && obj[key] !== null).map(key => '<div class="field"><dt>'+esc(human(key))+'</dt><dd>'+renderValue(obj[key])+'</dd></div>').join(''); }
function renderValue(value) { if (Array.isArray(value)) return '<ul class="list">'+value.map(item => '<li>'+renderValue(item)+'</li>').join('')+'</ul>'; if (isObj(value)) return '<p>'+esc(value.title || value.name || value.summary || '这项信息已记录在制品中。')+'</p>'; return esc(value); }
function renderRoutes(routes) { return '<div class="route-grid">'+routes.map(route => '<div class="route"><strong>'+esc(route.name || route.id || '候选路线')+'</strong><span>'+esc(route.centralTension || route.summary || route.whyThisRoute || '')+'</span></div>').join('')+'</div>'; }
function renderOutline(value) { const outline=value.outline||value; const sections=outline.sections||[]; return '<p class="lead">'+esc(outline.openingDirection||value.creativeSpine?.creativePremise||'')+'</p><h4>文章的推进</h4>'+sections.map((section,index)=>'<div class="route"><strong>第 '+(index+1)+' 段：'+esc(section.sectionPurpose||'')+'</strong>'+keyFields(section,['sceneOrAction','content','readerShift','visualAsset','avoid'])+'</div>').join('')+'<h4>收束与行动</h4>'+keyFields(outline,['ending','primaryCallToAction','unsupportedClaims']); }
function renderMasterReview(value) { const review=value.review||{}; const groups=[['证据问题',review.evidenceBlockers],['文风与结构',review.writingStyle?.findings],['读者与证据链',review.articleEditorial?.findings],['素材可行性',review.assetEfficiencyFindings]]; return '<p class="lead">'+(review.passed?'审校通过：可以进入人工审核。':'审校发现仍会影响发布判断的问题。')+'</p>'+groups.filter(([,items])=>items?.length).map(([title,items])=>'<h4>'+title+'</h4>'+renderValue(items)).join(''); }
function renderRequirements(value) { const requirements=value.requirements||[]; return '<p class="lead">需要补齐 '+requirements.length+' 组能够证明正文判断的素材。</p>'+requirements.map((item,index)=>'<div class="route"><strong>素材 '+(index+1)+'</strong>'+keyFields(item,['materialType','constraints'])+'<div class="field"><dt>这些画面要证明什么</dt><dd>'+renderValue((item.usages||[]).map(usage=>usage.purpose).filter(Boolean))+'</dd></div></div>').join(''); }
function renderProduction(value) { const gaps=value.capabilityGaps||[]; const units=value.units||[]; return '<p class="lead">制作将按 '+units.length+' 个单元推进。</p>'+(gaps.length?'<h4>开工前要处理的缺口</h4>'+renderValue(gaps):'<p>当前没有记录额外制作能力缺口。</p>'); }
function artifactBody(artifact) { const value = artifact.content; if (typeof value === 'string') return '<div class="markdown">'+esc(value.replace(/^# .*$/m,'').trim())+'</div>'; if (!isObj(value)) return '<p>'+renderValue(value)+'</p>'; if (artifact.kind === 'baseline') { const campaign=value.campaignIntent||{}, editorial=value.articleEditorialIntent||{}; return '<p class="lead">'+esc(value.coreMessage||'')+'</p><h4>引导读者完成什么</h4>'+keyFields(value,['guidanceIntent'])+'<h4>传播判断</h4>'+keyFields(campaign,['audienceMoment','immediateBenefit','longTermBenefit','beliefToChange','proofToShow','evidenceBoundary','primaryCallToAction'])+'<h4>编辑基调</h4>'+keyFields(editorial,['readerDecision','humanCenter','authorStance','warmThread','emotionalArc']); }
 if (artifact.kind === 'creative_routes') return '<p class="lead">从候选中选出一条可证明、可推进的路线。</p>'+renderRoutes(value.routes||[]);
 if (artifact.kind === 'creative_route_selection') return '<p class="lead">'+esc(value.route?.name || '已锁定路线')+'</p>'+keyFields(value.route||value,['centralTension','openingScene','proofMethod','readerShift','whyThisRoute']);
 if (artifact.kind === 'selected_topic') return '<p class="lead">'+esc(value.topic?.title||'')+'</p>'+keyFields(value.topic||value,['source','excerpt','rationale'])+keyFields(value,['selectedMaterials']);
 if (artifact.kind === 'topic_match') return '<div class="route-grid">'+(value.candidates||[]).map(candidate => '<div class="route"><strong>'+esc(candidate.title||'候选')+'</strong><span>产品契合 '+esc(candidate.productFit||'—')+' · 话题动量 '+esc(candidate.topicMomentum||'—')+'</span><p>'+esc((candidate.rationale||[]).join('；'))+'</p></div>').join('')+'</div>';
 if (artifact.kind === 'fetched_topic_cards') return '<div class="route-grid">'+(Array.isArray(value)?value:[]).map(card => '<div class="route"><strong>'+esc(card.title||'来源')+'</strong><span>'+esc(card.excerpt||'')+'</span></div>').join('')+'</div>';
 if (artifact.kind === 'competition_report') return '<p class="lead">主推荐方案已选出。</p>'+keyFields(value,['recommendationRationale'])+renderRoutes(value.candidates||[]);
 const master=value.master||value; if ((artifact.kind==='content_master'||artifact.kind==='content_master_draft') && master.bodyMarkdown) return '<h3>'+esc(master.title||master.workingTitle||'主稿')+'</h3><div class="markdown">'+esc(master.bodyMarkdown)+'</div>';
 if (artifact.kind === 'creative_outline' || artifact.kind === 'creative_outline_draft' || artifact.kind === 'outline_script') return renderOutline(value);
 if (artifact.kind === 'master_review') return renderMasterReview(value);
 if (artifact.kind === 'requirement_set' || artifact.kind === 'preproduction_material_plan') return renderRequirements(value);
 if (artifact.kind === 'production_plan') return renderProduction(value);
 return '<p>这份制品已纳入流程记录；其中没有会改变本轮审核决定的独立内容。</p>'; }
function artifact(artifact, open=false) { return '<details class="artifact" '+(open?'open':'')+'><summary><span class="artifact-label">'+esc(titles[artifact.kind]||artifact.kind)+'</span><span class="artifact-hint">查看审稿要点</span></summary><div class="artifact-body">'+artifactBody(artifact)+'</div></details>'; }
function reviewState(review) { return review.workflow.progress?.detail || (review.reviewMode ? '等待人工审核' : '流程推进中'); }
function render(review) { data=review; const workflow=review.workflow; const progress=workflow.progress||{node:1,label:'选题与证据',detail:'等待流程同步',terminal:false}; const headline=workflow.carrier==='article'?'文章审核链路':'视频审核链路'; const rail=review.steps.map(step => '<button class="'+step.state+'" data-scroll="step-'+step.node+'"><b>'+step.node+'</b><span>'+esc(step.label)+'</span></button>').join(''); const timeline=review.steps.map(step => '<section id="step-'+step.node+'" class="step"><div class="step-title"><h2>'+esc(step.label)+'</h2><span class="state '+step.state+'">'+({complete:'已完成',current:'当前进行中',pending:'尚未开始'}[step.state])+'</span></div>'+(step.artifacts.length?step.artifacts.map((item,index)=>artifact(item,index===0)).join(''):'<div class="placeholder">此节点尚未产生可审核制品。</div>')+'</section>').join(''); const events=(review.events||[]).slice().reverse().slice(0,7).map(event => '<div class="event"><time>第 '+esc(event.revision)+' 次更新</time><p>'+esc(event.summary||'流程已更新')+'</p></div>').join('') || '<p>暂无事件记录。</p>'; app.innerHTML='<div class="page"><section class="hero"><div><div class="eyebrow">纵向审核台 · '+esc(workflow.carrier==='article'?'文章 / 推文':'视频')+'</div><h1>'+headline+'</h1><p class="hero-summary">从一个点子到可执行发布：顺着七个节点检查，这条内容是否值得进入下一步。</p><div class="meta"><span>第 '+esc(progress.node)+' / 7 步 · '+esc(progress.label)+'</span><span>'+esc(reviewState(review))+'</span><span>当前版本 r'+esc(workflow.revision)+'</span></div></div><aside class="review-card"><div class="label">CURRENT PROGRESS</div><p>'+esc(progress.detail)+'</p><small>'+ (review.reviewMode ? '前序链路已冻结，重点判断：主张是否成立、证据是否够用、素材是否真正能证明它。' : '收到新的工作流事件后，页面会自动按节点顺序刷新。') +'</small></aside></section><section class="review-board"><nav class="rail" aria-label="审核节点">'+rail+'</nav><div class="timeline">'+timeline+'</div><aside class="side"><div class="side-card"><h3>决定方式</h3><div class="rule"><strong>保留人工门禁</strong>批准、退回或拒绝必须由 Agent 经 promo_commit 绑定当前 revision 提交。</div></div><div class="side-card"><h3>近期流程</h3>'+events+'</div></aside></section></div>'; document.querySelectorAll('[data-scroll]').forEach(button=>button.addEventListener('click',()=>document.getElementById(button.dataset.scroll)?.scrollIntoView({behavior:'smooth',block:'start'}))); }
async function load(id, silent=false) { if(!silent) app.innerHTML='<div class="loading">正在读取冻结制品…</div>'; try { const response=await fetch('/api/workflows/'+encodeURIComponent(id)); if(!response.ok) throw new Error((await response.json()).error||'读取失败'); render(await response.json()); } catch(error) { if(!silent) app.innerHTML='<div class="error">'+esc(error.message||String(error))+'</div>'; } }
function fillPicker(workflows, preferred) { const selected=workflows.some(item=>item.workflowId===preferred) ? preferred : workflows[0]?.workflowId; picker.innerHTML=workflows.map(item=>'<option value="'+esc(item.workflowId)+'">'+esc(item.workflowId)+' · 第 '+esc(item.progress?.node||1)+' 步 · r'+esc(item.revision)+'</option>').join(''); if(selected) picker.value=selected; return selected; }
async function sync(silent=false) { const response=await fetch('/api/workflows'); const workflows=await response.json(); if(!workflows.length) { app.innerHTML='<div class="empty">还没有可展示的工作流。先在 Promo Workflow 创建并同步一条流程。</div>'; return; } const selected=fillPicker(workflows, picker.value || new URLSearchParams(location.search).get('workflowId')); if(selected) { history.replaceState(null,'','?workflowId='+encodeURIComponent(selected)); await load(selected,silent); } }
function connectLive() { const events=new EventSource('/api/updates'); events.addEventListener('connected',()=>{ live.textContent='实时同步'; live.className='live-indicator live'; }); events.addEventListener('workflow-change',()=>sync(true)); events.onerror=()=>{ live.textContent='定时同步'; live.className='live-indicator stale'; }; setInterval(()=>{ if(events.readyState!==EventSource.OPEN) sync(true); },15000); }
async function boot() { try { await sync(); picker.addEventListener('change',()=>{ history.replaceState(null,'','?workflowId='+encodeURIComponent(picker.value)); load(picker.value); }); refresh.addEventListener('click',()=>sync(true)); connectLive(); } catch(error) { app.innerHTML='<div class="error">'+esc(error.message||String(error))+'</div>'; } }
boot();
`;

async function main(): Promise<void> {
  const dataDirectory = resolve(process.env.PROMO_WORKFLOW_DATA_DIR ?? join(process.cwd(), "data"));
  const port = process.env.PROMO_REVIEW_PORT ? Number(process.env.PROMO_REVIEW_PORT) : 4173;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PROMO_REVIEW_PORT must be a valid port number.");
  const host = process.env.PROMO_REVIEW_HOST ?? "127.0.0.1";
  await startReviewHost({ dataDirectory, host, port });
  console.info(`Promo Review Desk: http://${host}:${port}`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  void main().catch((error) => {
    console.error("promo-workflow-review failed to start", error);
    process.exitCode = 1;
  });
}
