import type { ConversationAction } from './types.ts';

export interface PolicyConfig {
  autonomyEnabled: boolean;
  killSwitch: boolean;
  maxSingleAllocationUsd: number;
  allowedActions: Set<string>;
  disabledDomains: Set<string>;
}

export interface PolicyDecision {
  allowed: boolean;
  reason?: string;
}

const domainByAction: Record<string, string> = {
  allocate_research_budget: 'finance',
  activate_treasury_strategy: 'finance',
  respond_approval: 'finance',
  create_investor: 'crm',
  update_crm_pipeline: 'crm',
  run_simulation: 'planning',
  send_email_outreach: 'outreach',
  send_message_notification: 'messaging',
  create_calendar_task: 'planning',
  create_payment_intent: 'payments'
};

export const checkPolicy = (action: ConversationAction, config: PolicyConfig): PolicyDecision => {
  if (!config.autonomyEnabled || config.killSwitch) {
    return { allowed: false, reason: 'autonomy_disabled_or_kill_switch' };
  }

  if (!config.allowedActions.has(action.type)) {
    return { allowed: false, reason: 'action_not_allowed' };
  }

  const domain = domainByAction[action.type] || 'unknown';
  if (config.disabledDomains.has(domain)) {
    return { allowed: false, reason: `domain_disabled:${domain}` };
  }

  if (action.type === 'allocate_research_budget') {
    const amount = Number(action.parameters.amount || 0);
    if (amount > config.maxSingleAllocationUsd) {
      return {
        allowed: false,
        reason: `allocation_exceeds_limit:${config.maxSingleAllocationUsd}`
      };
    }
  }

  return { allowed: true };
};
