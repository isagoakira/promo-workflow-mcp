import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { ArtifactStore, JsonWorkflowStore, WorkflowService, WorkspaceDeliverables } from "../dist/index.js";

test("one root reuses its video or tweet workflow while allowing the other carrier", async () => {
  const directory = await mkdtemp(join(tmpdir(), "promo-workflow-identity-"));
  const artifacts = new ArtifactStore(join(directory, "artifacts"));
  const service = new WorkflowService(
    new JsonWorkflowStore(join(directory, "workflows.json")),
    artifacts,
    undefined,
    undefined,
    undefined,
    new WorkspaceDeliverables(join(directory, "workspace"), artifacts),
  );
  const rootDirectory = join(directory, "project-a");
  const create = (carrier, displayName, idempotencyKey, root = rootDirectory) => service.create({
    carrier,
    displayName,
    rootDirectory: root,
    summary: "Agent created this workflow.",
    context: {},
    idempotencyKey,
  });

  const video = await create("video", "发布会演示视频", "video-a");
  const article = await create("article", "发布会拆解推文", "article-a");
  const reusedVideo = await create("video", "不应覆盖原名称", "video-a-repeat");
  const otherVideo = await create("video", "另一项目视频", "video-b", join(directory, "project-b"));

  assert.equal(video.displayName, "发布会演示视频");
  assert.equal(video.rootDirectory, resolve(rootDirectory));
  assert.equal(article.reused, undefined);
  assert.equal(article.workflowId === video.workflowId, false);
  assert.equal(reusedVideo.workflowId, video.workflowId);
  assert.equal(reusedVideo.reused, true);
  assert.equal(reusedVideo.displayName, "发布会演示视频");
  assert.equal(otherVideo.workflowId === video.workflowId, false);
});
