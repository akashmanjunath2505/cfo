export type ActionType =
  | 'allocate_research_budget'
  | 'activate_treasury_strategy'
  | 'respond_approval'
  | 'create_investor'
  | 'run_simulation'
  | 'send_email_outreach'
  | 'send_message_notification'
  | 'create_calendar_task'
  | 'update_crm_pipeline'
  | 'create_payment_intent';

export type ActionStatus = 'planned' | 'executing' | 'completed' | 'failed' | 'reverted' | 'blocked';

export interface FinancialSnapshot {
  totalCash: number;
  monthlyBurn: number;
  runwayMonths: number;
  healthScore: number;
}

export interface ConversationAction {
  type: ActionType;
  rationale: string;
  confidence: number;
  expectedImpactUsd: number;
  parameters: Record<string, unknown>;
}

export interface DecisionEnvelope {
  reply: string;
  actions: ConversationAction[];
}

export interface ActionExecution {
  id: string;
  type: ActionType;
  status: ActionStatus;
  rationale: string;
  confidence: number;
  expectedImpactUsd: number;
  actualImpactUsd: number;
  rollback: { action: string; parameters: Record<string, unknown> };
  metadata?: Record<string, unknown>;
  error?: string;
}

export interface OrchestratorContext {
  conversationId: string;
  channel: string;
  message: string;
  ownerId: string;
  correlationId: string;
  companyContext: Record<string, unknown>;
  memory: Array<{ role: string; content: string }>;
  stats: FinancialSnapshot;
}

export interface ActionTimelineEvent {
  id: string;
  correlation_id: string;
  created_at: string;
  event_type: string;
  actor: string;
  status: string;
  payload: Record<string, unknown>;
}

export type ValueCategory =
  | 'budget_optimization'
  | 'treasury_yield'
  | 'cost_avoidance'
  | 'bill_negotiation'
  | 'time_savings'
  | 'revenue_recovery';

export interface ValueLedgerEntry {
  id: string;
  correlation_id: string;
  action_type: ActionType;
  category: ValueCategory;
  description: string;
  gross_value_usd: number;
  verified: boolean;
  verified_at: string | null;
  created_at: string;
  billing_period: string;
  billed: boolean;
}

export interface BillingPeriod {
  id: string;
  period_start: string;
  period_end: string;
  gross_value_usd: number;
  fee_percentage: number;
  fee_amount_usd: number;
  stripe_invoice_id: string | null;
  status: 'open' | 'closed' | 'invoiced' | 'paid';
}

export interface ValueSummary {
  currentPeriod: BillingPeriod;
  grossValueUsd: number;
  feePercentage: number;
  feeAmountUsd: number;
  categoryBreakdown: Record<ValueCategory, number>;
  entryCount: number;
  verifiedCount: number;
}

export interface Opportunity {
  id: string;
  category: ValueCategory;
  title: string;
  description: string;
  estimated_value_usd: number;
  status: 'open' | 'acted' | 'dismissed';
  created_at: string;
  acted_at: string | null;
  metadata: Record<string, unknown>;
}
