import assert from "node:assert/strict";
import test from "node:test";

import { validateEditorialLoop } from "../dist/index.js";

const checkIds = ["paragraph_contribution", "adjacency_basis", "narrative_claims", "objection_targets", "reader_prerequisites"];
const check = (id, status, evidenceQuotes, issueCodes = []) => ({ id, status, evidence: `${id} evidence`, evidenceQuotes, issueCodes });
const base = { artifactId: "artifact-old", master: { carrier: "article", bodyMarkdown: "旧稿用一句没有对象的反驳来显得锋利。" } };
const current = { carrier: "article", bodyMarkdown: "新版直接说明产品行为和原因。" };

function review() {
  return {
    passed: true,
    editorialDiagnostic: {
      scope: "fixed-reading-checks",
      judgment: {
        baseArtifactId: base.artifactId,
        checks: checkIds.map((id) => id === "objection_targets"
          ? check(id, "issue", ["没有对象的反驳"], ["adversarial_wording"])
          : check(id, "clear", ["旧稿"])),
        triggeredIssueCodes: ["adversarial_wording"],
      },
      repairs: [{
        issueCode: "adversarial_wording",
        guidanceResourceId: "sentence-naturalness-repair",
        changedLocations: ["开头第一段"],
        beforeEvidence: ["没有对象的反驳"],
        afterEvidence: ["直接说明产品行为和原因"],
      }],
      recheck: {
        checks: checkIds.map((id) => check(id, "clear", ["新版"])),
        unresolvedIssueCodes: [],
      },
    },
  };
}

test("editorial pass requires a complete judgment-repair-recheck loop with evidence from both versions", () => {
  assert.doesNotThrow(() => validateEditorialLoop(review(), current, base));

  const missingRepair = review();
  missingRepair.editorialDiagnostic.repairs = [];
  assert.throws(() => validateEditorialLoop(missingRepair, current, base), /repair every triggered issue/);

  const unresolved = review();
  unresolved.editorialDiagnostic.recheck.checks[3] = check("objection_targets", "issue", ["新版"], ["adversarial_wording"]);
  unresolved.editorialDiagnostic.recheck.unresolvedIssueCodes = ["adversarial_wording"];
  assert.throws(() => validateEditorialLoop(unresolved, current, base), /unresolved/);

  const inventedEvidence = review();
  inventedEvidence.editorialDiagnostic.repairs[0].afterEvidence = ["正文里不存在的修复结果"];
  assert.throws(() => validateEditorialLoop(inventedEvidence, current, base), /current master/);
});
