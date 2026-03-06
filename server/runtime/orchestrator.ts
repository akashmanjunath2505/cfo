import type pg from 'pg';
import { randomUUID } from 'crypto';
import { buildDecisionPlan } from './planner.ts';
import { reviewDecisionPlan, summarizeExecutions } from './reviewer.ts';
import { executeAction } from './executor.ts';
import { recordValue, classifyAction, computeTimeSavingsUsd } from './value-ledger.ts';
import type { ActionExecution, FinancialSnapshot, OrchestratorContext } from './types.ts';
import type { PolicyConfig } from './policy.ts';

interface OrchestrateInput {
  db: pg.Pool;
  policyConfig: PolicyConfig;
  message: string;
  channel: string;
  conversationId: string;
  ownerId: string;
  stats: FinancialSnapshot;
  companyContext: Record<string, unknown>;
  memory: Array<{ role: string; content: string }>;
  onAudit: (event: {
    correlationId: string;
    eventType: string;
    actor: string;
    status: string;
    payload: Record<string, unknown>;
  }) => Promise<void>;
}

interface OrchestrateOutput {
  reply: string;
  actions: ActionExecution[];
  correlationId: string;
}

export const orchestrateConversationTurn = async (input: OrchestrateInput): Promise<OrchestrateOutput> => {
  const correlationId = randomUUID();
  const context: OrchestratorContext = {
    conversationId: input.conversationId,
    channel: input.channel,
    message: input.message,
    ownerId: input.ownerId,
    correlationId,
    companyContext: input.companyContext,
    memory: input.memory,
    stats: input.stats
  };

  const plan = reviewDecisionPlan(await buildDecisionPlan(context));
  const executions: ActionExecution[] = [];
  for (const action of plan.actions) {
    const execution = await executeAction({
      action,
      db: input.db,
      policyConfig: input.policyConfig,
      correlationId
    });
    executions.push(execution);

    if (execution.status === 'completed') {
      const category = classifyAction(execution.type);
      const timeSavings = computeTimeSavingsUsd(execution.type);
      const directValue = Math.abs(execution.actualImpactUsd);
      const grossValue = directValue + timeSavings;

      if (grossValue > 0) {
        try {
          await recordValue(input.db, {
            correlationId,
            actionType: execution.type,
            category,
            grossValueUsd: grossValue,
            description: `${execution.rationale}${timeSavings > 0 ? ` (+$${timeSavings.toFixed(0)} time savings)` : ''}`,
          });
        } catch {
          // Value ledger write failure should not break the main flow
        }
      }
    }

    await input.onAudit({
      correlationId,
      eventType: 'autonomous_action',
      actor: 'autonomous_cfo',
      status: execution.status,
      payload: {
        conversationId: input.conversationId,
        action: execution.type,
        confidence: execution.confidence,
        expectedImpactUsd: execution.expectedImpactUsd,
        actualImpactUsd: execution.actualImpactUsd,
        rollback: execution.rollback,
        error: execution.error || null
      }
    });
  }

  await input.onAudit({
    correlationId,
    eventType: 'decision_summary',
    actor: 'autonomous_cfo',
    status: 'completed',
    payload: {
      conversationId: input.conversationId,
      summary: summarizeExecutions(executions)
    }
  });

  return {
    reply: plan.reply,
    actions: executions,
    correlationId
  };
};
