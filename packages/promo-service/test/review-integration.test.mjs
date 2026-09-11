import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ArtifactStore, JsonWorkflowStore, WorkflowService, createGuidanceRequest, validateEditorialLoop } from '../dist/index.js';

test('article quality routing and video feedback coexist without crossing workflow or carrier boundaries', async () => {
  const root = await mkdtemp(join(tmpdir(), 'promo-review-integration-'));
  try {
    const store = new JsonWorkflowStore(join(root, 'workflows.json'));
    const capsule = (carrier) => ({ stage: 'master_development', inputs: {}, constraints: [], validationRules: [], requestedOutput: { description: 'fixture', fields: [] }, nextCommitKind: 'submit_master_draft', guidance: createGuidanceRequest(carrier === 'article' ? ['editorial-problem-router', 'human-language-writing', 'product-tweet-visual-proof'] : ['promo-storyboard-supervision']) });
    const record = (id, carrier) => ({ id, carrier, state: 'DEVELOPING_MASTER', revision: 1, summary: 'integration fixture', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), context: { agentWork: capsule(carrier) }, events: [], idempotency: {} });
    await store.write({ schemaVersion: 1, workflows: { article: record('article', 'article'), video: record('video', 'video') } });
    const service = new WorkflowService(store, new ArtifactStore(join(root, 'artifacts')));
    const detect = await service.guidance('article', ['editorial-problem-router']);
    assert.deepEqual(detect.guides.find(g => g.id === 'editorial-problem-router').resources.map(r => r.id), ['fixed-reading-checks']);
    assert.deepEqual((await service.guidance('article')).guides.map(g => g.id), ['article-planning-router', 'editorial-problem-router', 'human-language-writing']);
    const repair = await service.guidance('article', ['editorial-problem-router'], ['reader_gap']);
    assert.deepEqual(repair.guides.find(g => g.id === 'editorial-problem-router').resources.map(r => r.id), ['fixed-reading-checks', 'reader-gap-repair']);
    const video = await service.guidance('video');
    assert.ok(video.guides.every(g => g.id !== 'editorial-problem-router'));
    await assert.rejects(service.guidance('video', undefined, ['reader_gap']), /only available during article/);
    await assert.rejects(service.videoReview('article'), /video workflow/);
    assert.deepEqual((await service.videoReview('video')).annotations, []);
    assert.doesNotThrow(() => validateEditorialLoop({ passed: false }, { carrier: 'video' }));
    assert.throws(() => validateEditorialLoop({ passed: true }, { carrier: 'article', bodyMarkdown: '稿件' }), /editorialDiagnostic/);
    assert.equal((await store.read()).workflows.article.revision, 1);
    assert.equal((await store.read()).workflows.video.revision, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});
