export interface PromoWorkbenchLink {
  title: "Promo Workflow 工作台";
  url: string | null;
  workflowId: string | null;
  role: string;
  agentAction: string;
}

export function reviewUrlFor(baseUrl: string | undefined, workflowId: string | undefined): string | undefined {
  if (!baseUrl || !workflowId) return baseUrl;
  return `${baseUrl}/?workflowId=${encodeURIComponent(workflowId)}`;
}

export function workbenchFor(baseUrl: string | undefined, workflowId?: string | undefined): PromoWorkbenchLink {
  const url = reviewUrlFor(baseUrl, workflowId);
  return {
    title: "Promo Workflow 工作台",
    url: url ?? null,
    workflowId: workflowId ?? null,
    role: "只读监控七节点进度、冻结制品、待办、版本与人工审核点，不执行提交或批准。",
    agentAction: url
      ? "在读取或推进工作流后，主动向用户展示此链接；宿主支持打开本地网页时，同时打开它。"
      : "工作台未启动；调用 promo_review 获取明确的本机启动问题。",
  };
}
