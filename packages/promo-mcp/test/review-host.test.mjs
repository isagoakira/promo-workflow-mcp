import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createReviewHost } from "../dist/review-host.js";

test("review host exposes only one workflow's projected longitudinal artifacts", async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), "promo-review-host-"));
  const workflowId = "wf-review";
  const workspace = join(dataDirectory, "workspace", workflowId);
  const selectionDirectory = join(workspace, "01-selection");
  await mkdir(selectionDirectory, { recursive: true });
  const selectedTopicPath = join(selectionDirectory, "selected-topic.json");
  await writeFile(selectedTopicPath, JSON.stringify({
    content: { topic: { title: "A local-first agent workflow", source: "official source" } },
  }));
  await writeFile(join(dataDirectory, "workflows.json"), JSON.stringify({
    schemaVersion: 1,
    workflows: {
      [workflowId]: {
        id: workflowId, carrier: "article", state: "AWAITING_HUMAN_REVIEW", revision: 9,
        summary: "Ready for review.", updatedAt: "2026-09-03T00:00:00.000Z", events: [],
      },
    },
  }));
  await writeFile(join(workspace, "manifest.json"), JSON.stringify({
    workflowId, carrier: "article", state: "AWAITING_HUMAN_REVIEW", revision: 9, summary: "Ready for review.",
    deliverables: [
      { artifactId: "artifact-selected", kind: "selected_topic", path: selectedTopicPath },
      { artifactId: "artifact-foreign", kind: "baseline", path: join(dataDirectory, "outside.json") },
    ],
  }));

  const server = createReviewHost({ dataDirectory });
  await new Promise((resolveListening) => server.listen(0, "127.0.0.1", resolveListening));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const origin = `http://127.0.0.1:${address.port}`;
    const list = await (await fetch(`${origin}/api/workflows`)).json();
    assert.equal(list.length, 1);
    assert.equal(list[0].workflowId, workflowId);

    const review = await (await fetch(`${origin}/api/workflows/${workflowId}`)).json();
    assert.equal(review.steps[0].artifacts[0].kind, "selected_topic");
    assert.equal(review.steps[0].artifacts[0].content.topic.title, "A local-first agent workflow");
    assert.equal(review.steps[1].artifacts.length, 0);
    assert.equal(review.workflow.progress.node, 5);
    assert.equal(review.steps[4].state, "current");

    const controller = new AbortController();
    const updates = await fetch(`${origin}/api/updates`, { signal: controller.signal });
    const reader = updates.body.getReader();
    const firstChunk = await reader.read();
    assert.match(new TextDecoder().decode(firstChunk.value), /event: connected/);
    await writeFile(join(dataDirectory, "workflows.json"), JSON.stringify({
      schemaVersion: 1,
      workflows: {
        [workflowId]: {
          id: workflowId, carrier: "article", state: "AWAITING_HUMAN_REVIEW", revision: 10,
          summary: "Updated for the live view.", updatedAt: "2026-09-03T00:01:00.000Z", events: [],
        },
      },
    }));
    const changedChunk = await Promise.race([
      reader.read(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("review host did not emit a workflow-change event")), 2000)),
    ]);
    assert.match(new TextDecoder().decode(changedChunk.value), /event: workflow-change/);
    controller.abort();
    reader.releaseLock();
  } finally {
    await new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
  }
});
