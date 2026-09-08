import { resolve, join } from "node:path";
import { realpath } from 'node:fs/promises';
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { discoverAdapterStatus, type ProductionAdapterStatus } from "./adapter-registry.js";
import { startReviewHost } from "./review-host.js";
import { ProjectRegistry, defaultRegistryPath } from './project-registry.js';
import { reviewUrlFor, workbenchFor, type PromoWorkbenchLink } from "./workbench.js";
import {
  JsonWorkflowStore,
  ArtifactStore,
  WorkspaceDeliverables,
  CutWorkbenchStdioBridge,
  VectCutHttpBridge,
  WorkflowService,
  GUIDANCE_IDS,
  EDITORIAL_ISSUE_CODES,
  type CommitKind,
  type WorkflowCarrier,
} from "@promo-workflow/service";

const commitKinds = [
  "create_workflow",
  "submit_fetched_topics",
  "select_topic",
  "propose_baseline",
  "answer_baseline_grill",
  "lock_baseline",
  "propose_creative_routes",
  "select_creative_route",
  "submit_outline_draft",
  "answer_outline_grill",
  "lock_outline",
  "submit_master_draft",
  "submit_requirement_details",
  "reply_annotations",
  "request_text_revision",
  "answer_master_grill",
  "lock_master",
  "update_production_units",
  "lock_production",
  "submit_release_package",
  "select_release_package",
  "confirm_workspace",
  "submit_workspace_progress_audit",
  "confirm_start_position",
  "answer_workspace_grill",
  "submit_human_review",
  "submit_competition_report",
  "save_note",
] as const;

const carriers = ["video", "article"] as const;

function response(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload as Record<string, unknown>,
  };
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

export interface PromoRuntimeStatus {
  adapterStatus: readonly ProductionAdapterStatus[];
  reviewUrl?: string | undefined;
  registry?: ProjectRegistry;
  serviceForDataDirectory?: (directory: string) => WorkflowService;
}

