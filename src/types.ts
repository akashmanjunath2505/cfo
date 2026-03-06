export interface Transaction {
  id: string;
  date: string;
  amount: number;
  category: string;
  merchant: string;
  status: 'pending' | 'completed' | 'failed';
  account_id: string;
}

export interface Budget {
  id: string;
  name: string;
  allocated: number;
  spent: number;
  period: string;
}

export interface FinancialStats {
  totalCash: number;
  monthlyBurn: number;
  runwayMonths: number;
  healthScore: number;
}

export interface AIDecision {
  id: string;
  timestamp: string;
  action: string;
  reasoning: string;
  status: 'pending' | 'executed' | 'rejected';
  impact_score: number;
}

export interface Bill {
  id: string;
  date: string;
  due_date: string;
  amount: number;
  vendor: string;
  category: string;
  status: 'pending' | 'approved' | 'paid' | 'rejected';
  file_url?: string;
  extracted_data?: any;
}

export interface ApprovalRequest {
  id: string;
  type: 'bill_payment' | 'budget_change' | 'allocation';
  target_id: string;
  requested_at: string;
  status: 'pending' | 'approved' | 'rejected';
  requested_by: string;
  approver_note?: string;
  vendor?: string; // Joined from bills
  amount?: number; // Joined from bills
  due_date?: string; // Joined from bills
}

export interface Investor {
  id: string;
  name: string;
  firm: string;
  stage: string;
  focus: string;
  last_contact: string;
  status: 'Lead' | 'Interested' | 'Passed' | 'Contacted';
}

export interface TreasuryStrategy {
  id: string;
  name: string;
  description: string;
  potential_yield: number;
  risk_level: 'None' | 'Low' | 'Medium' | 'High';
  status: 'Active' | 'Inactive' | 'Proposed';
  last_executed?: string;
}

export type ConversationChannel = 'text' | 'voice';

export type AutonomousActionType =
  | 'allocate_research_budget'
  | 'activate_treasury_strategy'
  | 'respond_approval'
  | 'create_investor'
  | 'run_simulation';

export interface AutonomousActionExecution {
  id: string;
  type: AutonomousActionType;
  status: 'planned' | 'executing' | 'completed' | 'failed' | 'reverted' | 'blocked';
  rationale: string;
  confidence: number;
  expectedImpactUsd: number;
  actualImpactUsd: number;
  rollback: { action: string; parameters: Record<string, unknown> };
  metadata?: Record<string, unknown>;
  error?: string;
}

export interface ConversationResponse {
  conversationId: string;
  correlationId?: string;
  reply: string;
  actions: AutonomousActionExecution[];
  stats: FinancialStats;
}

export interface AuditTimelineEvent {
  id: string;
  correlation_id?: string;
  created_at: string;
  event_type: string;
  actor: string;
  status: string;
  payload: Record<string, unknown>;
}

export interface GuardrailsConfig {
  autonomyEnabled: boolean;
  killSwitch: boolean;
  maxSingleAllocationUsd: number;
  allowedActions: string[];
  disabledDomains: string[];
}

export interface ExternalOperationResult {
  correlationId: string;
  ok: boolean;
  provider: string;
  detail: string;
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
  action_type: string;
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
  entries: ValueLedgerEntry[];
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
}
