export const EDITORIAL_REVIEW_GUIDANCE = `
已锁定文字若需按明确批注修订，使用 request_text_revision，传 annotations:[{id,revision}] 与 revisionReason；复用原回流路径，不直接改锁定文件，不把回流记成已解决。意见含糊或与当前要求冲突时先提问。
## 当前要求与有依据的复审
以当前编辑契约/大纲为准，旧聊天口径不是另一份要求。articleEditorialIntent（大纲中 editorialIntent）可含 proseLooseness: null 或 0–100 整数。未设置不得擅自补值。0–24 紧凑直接；25–49 适度场景与停顿；50–74 充分观察和间接转场；75–100 偏随笔展开。该值只控制表达松紧，不是质量分，不降低事实、信息必要性、全文推进或新手可理解性。不要靠短句、问句或抓手配额逼近参数。
先读全文与当前要求，再读修改报告。按全文关系 → 段落职责 → 句子表达审计，指出具体结构问题，而非只让相邻句更顺。C/L/I/E/S/R/A 仅作可选视角，不设总分或机械感门槛。连续两轮同类修改无改善，重新诊断上层原因。
masterReview.audit 必须含 masterHash、requirementsHash、rationale、findings。requirementsHash 来自 promo_get.editorialContext；masterHash 用服务 contentHash(readMasterDraft(masterDraft)) 计算（递归排序对象键后的 JSON 的 SHA-256）。每条 finding 含 id、location、layer(macro/meso/micro)、severity(critical/normal)、evidence、action、preserve、acceptance、verified、verification。无问题可 findings=[]，但 rationale 应说明全文推进与读者匹配依据。
旧版证据不能冒充新版验证；关键项未验证、事实缺口或分项未通过时不得 passed=true。草稿可 passed=false 提交展示。用户明确接受剩余编辑问题时，lock_master 的 editorialAcceptanceNote 保留取舍，不能消除事实缺口。
先读取 reviewFeedback.pending；多条批注先合并诊断、再逐条回复。context.annotationReceipts:[{annotationId,annotationRevision,action:changed|explained|needs_input,reply,verification?}] 可随新版提交；changed 只对应同次提交的新文字制品。纯解释/需补充信息用 reply_annotations。最新用户要求暂不修改时保留待办。回复不是已解决；不得因已读自动关闭。
素材 productionProcedure 是正式需求的一部分，须写准备、步骤和预期画面、每个 usageId 的成品规格、验收与失败处理；captureProtocol 不得丢失或被静默覆盖。executionReview.evidence 需解释步骤和使用位为何可执行，非空不等于通过。
`;
