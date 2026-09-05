/** The text desk uses exact source text, never contenteditable or injected Markdown HTML. */
export const TEXT_REVIEW_JS = String.raw`
(() => {
  const style = document.createElement('style');
  style.textContent = '.text-desk{position:fixed;inset:16px;z-index:100;background:#faf9f5;color:#24231e;border:1px solid #c9c5b9;border-radius:16px;box-shadow:0 12px 80px #0004;display:flex;flex-direction:column;padding:20px}.text-toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.text-toolbar h2{margin:0 auto 0 0}.text-layout{display:grid;grid-template-columns:minmax(0,2fr) minmax(270px,1fr);gap:24px;overflow:hidden;flex:1;margin-top:16px}.text-pages,.text-comments{overflow:auto;padding:8px}.text-field{white-space:pre-wrap;overflow-wrap:anywhere;font:17px/1.95 system-ui;user-select:text;margin:8px 0 24px}.text-comments textarea{box-sizing:border-box;width:100%;min-height:90px;font:16px/1.5 system-ui;padding:10px}.text-note{border-bottom:1px solid #d4d0c7;padding:12px 0}.text-note blockquote{white-space:pre-wrap;max-height:110px;overflow:auto;border-left:3px solid #c9b278;margin:8px 0;padding-left:10px}.text-note p{white-space:pre-wrap}.text-desk button,.text-desk select{font:14px system-ui;padding:7px 10px;cursor:pointer}.text-desk mark{background:#fae5a6}.text-status{font-size:13px;color:#665739;white-space:pre-wrap}.text-diff{display:grid;grid-template-columns:1fr 1fr;gap:16px}.text-diff pre{white-space:pre-wrap;overflow-wrap:anywhere;font:15px/1.8 system-ui}.text-diff del{background:#fbd9d5}.text-diff ins{background:#d8edcf;text-decoration:none}.text-selected{background:#fff0bf;padding:8px;margin:8px 0;white-space:pre-wrap;max-height:120px;overflow:auto}@media(max-width:800px){.text-desk{inset:0;padding:10px}.text-layout{grid-template-columns:1fr;overflow:auto}.text-pages,.text-comments{overflow:visible}.text-diff{grid-template-columns:1fr}}';
  document.head.append(style);
  style.textContent+='::highlight(promo-notes){background:#fae5a6}::highlight(promo-focus){background:#f7c56f}';
  let desk, review, current, workflowId, token, selections=[], editing=null, requestKey=null, saving=false;
  const el = (tag, text, className) => { const n=document.createElement(tag); if(text!==undefined) n.textContent=text; if(className) n.className=className; return n; };
  const button = (label, action) => { const b=el('button',label); b.type='button'; b.onclick=action; return b; };
  const api = async (path, options) => { const r=await fetch(path,options); const value=await r.json(); if(!r.ok) throw new Error(value.error||'请求失败'); return value; };
  const url = suffix => '/api/workflows/'+encodeURIComponent(workflowId)+'/'+suffix;
  const status = text => { desk.querySelector('.text-status').textContent=text; };
  function dirty() { return !!(desk?.querySelector('textarea')?.value || selections.length || editing); }
  function confirmDiscard() { return !saving && (!dirty() || confirm('有未提交批注，放弃这些输入？')); }
  function familyVersions() { return review.artifacts.filter(a=>a.family===current.family); }
  function resetDraft() { selections=[]; editing=null; requestKey=null; }
  async function open(id) {
    if(desk && !confirmDiscard()) return;
    workflowId=new URLSearchParams(location.search).get('workflowId');
    if(!workflowId) return;
    try {
      review=await api(url('text')); token=(await api('/api/text-session')).token;
      current=review.artifacts.find(a=>a.artifactId===id) || review.artifacts.at(-1);
      if(!current) return;
      desk?.remove(); resetDraft(); window.promoTextReviewOpen=true;
      desk=el('section',undefined,'text-desk'); desk.setAttribute('role','dialog'); desk.setAttribute('aria-label','文字批注与版本');
      document.body.append(desk); render();
    } catch(error) { alert(error.message); }
  }
  function render() {
    desk.replaceChildren();
    const top=el('div',undefined,'text-toolbar'); top.append(el('h2','文字批注与版本'));
    const picker=el('select'); picker.setAttribute('aria-label','文字版本');
    const versions=familyVersions();
    versions.forEach((a,i)=> {const o=el('option','第 '+(i+1)+' 版 · '+new Date(a.createdAt).toLocaleString()+(i===versions.length-1?' · 最新':''));o.value=a.artifactId;o.selected=a.artifactId===current.artifactId;picker.append(o);});
    picker.onchange=()=>{if(!confirmDiscard()){picker.value=current.artifactId;return;}current=review.artifacts.find(a=>a.artifactId===picker.value);resetDraft();render();};
    top.append(picker,button('与上一版对比',showDiff),button('检查更新',refresh),button('关闭',()=>{if(!confirmDiscard())return;desk.remove();desk=null;window.promoTextReviewOpen=false;document.getElementById('refresh')?.click();}));
    desk.append(top,el('div','选中正文任意范围后添加批注，可跨段或追加多个片段。保存后在下一轮关联流程对话中处理。','text-status'));
    const layout=el('div',undefined,'text-layout'), pages=el('div',undefined,'text-pages'), comments=el('aside',undefined,'text-comments');
    const fields=current.fields.filter(f=>f.text.trim() && !/\/(id|.*Id|.*Hash|skill|scope|carrier|confirmedAt|reviewedAt|preferredRoute)$/.test(f.field) && !f.field.startsWith('/review/'));
    const labels={bodyMarkdown:'正文',title:'标题',productionProcedure:'制作流程',spokenContent:'口播',readerDecision:'读者决定',humanCenter:'编辑目光',warmThread:'温度主线',authorStance:'叙述立场',evidencePosture:'事实边界',emotionalArc:'注意力变化',purpose:'用途'};
    fields.forEach(f=>{ const label=f.field.split('/').at(-1);pages.append(el('h3',labels[label]||f.field));const p=el('div',f.text,'text-field');p.dataset.field=f.field;pages.append(p); });
    const controls=el('div',undefined,'text-toolbar');controls.append(button('添加选区 / 追加片段',capture),button('全文批注',()=>{selections=[];selectionSummary();desk.querySelector('textarea').focus();}));
    comments.append(controls,el('div',undefined,'text-selections'));
    const input=el('textarea');input.placeholder='这里需要怎样调整？';input.setAttribute('aria-label','批注意见');input.oninput=()=>{requestKey=null;};
    comments.append(input,button('保存批注',save),button('取消输入',()=>{if(confirmDiscard()){resetDraft();input.value='';selectionSummary();}}),el('h3','批注与处理回复'),el('div',undefined,'text-note-list'));
    layout.append(pages,comments);desk.append(layout);renderNotes();
    // mousedown preserves the browser selection when clicking capture.
    controls.querySelector('button').onmousedown=event=>event.preventDefault();
  }
  function capture() {
    const selection=window.getSelection();
    if(!selection || selection.isCollapsed || !selection.rangeCount) return status('请先在左侧选中需要批注的文字。');
    const range=selection.getRangeAt(0), fields=[...desk.querySelectorAll('.text-field')];
    let added=0;
    for(const field of fields) {
      if(!range.intersectsNode(field)) continue;
      const inner=document.createRange();inner.selectNodeContents(field);
      if(field.contains(range.startContainer)) inner.setStart(range.startContainer,range.startOffset);
      if(field.contains(range.endContainer)) inner.setEnd(range.endContainer,range.endOffset);
      const before=document.createRange();before.selectNodeContents(field);before.setEnd(inner.startContainer,inner.startOffset);
      const start=before.toString().length, quote=inner.toString();
      if(!quote)continue;
      const anchor={field:field.dataset.field,start,end:start+quote.length,quote};
      if(!selections.some(a=>a.field===anchor.field&&a.start===start&&a.end===anchor.end)){selections.push(anchor);added++;}
    }
    if(selections.length>32){selections=selections.slice(0,32);status('一条批注最多包含 32 个选区，其余请另存一条。');}
    else status(added?'已添加选区，可继续选取其他片段。':'选区已添加或不属于正文。');
    requestKey=null;selectionSummary();desk.querySelector('textarea').focus();
  }
  function selectionSummary(){const box=desk.querySelector('.text-selections');box.replaceChildren();selections.forEach((a,i)=>{const row=el('div',a.quote,'text-selected');row.append(button('移除',()=>{selections.splice(i,1);requestKey=null;selectionSummary();}));box.append(row);});}
  async function save() {
    if(saving)return;
    const input=desk.querySelector('textarea');if(!input.value.trim())return status('请填写批注意见。');
    const payload={artifactId:current.artifactId,contentHash:current.contentHash,anchors:selections,body:input.value,idempotencyKey:requestKey||(requestKey=crypto.randomUUID()),...(editing?{annotationId:editing.id,expectedAnnotationRevision:editing.revision}:{})};
    saving=true;input.disabled=true;
    try {review.feedback=await api(url('annotations'),{method:'POST',headers:{'content-type':'application/json','x-promo-token':token},body:JSON.stringify(payload)});rememberHistory();resetDraft();input.value='';selectionSummary();renderNotes();status('已保存；下一轮关联流程对话会读取这条意见。');}
    catch(error){status('未保存，输入已保留：'+error.message);} finally {saving=false;input.disabled=false;}
  }
  function rememberHistory(){review.feedback.items.forEach(a=>{if(!review.history.annotations.some(x=>x.id===a.id&&x.revision===a.revision))review.history.annotations.push(a);});}
  function showOriginal(a){if(!confirmDiscard())return;current=review.artifacts.find(x=>x.artifactId===a.artifactId);resetDraft();render();highlight(a);}
  function rangesFor(anchors){return anchors.flatMap(anchor=>{const field=[...desk.querySelectorAll('.text-field')].find(f=>f.dataset.field===anchor.field);if(!field?.firstChild||field.textContent.slice(anchor.start,anchor.end)!==anchor.quote)return [];const r=document.createRange();r.setStart(field.firstChild,anchor.start);r.setEnd(field.firstChild,anchor.end);return [r];});}
  function highlight(a){const ranges=rangesFor(a.anchors);if(window.Highlight)CSS.highlights.set('promo-focus',new Highlight(...ranges));ranges[0]?.startContainer.parentElement.scrollIntoView({block:'center'});}
  function renderNotes(){
    const list=desk.querySelector('.text-note-list');list.replaceChildren();
    const ids=new Set(familyVersions().map(a=>a.artifactId));
    const items=review.feedback.items.filter(a=>ids.has(a.artifactId));
    if(window.Highlight)CSS.highlights.set('promo-notes',new Highlight(...rangesFor(items.filter(a=>a.artifactId===current.artifactId&&!a.withdrawn).flatMap(a=>a.anchors))));
    if(!items.length)list.append(el('p','暂无批注。'));
    const labels={pending:'待处理',needs_input:'需补充信息',replied:'已回复',verified:'已验证',withdrawn:'已撤回'};
    items.forEach(a=>{
      const row=el('article',undefined,'text-note');row.dataset.annotationId=a.id;
      row.append(el('strong',labels[a.status]+' · 原版 '+(familyVersions().findIndex(v=>v.artifactId===a.artifactId)+1)),el('p',a.body));
      a.anchors.forEach(x=>row.append(el('blockquote',x.quote)));if(!a.anchors.length)row.append(el('small','全文意见'));
      row.append(button('定位原文',()=>showOriginal(a)));
      if(a.artifactId!==current.artifactId){row.append(el('small',a.mappedTo?' · 保留原版绑定，新版有明确对应位置':' · 原位置已变化或尚未核对，保留原版定位'));if(a.mappedTo)row.append(button('查看新版对应位置',()=>{if(!confirmDiscard())return;current=review.artifacts.find(x=>x.artifactId===a.mappedTo.artifactId);resetDraft();render();highlight({anchors:a.mappedTo.anchors});}));if(!a.withdrawn)row.append(button('关联当前选区',()=>{if(saving)return;if(!selections.length)return status('先在当前版选取对应文字并添加选区，再关联。');editing=a;desk.querySelector('textarea').value=a.body;requestKey=null;status('将以当前选区重新关联这条意见，原版记录保留；点击保存确认。');}));}
      if(!a.withdrawn)row.append(button('修改意见',()=>{if(!confirmDiscard())return;current=review.artifacts.find(v=>v.artifactId===a.artifactId);resetDraft();render();editing=a;selections=a.anchors.map(x=>({...x}));desk.querySelector('textarea').value=a.body;selectionSummary();}),button('撤回',async()=>{try{review.feedback=await api(url('annotations'),{method:'POST',headers:{'content-type':'application/json','x-promo-token':token},body:JSON.stringify({artifactId:a.artifactId,contentHash:a.contentHash,anchors:a.anchors,body:a.body,annotationId:a.id,expectedAnnotationRevision:a.revision,withdrawn:true,idempotencyKey:crypto.randomUUID()})});renderNotes();}catch(e){status(e.message);}}));
      if(a.receipt){row.append(el('p','回复：'+a.receipt.reply));if(a.receipt.verification)row.append(el('p','验证：'+a.receipt.verification));if(a.receipt.targetArtifactId)row.append(button('查看修改',()=>{if(!confirmDiscard())return;current=review.artifacts.find(v=>v.artifactId===a.receipt.targetArtifactId);resetDraft();render();showDiff(a.artifactId);}));}
      const old=review.history.annotations.filter(x=>x.id===a.id&&x.revision!==a.revision);if(old.length){const details=el('details');details.append(el('summary','意见修改历史'));old.forEach(x=>details.append(el('p','修订 '+x.revision+'：'+x.body)));row.append(details);}
      list.append(row);
    });
  }
  function showDiff(baseId){
    const versions=familyVersions(), index=versions.findIndex(a=>a.artifactId===current.artifactId), before=typeof baseId==='string'?review.artifacts.find(a=>a.artifactId===baseId):versions[index-1];
    if(!before)return status('这是第一版，没有上一版可对比。');
    const pages=desk.querySelector('.text-pages');pages.replaceChildren(button('返回正文',()=>{if(confirmDiscard()){resetDraft();render();}}),el('h3','原文 → 当前所选版本'));
    const paths=new Set([...before.fields,...current.fields].map(f=>f.field));let changed=0;
    for(const field of paths){const a=before.fields.find(f=>f.field===field)?.text||'',b=current.fields.find(f=>f.field===field)?.text||'';if(a===b)continue;changed++;pages.append(el('h4',field));const pair=el('div',undefined,'text-diff');
      // Bounded linear prefix/suffix comparison; avoids quadratic diff on long manuscripts.
      let start=0,end=0;while(start<a.length&&start<b.length&&a[start]===b[start])start++;while(end<a.length-start&&end<b.length-start&&a[a.length-1-end]===b[b.length-1-end])end++;
      const left=el('pre'),right=el('pre');left.append(document.createTextNode(a.slice(0,start)),el('del',a.slice(start,a.length-end)),document.createTextNode(end?a.slice(-end):''));right.append(document.createTextNode(b.slice(0,start)),el('ins',b.slice(start,b.length-end)),document.createTextNode(end?b.slice(-end):''));pair.append(left,right);pages.append(pair);
    }if(!changed)pages.append(el('p','文字没有变化（可能仅锁定或审计记录变化）。'));
  }
  async function refresh(){if(!confirmDiscard())return;try{const id=current.artifactId;review=await api(url('text'));current=review.artifacts.find(a=>a.artifactId===id)||review.artifacts.at(-1);resetDraft();render();status('已读取最新批注与历史，仍展示你选定的文字版本。');}catch(e){status(e.message);}}
  document.addEventListener('click',event=>{const b=event.target.closest('[data-text-artifact]');if(b)open(b.dataset.textArtifact);});
  window.addEventListener('promo-text-update',()=>{if(desk)status('收到流程更新。当前选区与输入保持不变；可点击“检查更新”查看。');});
})();
`;
