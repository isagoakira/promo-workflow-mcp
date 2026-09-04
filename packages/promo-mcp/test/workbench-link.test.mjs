import assert from "node:assert/strict";
import test from "node:test";

import { workbenchFor } from "../dist/workbench.js";

test("workbench link exposes a workflow-scoped, read-only monitoring surface", () => {
  const workbench = workbenchFor("http://127.0.0.1:4173", "wf-123");

  assert.equal(workbench.url, "http://127.0.0.1:4173/?workflowId=wf-123");
  assert.equal(workbench.workflowId, "wf-123");
  assert.match(workbench.role, /只读监控/);
  assert.match(workbench.agentAction, /主动向用户展示/);
});

test("workbench link reports a recoverable startup gap", () => {
  const workbench = workbenchFor(undefined, "wf-123");

  assert.equal(workbench.url, null);
  assert.match(workbench.agentAction, /promo_review/);
});
