import type { ActionExecution, DecisionEnvelope } from './types.ts';

export const reviewDecisionPlan = (plan: DecisionEnvelope): DecisionEnvelope => {
  const deduped = new Map<string, (typeof plan.actions)[number]>();
  for (const action of plan.actions) {
    const key = `${action.type}:${JSON.stringify(action.parameters || {})}`;
    if (!deduped.has(key)) {
      deduped.set(key, action);
    }
  }
  return {
    reply: plan.reply,
    actions: Array.from(deduped.values()).slice(0, 3)
  };
};

export const summarizeExecutions = (executions: ActionExecution[]) => {
  const completed = executions.filter((item) => item.status === 'completed').length;
  const blocked = executions.filter((item) => item.status === 'blocked').length;
  const failed = executions.filter((item) => item.status === 'failed').length;
  return {
    completed,
    blocked,
    failed,
    total: executions.length
  };
};
