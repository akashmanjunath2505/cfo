import { randomUUID } from 'crypto';
import type pg from 'pg';
import type { ConversationAction, ActionExecution } from './types.ts';
import { connectors } from './connectors.ts';
import { checkPolicy, type PolicyConfig } from './policy.ts';

const safeNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const pickText = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback);

const withRollback = (
  action: ConversationAction,
  status: ActionExecution['status'],
  actualImpactUsd: number,
  rollback: ActionExecution['rollback'],
  metadata: Record<string, unknown> = {},
  error?: string
): ActionExecution => ({
  id: randomUUID(),
  type: action.type,
  status,
  rationale: action.rationale,
  confidence: action.confidence,
  expectedImpactUsd: action.expectedImpactUsd,
  actualImpactUsd,
  rollback,
  metadata,
  error
});

interface ExecuteInput {
  action: ConversationAction;
  db: pg.Pool;
  policyConfig: PolicyConfig;
  correlationId: string;
}

export const executeAction = async ({ action, db, policyConfig, correlationId }: ExecuteInput): Promise<ActionExecution> => {
  const policy = checkPolicy(action, policyConfig);
  if (!policy.allowed) {
    return withRollback(action, 'blocked', 0, { action: 'none', parameters: {} }, { reason: policy.reason });
  }

  try {
    if (action.type === 'allocate_research_budget') {
      const amount = Math.max(0, safeNumber(action.parameters.amount));
      const budgetName = pickText(action.parameters.budgetName, 'Research Budget');
      await db.query(
        'INSERT INTO company_context (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
        ['research_budget', JSON.stringify({ amount, budgetName, updated_at: new Date().toISOString() })]
      );
      return withRollback(
        action,
        'completed',
        -amount,
        { action: 'allocate_research_budget', parameters: { amount: 0, budgetName } },
        { budgetName }
      );
    }

    if (action.type === 'activate_treasury_strategy') {
      const strategyId = pickText(action.parameters.strategyId, '');
      if (!strategyId) return withRollback(action, 'failed', 0, { action: 'none', parameters: {} }, {}, 'Missing strategyId');
      const previous = await db.query('SELECT status FROM treasury_strategies WHERE id = $1', [strategyId]);
      await db.query('UPDATE treasury_strategies SET status = $1, last_executed = $2 WHERE id = $3', ['Active', new Date().toISOString(), strategyId]);
      return withRollback(
        action,
        'completed',
        action.expectedImpactUsd,
        { action: 'activate_treasury_strategy', parameters: { strategyId, status: previous.rows[0]?.status || 'Proposed' } },
        { strategyId }
      );
    }

    if (action.type === 'respond_approval') {
      const approvalId = pickText(action.parameters.approvalId, '');
      const status = pickText(action.parameters.status, 'approved');
      const note = pickText(action.parameters.note, 'Automated by autonomous CFO');
      if (!approvalId) return withRollback(action, 'failed', 0, { action: 'none', parameters: {} }, {}, 'Missing approvalId');
      const approval = await db.query('SELECT * FROM approvals WHERE id = $1', [approvalId]);
      if (approval.rows.length === 0) return withRollback(action, 'failed', 0, { action: 'none', parameters: {} }, {}, 'Approval not found');
      await db.query('UPDATE approvals SET status = $1, approver_note = $2 WHERE id = $3', [status, note, approvalId]);
      return withRollback(action, 'completed', action.expectedImpactUsd, { action: 'respond_approval', parameters: { approvalId, status: 'pending' } });
    }

    if (action.type === 'create_investor') {
      const id = randomUUID();
      await db.query(
        'INSERT INTO investors (id, name, firm, stage, focus, status, last_contact) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [
          id,
          pickText(action.parameters.name, 'New Investor'),
          pickText(action.parameters.firm, 'Unknown Firm'),
          pickText(action.parameters.stage, 'Seed'),
          pickText(action.parameters.focus, 'General'),
          pickText(action.parameters.status, 'Contacted'),
          new Date().toISOString()
        ]
      );
      return withRollback(action, 'completed', 0, { action: 'delete_investor', parameters: { id } }, { id });
    }

    if (action.type === 'run_simulation') {
      const id = randomUUID();
      await db.query('INSERT INTO simulations (id, timestamp, scenario, result) VALUES ($1, $2, $3, $4)', [
        id,
        new Date().toISOString(),
        pickText(action.parameters.scenario, 'Autonomous Scenario'),
        JSON.stringify({ generatedBy: 'autonomous_cfo', impact: action.expectedImpactUsd, parameters: action.parameters })
      ]);
      return withRollback(action, 'completed', 0, { action: 'delete_simulation', parameters: { id } }, { id });
    }

    if (action.type === 'send_email_outreach') {
      const result = await connectors.sendEmail({
        to: pickText(action.parameters.to, 'investor@example.com'),
        subject: pickText(action.parameters.subject, 'Company update'),
        body: pickText(action.parameters.body, 'Sharing latest financial updates.'),
        correlationId
      });
      return withRollback(
        action,
        result.ok ? 'completed' : 'failed',
        0,
        { action: 'send_email_outreach', parameters: { mode: 'manual_followup' } },
        result as unknown as Record<string, unknown>
      );
    }

    if (action.type === 'send_message_notification') {
      const result = await connectors.sendMessage({
        channel: pickText(action.parameters.channel, 'slack'),
        message: pickText(action.parameters.message, 'Automated CFO notification'),
        correlationId
      });
      return withRollback(
        action,
        result.ok ? 'completed' : 'failed',
        0,
        { action: 'send_message_notification', parameters: { mode: 'manual_followup' } },
        result as unknown as Record<string, unknown>
      );
    }

    if (action.type === 'create_calendar_task') {
      const result = await connectors.createCalendarTask({
        title: pickText(action.parameters.title, 'Follow-up task'),
        dueDate: pickText(action.parameters.dueDate, ''),
        notes: pickText(action.parameters.notes, ''),
        correlationId
      });
      return withRollback(
        action,
        result.ok ? 'completed' : 'failed',
        0,
        { action: 'create_calendar_task', parameters: { mode: 'manual_followup' } },
        result as unknown as Record<string, unknown>
      );
    }

    if (action.type === 'update_crm_pipeline') {
      const result = await connectors.updateCrm({
        entityType: pickText(action.parameters.entityType, 'investor'),
        entityId: pickText(action.parameters.entityId, randomUUID()),
        updates: (action.parameters.updates || {}) as Record<string, unknown>,
        correlationId
      });
      return withRollback(
        action,
        result.ok ? 'completed' : 'failed',
        0,
        { action: 'update_crm_pipeline', parameters: { mode: 'manual_followup' } },
        result as unknown as Record<string, unknown>
      );
    }

    if (action.type === 'create_payment_intent') {
      const amount = safeNumber(action.parameters.amount);
      return withRollback(
        action,
        amount > 0 ? 'completed' : 'failed',
        -amount,
        { action: 'create_payment_intent', parameters: { amount: 0 } },
        { provider: 'stripe_api', simulated: true, detail: 'Payment intent planning recorded.' }
      );
    }

    return withRollback(action, 'blocked', 0, { action: 'none', parameters: {} }, { reason: 'unknown_action_type' });
  } catch (error) {
    return withRollback(action, 'failed', 0, { action: 'none', parameters: {} }, {}, (error as Error).message);
  }
};
