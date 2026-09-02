import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { ArtifactStore } from "./artifacts/store.js";
import type { ArtifactKind, ArtifactRef } from "./artifacts/types.js";

export interface WorkspaceDeliverableRef {
  artifactId: string;
  kind: ArtifactKind;
  path: string;
  versionPath: string;
}

export interface SyncWorkflowWorkspaceInput {
  workflowId: string;
  carrier: "video" | "article";
  state: string;
  revision: number;
  summary: string;
  artifactRefs: readonly ArtifactRef[];
}

/**
 * Projects immutable internal artifacts into stable, human-readable workspace
 * paths. Agents can load the current file by name; the version file preserves
 * the exact revision that produced it.
 */
export class WorkspaceDeliverables {
  constructor(private readonly directory: string, private readonly artifacts: ArtifactStore) {}

  async sync(input: SyncWorkflowWorkspaceInput): Promise<WorkspaceDeliverableRef[]> {
    const root = join(this.directory, input.workflowId);
    const byKind = new Map<ArtifactKind, ArtifactRef>();
    for (const artifact of input.artifactRefs) byKind.set(artifact.kind, artifact);

    const deliverables: WorkspaceDeliverableRef[] = [];
    for (const artifact of byKind.values()) {
      const placement = placementFor(artifact.kind);
      if (!placement) continue;
      const record = await this.artifacts.read(artifact.artifactId);
      const markdown = artifact.kind === "human_review_packet";
      const currentPath = markdown
        ? join(root, "00-control", "current-review.md")
        : join(root, placement.node, `${placement.name}.json`);
      const versionPath = markdown
        ? join(root, "00-control", "reviews", `pre-production-r${input.revision}.${artifact.artifactId}.md`)
        : join(root, placement.node, `${placement.name}.${artifact.artifactId}.json`);
      const body = markdown
        ? reviewMarkdown(record.content)
        : JSON.stringify({
          workflowId: input.workflowId,
          carrier: input.carrier,
          state: input.state,
          workflowRevision: input.revision,
          artifact,
          content: record.content,
        }, null, 2) + "\n";
      await atomicWrite(currentPath, body);
      await writeOnce(versionPath, body);
      deliverables.push({
        artifactId: artifact.artifactId,
        kind: artifact.kind,
        path: currentPath,
        versionPath,
      });
    }

    const manifest = {
      workflowId: input.workflowId,
      carrier: input.carrier,
      state: input.state,
      revision: input.revision,
      summary: input.summary,
      deliverables,
    };
    await atomicWrite(join(root, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    return deliverables;
  }
}

function placementFor(kind: ArtifactKind): { node: string; name: string } | null {
  switch (kind) {
    case "fetched_topic_cards": return { node: "01-selection", name: "fetched-topic-cards" };
    case "topic_match": return { node: "01-selection", name: "topic-matching" };
    case "selected_topic": return { node: "01-selection", name: "selected-topic" };
    case "baseline": return { node: "02-campaign-intent", name: "campaign-intent" };
    case "decision_ledger": return { node: "00-control", name: "decision-ledger" };
    case "human_review_packet": return { node: "00-control", name: "current-review" };
    case "competition_report": return { node: "00-control", name: "competition-report" };
    case "creative_routes": return { node: "03-creative-outline", name: "creative-routes" };
    case "creative_route_selection": return { node: "03-creative-outline", name: "selected-route" };
    case "creative_outline_draft": return { node: "03-creative-outline", name: "outline-draft" };
    case "creative_outline": return { node: "03-creative-outline", name: "locked-outline" };
    case "outline_script": return { node: "03-creative-outline", name: "outline-script" };
    case "content_master_draft": return { node: "04-master", name: "master-draft" };
    case "master_review": return { node: "04-master", name: "master-review" };
    case "content_master": return { node: "04-master", name: "locked-master" };
    case "spoken_script": return { node: "04-master", name: "spoken-script" };
    case "recording_execution": return { node: "04-master", name: "recording-execution" };
    case "requirement_set": return { node: "05-requirements", name: "material-requirements" };
    case "preproduction_material_plan": return { node: "05-requirements", name: "preproduction-material-plan" };
    case "production_plan": return { node: "06-production", name: "production-plan" };
    case "production_checkpoint": return { node: "06-production", name: "production-checkpoint" };
    case "production_handoff": return { node: "06-production", name: "backend-handoff" };
    case "production_locked": return { node: "06-production", name: "production-result" };
    case "article_document": return { node: "06-production", name: "article-document" };
    case "preview": return { node: "06-production", name: "preview" };
    case "asset_manifest": return { node: "06-production", name: "asset-manifest" };
    case "vectcut_draft": return { node: "06-production", name: "vectcut-draft" };
    case "release_package_draft": return { node: "07-release", name: "release-draft" };
    case "release_package": return { node: "07-release", name: "release-package" };
    case "asset_plan":
    case "subtitle":
      return null;
  }
}

function reviewMarkdown(content: unknown): string {
  if (typeof content === "object" && content !== null && typeof (content as { markdown?: unknown }).markdown === "string") {
    return (content as { markdown: string }).markdown;
  }
  throw new Error("Human review packet must contain rendered markdown.");
}

async function atomicWrite(path: string, body: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, body, "utf8");
  await rename(temporaryPath, path);
}

async function writeOnce(path: string, body: string): Promise<void> {
  try {
    await readFile(path, "utf8");
  } catch {
    await atomicWrite(path, body);
  }
}
