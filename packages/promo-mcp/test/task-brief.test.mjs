import test from 'node:test';
import assert from 'node:assert/strict';
import { readableTaskBrief } from '../dist/task-brief.js';

test('brief follows the resident video phase and round, not stale upstream agent instructions', () => {
  const brief = readableTaskBrief(6, 'video', { phase: 'rough_cut', round: 3, status: 'working' });
  assert.match(brief.status, /故事粗剪 · 第3轮 · 制作中/);
  assert.match(brief.output, /粗剪/);
  assert.ok(brief.check);
  assert.doesNotMatch(JSON.stringify(brief), /baseArtifactId|validationRules|Executable material/);
  assert.match(readableTaskBrief(5, 'video', null).doing, /怎么拍或录/);
  assert.match(readableTaskBrief(6, 'article', null).output, /文章预览/);
});
