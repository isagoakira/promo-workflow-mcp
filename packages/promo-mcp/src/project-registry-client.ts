export const PROJECT_REGISTRY_JS = String.raw`
(() => {
  const box = document.createElement('section');
  box.className = 'project-directory';
  box.setAttribute('aria-label', '已登记工程');
  const app = document.getElementById('app');
  if (!app) return;
  app.before(box);
  const style = document.createElement('style');
  style.textContent = '.project-directory{max-width:1440px;margin:20px auto;padding:0 28px}.project-directory details{border:1px solid #bdb8a8;background:#faf8f0;padding:16px 22px}.project-directory summary{cursor:pointer;font-weight:700}.project-directory p{font-size:14px;line-height:1.6;margin:8px 0;color:#555}.project-directory article{border-top:1px solid #ded8c7;padding:12px 0}.project-directory h3{font-size:17px;margin:0}.project-directory a{display:inline-block;margin:6px 16px 6px 0;color:#315e4f}.project-directory .warning{color:#9b4125}.project-directory button{padding:7px 12px;font-size:14px;margin:10px 0}.project-directory .path{overflow-wrap:anywhere}';
  document.head.append(style);
  const el = (tag, text, parent) => { const item = document.createElement(tag); item.textContent = text; parent.append(item); return item; };
  const phases = {materials:'素材检查',rough_cut:'故事粗剪',audio:'声音整理',fine_cut:'画面精剪',subtitles:'字幕校对',delivery:'终版交付'};
  const statuses = {working:'制作中',waiting_material:'等素材',awaiting_review:'等你审看',paused_planning:'返回策划中',complete:'阶段已确认'};
  let busy = false;
  async function refresh() {
    if(busy) return;
    busy = true;
    const open = box.querySelector('details')?.open;
    try {
      const response = await fetch('/api/projects');
      if(!response.ok) throw new Error('工程名册暂时无法读取，请重试。');
      const data = await response.json();
      box.replaceChildren();
      const details = document.createElement('details'); details.open = open ?? data.projects.some(p=>p.status!=='ready'); box.append(details);
      el('summary', '已登记工程 · '+data.projects.length+' 个 · '+data.projects.filter(p=>p.status!=='ready').length+' 个需要检查', details);
      el('p', '只检查已登记工作区的进度和交付物记录，不代表内容已经验收。最近检查：'+new Date(data.checkedAt).toLocaleTimeString(), details);
      const button=el('button','重新检查',details); button.type='button'; button.onclick=refresh;
      if(!data.projects.length) el('p','暂未登记工程。告诉助手“登记这个工作区”，已有工程不需要重建。',details);
      for(const project of data.projects) {
        const row=el('article','',details);
        el('h3',project.rootDirectory.split(/[\\/]/).filter(Boolean).at(-1)||project.rootDirectory,row);
        el('p',project.rootDirectory,row).className='path';
        for(const issue of project.issues) el('p',issue,row).className='warning';
        for(const workflow of project.workflows) {
          const production=workflow.production;
          const progress=production ? (phases[production.phase]||'制作')+' · 第'+production.round+'轮 · '+(statuses[production.status]||'等待检查') : '第 '+(workflow.progress?.node||'?')+' 步 · '+(workflow.progress?.detail||'等待检查');
          const link=el('a',workflow.displayName+' · '+(workflow.carrier==='video'?'视频':'推文')+' · '+progress,row);
          if(project.status!=='unavailable'&&!project.issues.some(s=>s.includes('编号'))) link.href='/?workflowId='+encodeURIComponent(workflow.workflowId);
        }
      }
    } catch(e) { box.replaceChildren(); el('p',e.message,box).className='warning'; const retry=el('button','重新检查',box); retry.onclick=refresh; }
    finally { busy=false; }
  }
  refresh();
  // No video/media decoding and no workflow mutations during a progress check.
  setInterval(()=>{if(!document.hidden) refresh();},30000);
})();
`;