export function createPromoServer(service: WorkflowService, runtime: PromoRuntimeStatus = { adapterStatus: [] }) {
  const scoped = async (workflowId: string) => runtime.registry && runtime.serviceForDataDirectory
    ? runtime.serviceForDataDirectory(await runtime.registry.locate(workflowId)) : service;
  const listed = async () => {
    if (!runtime.registry || !runtime.serviceForDataDirectory) return service.list();
    const locations = await runtime.registry.locations();
    const result = [];
    for (const directory of new Set([...locations.values()].filter(paths => paths.length === 1).map(paths => paths[0]!))) {
      result.push(...(await runtime.serviceForDataDirectory(directory).list()).filter(w => locations.get(w.workflowId)?.length === 1 && locations.get(w.workflowId)?.[0] === directory));
    }
    return result;
  };
  const server = new McpServer({
    name: "promo-workflow",
    version: "0.1.0",
  });

  server.registerTool('promo_register_project', {
    title: '登记已有工作区工程', description: '按工作区绝对路径登记已有 Promo 工程。自动检查固定的数据位置，找不到时指定原 dataDirectory。不复制素材、不重建流程、不批准节点。',
    inputSchema: { rootDirectory: z.string().min(1), dataDirectory: z.string().min(1).optional() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ rootDirectory, dataDirectory }) => { try {
    if (!runtime.registry) throw new Error('当前运行实例未启用工程名册。');
    const project = await runtime.registry.register(rootDirectory, dataDirectory);
    return response({ project, check: (await runtime.registry.scan()).projects.find(p => p.projectId === project.projectId) });
  } catch(e) { return errorResponse(e); } });
  server.registerTool('promo_projects', {
    title: '检查所有已登记工程', description: '重新读取已登记工作区的实际进度、制作轮次及交付物记录可用性。工程离线或损坏会单独列出；不推进流程，也不把文件存在当作质量验收。',
    inputSchema: {}, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async () => { try {
    if (!runtime.registry) throw new Error('当前运行实例未启用工程名册。');
    return response(await runtime.registry.scan());
  } catch(e) { return errorResponse(e); } });

  server.registerTool("promo_text_review", {
    title: "读取文字批注和版本原文",
    description: "读取本流程完整文字版本、自由选区批注及逐条处理回执。配合 promo_get.reviewFeedback；读取不关闭批注。",
    inputSchema: { workflowId: z.string().min(1) },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ workflowId }) => { try { return response(await (await scoped(workflowId)).textReview(workflowId)); } catch(error) { return errorResponse(error); } });

  server.registerTool("promo_video_review", {
    title: "读取视频版本与时空批注",
    description: "读取确切审片视频版本、毫秒时间点/多段/归一化框选批注和处理状态。旧版位置不得隐式应用到新版。",
    inputSchema: { workflowId: z.string().min(1) },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ workflowId }) => { try { return response(await (await scoped(workflowId)).videoReview(workflowId)); } catch(error) { return errorResponse(error); } });

  server.registerTool('promo_video_production', {
    title: '读取第六节点制作现场', description: '读取常驻制作记录、当前阶段、子任务、返工历史和验收清单。先读取再操作，不越过人工确认。',
    inputSchema: { workflowId: z.string().min(1) },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ workflowId }) => { try { return response(await (await scoped(workflowId)).videoProduction(workflowId)); } catch(e) { return errorResponse(e); } });
  server.registerTool('promo_video_production_update', {
    title: '更新制作子任务或提交审片', description: '开始制作、更新当前阶段子任务、提交确切版本或返工到已到达阶段。人工确认、返回策划和恢复由工作台执行。完成任务须给本流程证据制品ID。',
    inputSchema: { workflowId: z.string().min(1), expectedRevision: z.number().int(), idempotencyKey: z.string().min(1), action: z.enum(['start','task','submit','rework']), reason: z.string().min(1), taskId: z.string().optional(), title: z.string().optional(), owner: z.enum(['user','cutbench','promo']).optional(), status: z.enum(['todo','doing','blocked','done']).optional(), artifactIds: z.array(z.string()).optional(), previewId: z.string().optional(), phase: z.enum(['materials','rough_cut','audio','fine_cut','subtitles','delivery']).optional() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async input => { try { return response(await (await scoped(input.workflowId)).updateVideoProduction(input)); } catch(e) { return errorResponse(e); } });

  server.registerTool("promo_video_address", {
    title: "提交视频批注修改回执",
    description: "将一条待处理视频批注关联到已注册的新审片版，附上修改说明和新位置。仅标记已修改待人工复核，不代替用户确认。",
    inputSchema: { workflowId: z.string().min(1), expectedRevision: z.number().int().nonnegative(), annotationId: z.string().min(1), expectedAnnotationRevision: z.number().int().positive(), targetPreviewId: z.string().min(1), reply: z.string().min(1), idempotencyKey: z.string().min(1) },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async input => { try { return response(await (await scoped(input.workflowId)).videoAnnotate({ ...input, action: "address", actor: "agent" })); } catch(error) { return errorResponse(error); } });

  server.registerTool(
    "promo_get",
    {
      title: "查看宣传工作流与工作台",
      description: "读取工作流、当前有效要求和 reviewFeedback 待处理文字批注。每轮先处理批注（用户明确暂停修改除外），再执行节点动作；返回工作台链接。",
      inputSchema: {
        workflowId: z.string().min(1).optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ workflowId }) => {
      try {
        return response(
          workflowId
            ? withRuntime(await (await scoped(workflowId)).get(workflowId), runtime, workflowId)
            : {
              workflows: await listed(),
              projects: runtime.registry ? await runtime.registry.scan() : undefined,
              adapterStatus: runtime.adapterStatus,
              reviewUrl: runtime.reviewUrl,
              workbench: workbenchFor(runtime.reviewUrl),
            },
        );
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  server.registerTool(
    "promo_review",
    {
      title: "打开宣传工作流工作台",
      description: "返回工作台直达地址，展示七节点、制品、待办、文字批注和版本历史；正文只读，批注不替代人工门禁。",
      inputSchema: {
        workflowId: z.string().min(1).optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ workflowId }) => {
      if (!runtime.reviewUrl) return errorResponse(new Error("本地审核台未启动。请运行 npm run review，或检查 PROMO_REVIEW_PORT。"));
      return response({
        workbench: workbenchFor(runtime.reviewUrl, workflowId),
        note: "页面随流程状态和制品自动刷新。它负责看见进度与证据；批准、退回和拒绝仍必须通过 promo_commit 提交。",
      });
    },
  );

  server.registerTool(
    "promo_guidance",
    {
      title: "加载当前节点指导",
      description: "读取当前 agentWork 所声明的 MCP 内置完整指导。promo_get 只返回简短 policy 概览；开始创意、写作或分镜前按其中的 router 调用本工具。高优先级指导会自动前置并随请求加载。",
      inputSchema: {
        workflowId: z.string().min(1),
        guideIds: z.array(z.enum(GUIDANCE_IDS)).min(1).optional(),
        issueCodes: z.array(z.enum(EDITORIAL_ISSUE_CODES)).max(6).optional().describe("固定阅读检查发现的问题码。首次检查不要传；修复阶段只传实际发现的问题。"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ workflowId, guideIds, issueCodes }) => {
      try {
        return response(await (await scoped(workflowId)).guidance(workflowId, guideIds, issueCodes));
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  server.registerTool(
    "promo_run",
    {
      title: "推进宣传工作流",
      description: "执行当前节点的自动部分，并停在下一项需要人工确认的动作前。",
      inputSchema: {
        workflowId: z.string().min(1),
        expectedRevision: z.number().int().positive(),
        idempotencyKey: z.string().min(1).max(128),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ workflowId, expectedRevision, idempotencyKey }) => {
      try {
        return response(withRuntime(
          await (await scoped(workflowId)).run({ workflowId, expectedRevision, idempotencyKey }),
          runtime,
          workflowId,
        ));
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  server.registerTool(
    "promo_commit",
    {
      title: "确认宣传工作流决策",
      description:
        "创建或复用以根目录和视频/推文载体区分的工作流，或写入一个经过用户确认的选材、基调、大纲、主稿、制作或发布包决策。",
      inputSchema: {
        kind: z.enum(commitKinds),
        workflowId: z.string().min(1).optional(),
        carrier: z.enum(carriers).optional(),
        displayName: z.string().min(1).max(120).optional().describe("由 Agent 写的一句稳定工作流名称，供工作台展示；不使用工作流 ID。"),
        rootDirectory: z.string().min(1).max(4096).optional().describe("该宣传项目的根目录。同一根目录最多复用一个视频和一个推文工作流。"),
        expectedRevision: z.number().int().positive().optional(),
        startAtNode: z.number().int().min(1).max(7).optional(),
        summary: z.string().min(1).max(4000),
        context: z.record(z.string(), z.unknown()).default({}),
        idempotencyKey: z.string().min(1).max(128),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      try {
        if (input.kind === "create_workflow") {
          if (!input.carrier) {
            throw new Error("创建工作流需要 carrier：video 或 article。");
          }
          const requestedRoot = input.rootDirectory ?? (typeof input.context.rootDirectory === 'string' ? input.context.rootDirectory : undefined);
          const root = requestedRoot ? await realpath(requestedRoot).catch(() => resolve(requestedRoot)) : undefined;
          const registered = root && runtime.registry ? (await runtime.registry.entries()).find(p => p.rootDirectory === root) : undefined;
          const target = registered && runtime.serviceForDataDirectory ? runtime.serviceForDataDirectory(registered.dataDirectory) : service;
          let creationRoot = requestedRoot;
          if (registered && runtime.registry) {
            for (const record of await runtime.registry.records(registered.dataDirectory)) {
              const savedRoot = record.rootDirectory ?? record.context?.rootDirectory;
              if (typeof savedRoot === 'string' && await realpath(savedRoot).catch(() => resolve(savedRoot)) === root) { creationRoot = savedRoot; break; }
            }
          }
          const snapshot = await target.create({
              carrier: input.carrier as WorkflowCarrier,
              summary: input.summary,
              displayName: input.displayName,
              rootDirectory: creationRoot,
              context: input.context,
              startAtNode: input.startAtNode,
              idempotencyKey: input.idempotencyKey,
            });
          const registrationIssues = runtime.registry ? await runtime.registry.discoverCurrent().catch(e => [`流程已保存，但工程登记失败：${(e as Error).message}`]) : [];
          return response({ ...withRuntime(snapshot, runtime, snapshot.workflowId), registrationIssues });
        }

        if (!input.workflowId || !input.expectedRevision) {
          throw new Error("除 create_workflow 外，提交决策需要 workflowId 和 expectedRevision。");
        }

        return response(withRuntime(
          await (await scoped(input.workflowId)).commit({
            workflowId: input.workflowId,
            expectedRevision: input.expectedRevision,
            kind: input.kind as CommitKind,
            summary: input.summary,
            context: input.context,
            idempotencyKey: input.idempotencyKey,
          }),
          runtime,
          input.workflowId,
        ));
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  return server;
}

async function main() {
  const dataDir = resolve(process.env.PROMO_WORKFLOW_DATA_DIR ?? join(process.cwd(), "data"));
  const store = new JsonWorkflowStore(join(dataDir, "workflows.json"));
  const artifacts = new ArtifactStore(join(dataDir, "artifacts"));
  const workspace = new WorkspaceDeliverables(join(dataDir, "workspace"), artifacts);
  const vectCutBridge = process.env.PROMO_VECTCUT_BASE_URL
    ? new VectCutHttpBridge({ baseUrl: process.env.PROMO_VECTCUT_BASE_URL })
    : undefined;
  const cutWorkbenchBridge = CutWorkbenchStdioBridge.fromEnvironment();
  const adapterStatus = discoverAdapterStatus();
  const registry = new ProjectRegistry(defaultRegistryPath(), dataDir);
  const registrationIssues = await registry.discoverCurrent();
  const startupCheck = await registry.scan();
  console.error(`工程检查：${startupCheck.projects.length} 个已登记工程，${startupCheck.projects.filter(p => p.status !== 'ready').length} 个需要检查。`);
  for (const issue of registrationIssues) console.error(`工程登记提示：${issue}`);
  const serviceForDataDirectory = (directory: string) => {
    const sourceArtifacts = new ArtifactStore(join(directory, 'artifacts'));
    return new WorkflowService(new JsonWorkflowStore(join(directory, 'workflows.json')), sourceArtifacts, undefined, cutWorkbenchBridge, vectCutBridge, new WorkspaceDeliverables(join(directory, 'workspace'), sourceArtifacts));
  };
  const reviewHost = process.env.PROMO_REVIEW_HOST ?? "127.0.0.1";
  const reviewPort = process.env.PROMO_REVIEW_PORT ? Number(process.env.PROMO_REVIEW_PORT) : 4173;
  let reviewUrl: string | undefined;
  if (process.env.PROMO_REVIEW_AUTO_START !== "false") {
    if (!Number.isInteger(reviewPort) || reviewPort < 1 || reviewPort > 65535) {
      throw new Error("PROMO_REVIEW_PORT must be a valid port number.");
    }
    reviewUrl = `http://${reviewHost}:${reviewPort}`;
    try {
      await startReviewHost({ dataDirectory: dataDir, host: reviewHost, port: reviewPort, registry });
      console.error(`Promo 工作台已启动：${reviewUrl}`);
    } catch (error) {
      const code = typeof error === "object" && error !== null ? (error as NodeJS.ErrnoException).code : undefined;
      if (code !== "EADDRINUSE") throw error;
      console.error(`Promo Review Desk already uses ${reviewUrl}; reusing the existing local host.`);
    }
  }
  const server = createPromoServer(
    new WorkflowService(store, artifacts, undefined, cutWorkbenchBridge, vectCutBridge, workspace),
    { adapterStatus, reviewUrl, registry, serviceForDataDirectory },
  );
  await server.connect(new StdioServerTransport());
}

function withRuntime<T extends object>(snapshot: T, runtime: PromoRuntimeStatus, workflowId: string): T & {
  adapterStatus: readonly ProductionAdapterStatus[];
  reviewUrl: string | undefined;
  workbench: PromoWorkbenchLink;
} {
  return {
    ...snapshot,
    adapterStatus: runtime.adapterStatus,
    reviewUrl: reviewUrlFor(runtime.reviewUrl, workflowId),
    workbench: workbenchFor(runtime.reviewUrl, workflowId),
  };
}

void main().catch((error) => {
  console.error("promo-workflow-mcp failed to start", error);
  process.exitCode = 1;
});
