import { resolve, join } from "node:path";
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import {
  JsonWorkflowStore,
  ArtifactStore,
  WorkspaceDeliverables,
  VectCutHttpBridge,
  WorkflowService,
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
  "answer_master_grill",
  "lock_master",
  "update_production_units",
  "lock_production",
  "submit_release_package",
  "select_release_package",
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

export function createPromoServer(service: WorkflowService) {
  const server = new McpServer({
    name: "promo-workflow",
    version: "0.1.0",
  });

  server.registerTool(
    "promo_get",
    {
      title: "查看宣传工作流",
      description: "读取一个工作流，或列出本地全部宣传工作流及其当前节点。",
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
            ? await service.get(workflowId)
            : { workflows: await service.list() },
        );
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
        return response(
          await service.run({ workflowId, expectedRevision, idempotencyKey }),
        );
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
        "创建工作流，或写入一个经过用户确认的选材、基调、大纲、主稿、制作或发布包决策。",
      inputSchema: {
        kind: z.enum(commitKinds),
        workflowId: z.string().min(1).optional(),
        carrier: z.enum(carriers).optional(),
        expectedRevision: z.number().int().positive().optional(),
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
          return response(
            await service.create({
              carrier: input.carrier as WorkflowCarrier,
              summary: input.summary,
              context: input.context,
              idempotencyKey: input.idempotencyKey,
            }),
          );
        }

        if (!input.workflowId || !input.expectedRevision) {
          throw new Error("除 create_workflow 外，提交决策需要 workflowId 和 expectedRevision。");
        }

        return response(
          await service.commit({
            workflowId: input.workflowId,
            expectedRevision: input.expectedRevision,
            kind: input.kind as CommitKind,
            summary: input.summary,
            context: input.context,
            idempotencyKey: input.idempotencyKey,
          }),
        );
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
  const server = createPromoServer(new WorkflowService(store, artifacts, undefined, undefined, vectCutBridge, workspace));
  await server.connect(new StdioServerTransport());
}

void main().catch((error) => {
  console.error("promo-workflow-mcp failed to start", error);
  process.exitCode = 1;
});
