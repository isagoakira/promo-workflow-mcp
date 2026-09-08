import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { CutWorkbenchStdioBridge } from '../packages/promo-service/dist/cut-workbench-stdio-bridge.js';

// Run after building Promo. Uses a disposable runtime; never touches saved projects.
const source = resolve(process.env.CUTBENCH_SOURCE ?? '../CutWorkBench');
const python = process.env.CUTBENCH_PYTHON ?? 'python3';
const runtime = await mkdtemp(join(tmpdir(), 'promo-cut-integration-'));
const environment = { ...process.env, PYTHONPATH: join(source, 'src') };
const bridge = new CutWorkbenchStdioBridge({
  command: python,
  args: ['-m', 'cut_workbench.cli', '--root', runtime, 'mcp'],
  cwd: source,
  env: environment,
});
const input = {
  productionControl: { phase: 'rough_cut', round: 2, tasks: [], instruction: 'Only repair the current rough-cut round; wait for human review.' },
  lockedMaster: {
    topicId: 'integration-video-review',
    confirmedAt: '2026-09-08T00:00:00.000Z',
    budget: { carrier: 'video', tier: 'short', targetMinutes: 1, targetDurationSeconds: 60, beatRange: [1, 1], targetGrillQuestionRange: [1, 1] },
    master: {
      carrier: 'video', workingTitle: 'Preview integration', targetDurationSeconds: 60,
      primaryCallToAction: null,
      shots: [{ id: 'S01', timeRange: { startMs: 0, endMs: 60000 }, shotPurpose: 'Show a real result', spokenContent: 'The result appears after the action.', spokenDelivery: 'VO', recordingDirection: 'Read clearly.', visualAction: 'Click then show the result.', composition: 'Readable screen', cameraBehavior: null, onScreenText: null, sound: null, transition: null, evidenceRefs: [], assetUsageIds: ['U01'] }],
      assetPlan: {
        sourceAssets: [{ id: 'SRC01', purpose: 'Prove action and result', evidenceRole: 'product evidence', productionIntent: 'Record a complete operation', captureProtocol: { captureMode: 'capture', continuousPath: 'Show initial state, click, hold result.', requiredVisibleStates: ['initial state', 'result'], editingHandles: 'Hold the result.', backupStrategy: 'Record twice.' }, constraints: [], preferredRoute: 'screen-recording', reusableFragments: [], usageIds: ['U01'], essentialOneOffReason: 'One complete proof.' }],
        usages: [{ id: 'U01', carrier: 'video', targetId: 'S01', purpose: 'Show proof', sourceAssetId: 'SRC01', fragmentId: null }],
        uniqueAcquisitionCount: 1, plannedUsageCount: 1, oneOffAssetIds: ['SRC01'],
      },
    },
  },
  requirementSet: { schemaVersion: 1, carrier: 'video', inputUsageIds: ['U01'], requirements: [{ requirementId: 'REQ01', sourceAssetId: 'SRC01', materialType: 'screen-recording', constraints: [], usages: [{ usageId: 'U01', purpose: 'Show proof', startMs: 0, endMs: 60000 }], coverageUsageIds: ['U01'], reuseCount: 1 }], subtitles: { cues: [], srt: '' } },
  acceptedProductionResults: [],
};

