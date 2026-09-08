import { randomUUID } from 'node:crypto';

export const VIDEO_PRODUCTION_PHASES = [
  { id: 'materials', label: '素材检查', output: '素材目录、分镜对应关系、可用片段和补录清单', checks: ['文件能正常打开', '重要观点有画面支撑', '隐私位置已标记'], instruction: '复用完整录屏和口播中的片段，不为每个分镜重复拍摄。对外展示前先处理隐私。' },
  { id: 'rough_cut', label: '故事粗剪', output: '完整粗剪视频、可编辑工程、带时间的问题清单', checks: ['不用特效也能看懂', '没有重复和无效等待', '关键结论有真实画面'], instruction: '口播视频可先剪人声，再搭主画面。先讲通故事，不急着做精细效果。' },
  { id: 'audio', label: '声音整理', output: '最终人声音轨、句子时间位置、补录清单', checks: ['没有口误', '语速与音量合适', '声音和画面同步'], instruction: '整理句间节奏、替换错读，确认最终声音；不要让音乐盖住人声。' },
  { id: 'fine_cut', label: '画面精剪', output: '精剪视频、可编辑工程、遗留问题清单', checks: ['重要画面清楚', '文字和放大位置正确', '隐私已处理且效果不过量'], instruction: '用相关辅助画面遮剪切，完成必要放大、重点文字和打码。整篇口播改动需重新检查声音与字幕。' },
  { id: 'subtitles', label: '字幕校对', output: '带字幕审片视频、独立字幕文件', checks: ['字幕与实际人声一致', '名称数字正确', '时间正确且不挡重点'], instruction: '依据最终听到的声音制作字幕，不直接复制早期脚本。' },
  { id: 'delivery', label: '终版交付', output: '所需发布视频、字幕、可编辑工程和交付说明', checks: ['完整播放无异常', '音画字幕同步且无漏打码', '所需比例清晰度正确且工程可打开'], instruction: '依次看故事、事实、细节；仅导出实际需要的版本，不默认复制横竖版和无字幕版。' },
] as const;
export type VideoProductionPhase = typeof VIDEO_PRODUCTION_PHASES[number]['id'];
export interface VideoProductionTask {
  id: string; phase: VideoProductionPhase; title: string; owner: 'user' | 'cutbench' | 'promo';
  status: 'todo' | 'doing' | 'blocked' | 'done'; evidenceArtifactIds: string[];
}
export interface VideoProductionSubmission { id: string; phase: VideoProductionPhase; round: number; planArtifactId: string; previewId: string | null; artifactIds: string[]; note: string }
export interface VideoProductionState {
  node: 6; phase: VideoProductionPhase; round: number;
  status: 'working' | 'waiting_material' | 'awaiting_review' | 'paused_planning' | 'complete';
  planArtifactId: string; tasks: VideoProductionTask[]; submission: VideoProductionSubmission | null;
  approvals: (VideoProductionSubmission & { confirmedAt: string; note: string })[];
  planningReturn: { node: number; reason: string; phase: VideoProductionPhase } | null;
  history: { id: string; at: string; action: string; reason: string; snapshot: Omit<VideoProductionState, 'history'> }[];
}
export function createVideoProduction(planArtifactId: string): VideoProductionState {
  return { node: 6, phase: 'materials', round: 1, status: 'working', planArtifactId, tasks: [], submission: null, approvals: [], planningReturn: null, history: [] };
}
const phaseIndex = (phase: string) => VIDEO_PRODUCTION_PHASES.findIndex(p => p.id === phase);
function required(value: unknown, label: string): string { if (typeof value !== 'string' || !value.trim()) throw Error(`${label} is required.`); return value.trim(); }
function strings(value: unknown): string[] { if (!Array.isArray(value) || value.some(v => typeof v !== 'string' || !v.trim())) throw Error('artifactIds must be strings.'); return [...new Set(value)] as string[]; }
export interface ProductionChangeEnvironment { actor: 'human' | 'agent'; planArtifactId: string; currentPreviewId: string | null; unresolvedFeedback: boolean }
/** One resident record, many revisioned rounds. Never overwrite a prior decision. */
export function changeVideoProduction(original: VideoProductionState, input: Record<string, unknown>, env: ProductionChangeEnvironment): VideoProductionState {
  const state = structuredClone(original), action = required(input.action, 'action'), reason = required(input.reason, 'reason');
  if (['approve', 'return_planning', 'resume'].includes(action) && env.actor !== 'human') throw Error('Human confirmation is required.');
  if (state.status === 'paused_planning' && action !== 'resume') throw Error('Production is paused for planning.');
  if (state.status === 'awaiting_review' && ['task','submit'].includes(action)) throw Error('Rework the submitted round before editing or resubmitting.');
  if (state.status === 'complete' && action !== 'rework' && action !== 'return_planning') throw Error('Reopen a completed round before changing it.');
  if (!['resume','return_planning'].includes(action) && state.planArtifactId !== env.planArtifactId) throw Error('Production plan changed; return to planning and resume with impact review.');
  const { history: _history, ...snapshot } = structuredClone(original);
  if (action === 'task') {
    const id = input.taskId === undefined ? randomUUID() : required(input.taskId, 'taskId');
    const existing = state.tasks.find(t => t.id === id);
    if (existing && existing.phase !== state.phase) throw Error('Rework the affected phase before changing its tasks.');
    const owner = input.owner ?? existing?.owner ?? 'cutbench', status = input.status ?? existing?.status ?? 'todo';
    if (!['user','cutbench','promo'].includes(String(owner)) || !['todo','doing','blocked','done'].includes(String(status))) throw Error('Invalid task owner or status.');
    const evidenceArtifactIds = input.artifactIds === undefined ? existing?.evidenceArtifactIds ?? [] : strings(input.artifactIds);
    if (status === 'done' && !evidenceArtifactIds.length) throw Error('Completed tasks require evidence artifacts.');
    const task = { id, phase: state.phase, title: required(input.title ?? existing?.title, 'title'), owner, status, evidenceArtifactIds } as VideoProductionTask;
    state.tasks = [...state.tasks.filter(t => t.id !== id), task]; state.submission = null;
    state.status = state.tasks.some(t => t.phase === state.phase && t.status === 'blocked') ? 'waiting_material' : 'working';
  } else if (action === 'submit') {
    const tasks = state.tasks.filter(t => t.phase === state.phase);
    if (!tasks.length || tasks.some(t => t.status !== 'done')) throw Error('Complete every current task with evidence before submission.');
    const artifactIds = strings(input.artifactIds);
    if (!artifactIds.length) throw Error('Submission requires deliverables.');
    const previewId = input.previewId == null ? null : required(input.previewId, 'previewId');
    if (state.phase !== 'materials' && (!previewId || previewId !== env.currentPreviewId)) throw Error('Submit the current registered video preview.');
    if (env.unresolvedFeedback) throw Error('Unresolved video feedback blocks submission.');
    state.submission = { id: randomUUID(), phase: state.phase, round: state.round, planArtifactId: state.planArtifactId, previewId, artifactIds, note: reason };
    state.status = 'awaiting_review';
  } else if (action === 'approve') {
    const s = state.submission;
    if (state.status !== 'awaiting_review' || !s || input.submissionId !== s.id) throw Error('Confirm the exact submitted round.');
    if (s.planArtifactId !== env.planArtifactId || (s.previewId && s.previewId !== env.currentPreviewId)) throw Error('Submission is stale; submit the current version again.');
    if (env.unresolvedFeedback) throw Error('Unresolved video feedback blocks approval.');
    state.approvals.push({ ...s, confirmedAt: new Date().toISOString(), note: reason });
    const next = VIDEO_PRODUCTION_PHASES[phaseIndex(state.phase) + 1];
    state.submission = null;
    if (next) { state.phase = next.id; state.round = 1; state.status = 'working'; } else state.status = 'complete';
  } else if (action === 'rework' || action === 'resume') {
    const phase = required(input.phase, 'earliest affected phase');
    if (phaseIndex(phase) < 0 || phaseIndex(phase) > phaseIndex(state.phase)) throw Error('Cannot skip unapproved phases.');
    if (action === 'resume' && state.status !== 'paused_planning') throw Error('No paused production to resume.');
    state.round = Math.max(state.phase === phase ? state.round : 0, ...state.history.filter(h => h.snapshot.phase === phase).map(h => h.snapshot.round)) + 1;
    state.phase = phase as VideoProductionPhase;
    state.approvals = state.approvals.filter(a => phaseIndex(a.phase) < phaseIndex(phase));
    state.tasks = state.tasks.map(t => phaseIndex(t.phase) >= phaseIndex(phase) ? { ...t, status: 'todo', evidenceArtifactIds: [] } : t);
    state.status = 'working'; state.submission = null; state.planningReturn = null;
    state.planArtifactId = env.planArtifactId;
  } else if (action === 'return_planning') {
    if (![2,3,4,5].includes(Number(input.node))) throw Error('Planning return node must be 2, 3, 4 or 5.');
    state.planningReturn = { node: Number(input.node), reason, phase: state.phase }; state.status = 'paused_planning';
  } else throw Error('Unknown production action.');
  state.history.push({ id: randomUUID(), at: new Date().toISOString(), action, reason, snapshot });
  return state;
}
