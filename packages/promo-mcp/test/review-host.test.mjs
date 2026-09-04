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
  const campaignIntentDirectory = join(workspace, "02-campaign-intent");
  await mkdir(selectionDirectory, { recursive: true });
  await mkdir(campaignIntentDirectory, { recursive: true });
  const selectedTopicPath = join(selectionDirectory, "selected-topic.json");
  const baselineDraftPath = join(campaignIntentDirectory, "campaign-intent-draft.json");
  await writeFile(selectedTopicPath, JSON.stringify({
    content: { topic: { title: "A local-first agent workflow", source: "official source" } },
  }));
  await writeFile(baselineDraftPath, JSON.stringify({
    content: {
      coreMessage: "A visible draft can be reviewed before it is locked.",
      guidanceIntent: "Choose the reader scene before locking the intent.",
      campaignIntent: { audienceMoment: "A builder opens a fresh session." },
    },
  }));
  await writeFile(join(dataDirectory, "workflows.json"), JSON.stringify({
    schemaVersion: 1,
    workflows: {
      [workflowId]: {
        id: workflowId, carrier: "article", state: "AWAITING_HUMAN_REVIEW", revision: 9,
        displayName: "本地 Agent 工作流推文", rootDirectory: "/projects/local-agent",
        summary: "Ready for review.", updatedAt: "2026-09-03T00:00:00.000Z", events: [],
      },
    },
  }));
  await writeFile(join(workspace, "manifest.json"), JSON.stringify({
    workflowId, carrier: "article", state: "AWAITING_HUMAN_REVIEW", revision: 9, summary: "Ready for review.",
    deliverables: [
      { artifactId: "artifact-selected", kind: "selected_topic", path: selectedTopicPath },
      { artifactId: "artifact-baseline-draft", kind: "baseline_draft", path: baselineDraftPath },
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
    assert.equal(list[0].displayName, "本地 Agent 工作流推文");
    assert.equal(list[0].rootDirectory, "/projects/local-agent");

    const review = await (await fetch(`${origin}/api/workflows/${workflowId}`)).json();
    assert.equal(review.steps[0].artifacts[0].kind, "selected_topic");
    assert.equal(review.steps[0].artifacts[0].content.topic.title, "A local-first agent workflow");
    assert.equal(review.steps[1].artifacts.length, 1);
    assert.equal(review.steps[1].artifacts[0].kind, "baseline_draft");
    assert.equal(review.steps[1].artifacts[0].content.coreMessage, "A visible draft can be reviewed before it is locked.");
    assert.equal(review.workflow.progress.node, 5);
    assert.equal(review.workflow.displayName, "本地 Agent 工作流推文");
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

test("review host exposes the current agent brief when a node has no draft artifact yet", async () => {
  const cases = [
    ["FETCHING", 1, "topic_fetch"],
    ["ALIGNING_BASELINE", 2, "baseline_alignment"],
    ["ALIGNING_OUTLINE", 3, "creative_outline"],
    ["ALIGNING_MASTER", 4, "master_development"],
    ["PRODUCING", 6, "production"],
    ["PACKAGING", 7, "release_packaging"],
  ];

  for (const [state, node, stage] of cases) {
    const dataDirectory = await mkdtemp(join(tmpdir(), "promo-review-brief-"));
    const workflowId = `wf-${node}`;
    const workspace = join(dataDirectory, "workspace", workflowId);
    await mkdir(workspace, { recursive: true });
    await writeFile(join(dataDirectory, "workflows.json"), JSON.stringify({
      schemaVersion: 1,
      workflows: {
        [workflowId]: {
          id: workflowId, carrier: "article", state, revision: node,
          displayName: `Node ${node}`, rootDirectory: `/projects/node-${node}`,
          summary: "Waiting for the agent deliverable.", updatedAt: "2026-09-05T00:00:00.000Z", events: [],
          context: {
            agentWork: {
              taskId: `task-${node}`,
              stage,
              inputs: { lockedUpstream: `node-${node - 1}` },
              constraints: ["Preserve the locked proposition."],
              requestedOutput: { description: "Return the complete reviewable draft.", fields: ["draft", "review"] },
              validationRules: ["Submit through the declared next commit."],
              nextCommitKind: "submit_draft",
            },
          },
        },
      },
    }));
    await writeFile(join(workspace, "manifest.json"), JSON.stringify({
      workflowId, carrier: "article", state, revision: node,
      summary: "Waiting for the agent deliverable.", deliverables: [],
    }));

    const server = createReviewHost({ dataDirectory });
    await new Promise((resolveListening) => server.listen(0, "127.0.0.1", resolveListening));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== "string");
      const review = await (await fetch(`http://127.0.0.1:${address.port}/api/workflows/${workflowId}`)).json();
      assert.equal(review.steps[node - 1].artifacts.length, 1, `${state} should not render an empty current node`);
      assert.equal(review.steps[node - 1].artifacts[0].kind, "agent_work_brief");
      assert.equal(review.steps[node - 1].artifacts[0].content.stage, stage);
      assert.equal(review.steps[node - 1].artifacts[0].content.inputs, undefined, "brief must not duplicate large upstream inputs");
    } finally {
      await new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
    }
  }
});

test("review host hides superseded drafts when the locked deliverable is available", async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), "promo-review-dedupe-"));
  const workflowId = "wf-dedupe";
  const workspace = join(dataDirectory, "workspace", workflowId);
  const campaignIntentDirectory = join(workspace, "02-campaign-intent");
  await mkdir(campaignIntentDirectory, { recursive: true });
  const draftPath = join(campaignIntentDirectory, "campaign-intent-draft.json");
  const lockedPath = join(campaignIntentDirectory, "campaign-intent.json");
  const sharedContent = { coreMessage: "Keep one visible version after lock.", guidanceIntent: "Review the locked intent." };
  await writeFile(draftPath, JSON.stringify({ content: sharedContent }));
  await writeFile(lockedPath, JSON.stringify({ content: sharedContent }));
  await writeFile(join(dataDirectory, "workflows.json"), JSON.stringify({
    schemaVersion: 1,
    workflows: {
      [workflowId]: {
        id: workflowId, carrier: "article", state: "BASELINE_LOCKED", revision: 4,
        displayName: "Deduplicated workflow", rootDirectory: "/projects/dedupe",
        summary: "Baseline locked.", updatedAt: "2026-09-05T00:00:00.000Z", events: [], context: {},
      },
    },
  }));
  await writeFile(join(workspace, "manifest.json"), JSON.stringify({
    workflowId, carrier: "article", state: "BASELINE_LOCKED", revision: 4, summary: "Baseline locked.",
    deliverables: [
      { artifactId: "artifact-draft", kind: "baseline_draft", path: draftPath },
      { artifactId: "artifact-locked", kind: "baseline", path: lockedPath },
    ],
  }));

  const server = createReviewHost({ dataDirectory });
  await new Promise((resolveListening) => server.listen(0, "127.0.0.1", resolveListening));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const review = await (await fetch(`http://127.0.0.1:${address.port}/api/workflows/${workflowId}`)).json();
    assert.deepEqual(review.steps[1].artifacts.map((artifact) => artifact.kind), ["baseline"]);
  } finally {
    await new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
  }
});