try {
  const first = await bridge.run(input);
  assert.equal(first.kind, 'production_result');
  assert.equal(first.finalGate.passed, false, 'An unproduced plan cannot pass delivery');
  const second = await bridge.run(input);
  assert.equal(second.projectId, first.projectId);
  assert.equal(second.revision, first.revision, 'Identical handoff must not create repeated revisions');
  const raw = execFileSync(python, ['-m', 'cut_workbench.cli', '--root', runtime, 'call', 'project.inspect', JSON.stringify({ project_id: first.projectId })], { cwd: source, env: environment, encoding: 'utf8' });
  const project = JSON.parse(raw);
  assert.deepEqual(project.execution.production_context, input.productionControl, 'Current phase and round must reach the single Cut execution node');
  assert.ok(!project.production_workflow, 'New bridge must not initialize nine planning stages');
  const call = (tool, args) => JSON.parse(execFileSync(python, ['-m', 'cut_workbench.cli', '--root', runtime, 'call', tool, JSON.stringify(args)], { cwd: source, env: environment, encoding: 'utf8' }));
  let current = project;
  const apply = (operations) => { current = call('project.apply_plan', { project_id: first.projectId, expected_revision: current.revision, actor: 'integration-test', reason: 'Exercise actual review feedback exchange', operations }); return current; };
  const media = join(runtime, 'preview.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=320x180:r=25:d=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', media]);
  const sha256 = createHash('sha256').update(await readFile(media)).digest('hex');
  apply([{ op: 'register_execution_preview', preview_id: 'PREVIEW-1', locator: media, sha256, duration_ms: 2000, source_revision: current.revision }]);
  const withPreview = await bridge.run(input);
  const publicPreview1 = withPreview.currentPreviewId;
  assert.ok(publicPreview1);
  assert.equal(withPreview.previews[0].sha256, sha256);
  assert.equal(withPreview.finalGate.passed, false);
  const inspection = call('execution.inspect_media', { project_id: first.projectId, preview_id: 'PREVIEW-1', start_ms: 0, end_ms: 1000, frame_times_ms: [100, 500], region: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 } });
  assert.equal(inspection.semantic_verdict, 'not_performed');
  assert.equal(inspection.artifacts.length, 3);
  for (const artifact of inspection.artifacts) assert.equal(createHash('sha256').update(await readFile(artifact.locator)).digest('hex'), artifact.sha256);
  const annotation = { id: 'COMMENT-1', revision: 1, previewId: publicPreview1, selections: [{ startMs: 100, endMs: 100, region: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 } }, { startMs: 500, endMs: 1200 }], text: 'Make both selected areas readable.', intent: 'production_change', unitIds: [], status: 'open', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const annotated = await bridge.run({ ...input, videoAnnotations: [annotation] });
  current = call('project.inspect', { project_id: first.projectId });
  assert.equal(current.execution.annotations['COMMENT-1'].selections.length, 2);
  assert.equal(current.execution.annotations['COMMENT-1'].selections[0].region.width, 0.3);
  assert.equal(annotated.finalGate.passed, false);
  apply([{ op: 'register_execution_preview', preview_id: 'PREVIEW-2', locator: media, sha256, duration_ms: 2000, source_revision: current.revision }]);
  apply([{ op: 'mark_annotation_fixed', annotation_id: 'COMMENT-1', preview_id: 'PREVIEW-2', evidence: ['integration:test-fix'] }]);
  const fixed = await bridge.run({ ...input, videoAnnotations: [annotation] });
  assert.equal(fixed.annotationUpdates.find(a => a.id === annotation.id).status, 'addressed');
  assert.equal(fixed.finalGate.passed, false, 'Agent fix must still require human review');
  const resolved = { ...annotation, revision: 3, status: 'resolved', targetPreviewId: fixed.currentPreviewId, reply: 'Reviewed the replacement.' };
  await bridge.run({ ...input, videoAnnotations: [resolved] });
  current = call('project.inspect', { project_id: first.projectId });
  assert.equal(current.execution.annotations['COMMENT-1'].status, 'resolved');
  assert.equal(current.execution.annotations['COMMENT-1'].preview_id, 'PREVIEW-1', 'Original annotation coordinates remain pinned');
  const reopened = { ...annotation, revision: 4, status: 'open' };
  await bridge.run({ ...input, videoAnnotations: [reopened] });
  current = call('project.inspect', { project_id: first.projectId });
  assert.equal(current.execution.annotations['COMMENT-1'].status, 'open');
  apply([{ op: 'mark_annotation_fixed', annotation_id: 'COMMENT-1', preview_id: 'PREVIEW-2', evidence: ['integration:test-second-fix'] }]);
  const rejectedFix = { ...annotation, revision: 6, status: 'open' };
  const rejection = await bridge.run({ ...input, videoAnnotations: [rejectedFix] });
  assert.equal(rejection.annotationUpdates.find(a => a.id === annotation.id).status, 'open', 'Human rejects a pending fix without stale acknowledgement reopening it');
  const expandedInputs = { ...input, acceptedProductionResults: [{ unitId: 'UNIT01', artifactIds: ['RAW01'], provenance: 'Explicitly supplied test material.' }], mediaAssets: [{ unitId: 'UNIT01', artifactId: 'RAW01', artifactContentHash: sha256, locator: media, sha256, provenance: 'Explicitly supplied test material.' }] };
  const expanded = await bridge.run(expandedInputs);
  assert.equal(expanded.projectId, first.projectId, 'Adding material must not restart the execution project');
  assert.equal(expanded.currentPreviewId, fixed.currentPreviewId, 'Additive material preserves existing preview');
  assert.equal(call('project.inspect', { project_id: first.projectId }).execution.handoff.assets[0].locator, media);
  const changedPlan = structuredClone(expandedInputs);
  changedPlan.lockedMaster.master.shots[0].visualAction = 'Show the result first, then explain the action.';
  const replacementPlan = await bridge.run(changedPlan);
  assert.notEqual(replacementPlan.projectId, first.projectId);
  assert.equal(replacementPlan.currentPreviewId, null, 'A revised plan cannot inherit approval or preview');
  assert.equal(call('project.inspect', { project_id: first.projectId }).execution.annotations['COMMENT-1'].preview_id, 'PREVIEW-1');
  console.log('PASS: real Promo-to-Cut MCP handoff, idempotency, no nine-stage initialization, real media preview, multi-range spatial feedback, fix-to-human-review exchange, original-version retention, and unverified delivery blocking.');
} finally {
  await rm(runtime, { recursive: true, force: true });
}
