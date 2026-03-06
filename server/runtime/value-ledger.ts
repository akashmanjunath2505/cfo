import { randomUUID } from 'crypto';
import type pg from 'pg';
import type { ActionType, ValueCategory, ValueLedgerEntry, BillingPeriod, ValueSummary } from './types.ts';

const getCurrentBillingPeriod = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const periodBounds = (period: string): { start: string; end: string } => {
  const [year, month] = period.split('-').map(Number);
  const start = new Date(year, month - 1, 1).toISOString();
  const end = new Date(year, month, 0, 23, 59, 59, 999).toISOString();
  return { start, end };
};

const ACTION_CATEGORY_MAP: Partial<Record<ActionType, ValueCategory>> = {
  allocate_research_budget: 'budget_optimization',
  activate_treasury_strategy: 'treasury_yield',
  respond_approval: 'cost_avoidance',
  create_payment_intent: 'budget_optimization',
  send_email_outreach: 'time_savings',
  send_message_notification: 'time_savings',
  create_calendar_task: 'time_savings',
  update_crm_pipeline: 'time_savings',
};

const AUTOMATION_ACTIONS: Set<string> = new Set([
  'send_email_outreach',
  'send_message_notification',
  'create_calendar_task',
  'update_crm_pipeline',
]);

export const classifyAction = (actionType: ActionType): ValueCategory => {
  return ACTION_CATEGORY_MAP[actionType] || 'cost_avoidance';
};

export const computeTimeSavingsUsd = (actionType: string): number => {
  if (!AUTOMATION_ACTIONS.has(actionType)) return 0;
  const hourlyRate = Number(process.env.CFO_HUMAN_HOURLY_RATE) || 150;
  const minutesSaved: Record<string, number> = {
    send_email_outreach: 15,
    send_message_notification: 5,
    create_calendar_task: 10,
    update_crm_pipeline: 20,
  };
  return ((minutesSaved[actionType] || 10) / 60) * hourlyRate;
};

export const recordValue = async (
  db: pg.Pool,
  input: {
    correlationId: string;
    actionType: ActionType;
    category: ValueCategory;
    grossValueUsd: number;
    description: string;
  }
): Promise<ValueLedgerEntry> => {
  const id = randomUUID();
  const now = new Date().toISOString();
  const period = getCurrentBillingPeriod();

  await db.query(
    `INSERT INTO value_ledger (id, correlation_id, action_type, category, description, gross_value_usd, created_at, billing_period)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, input.correlationId, input.actionType, input.category, input.description, input.grossValueUsd, now, period]
  );

  return {
    id,
    correlation_id: input.correlationId,
    action_type: input.actionType,
    category: input.category,
    description: input.description,
    gross_value_usd: input.grossValueUsd,
    verified: false,
    verified_at: null,
    created_at: now,
    billing_period: period,
    billed: false,
  };
};

const ensureOpenPeriod = async (db: pg.Pool, period: string): Promise<BillingPeriod> => {
  const feePercentage = Number(process.env.CFO_FEE_PERCENTAGE) || 5;
  const { start, end } = periodBounds(period);

  const existing = await db.query('SELECT * FROM billing_periods WHERE id = $1', [period]);
  if (existing.rows.length > 0) return existing.rows[0] as BillingPeriod;

  await db.query(
    `INSERT INTO billing_periods (id, period_start, period_end, fee_percentage, status)
     VALUES ($1, $2, $3, $4, 'open')
     ON CONFLICT (id) DO NOTHING`,
    [period, start, end, feePercentage]
  );
  const row = await db.query('SELECT * FROM billing_periods WHERE id = $1', [period]);
  return row.rows[0] as BillingPeriod;
};

export const getCurrentPeriodSummary = async (db: pg.Pool): Promise<ValueSummary> => {
  const period = getCurrentBillingPeriod();
  const bp = await ensureOpenPeriod(db, period);

  const entries = await db.query(
    'SELECT * FROM value_ledger WHERE billing_period = $1',
    [period]
  );

  const categoryBreakdown: Record<ValueCategory, number> = {
    budget_optimization: 0,
    treasury_yield: 0,
    cost_avoidance: 0,
    bill_negotiation: 0,
    time_savings: 0,
    revenue_recovery: 0,
  };

  let grossValueUsd = 0;
  let verifiedCount = 0;

  for (const row of entries.rows) {
    const cat = row.category as ValueCategory;
    const val = Number(row.gross_value_usd) || 0;
    grossValueUsd += val;
    if (cat in categoryBreakdown) categoryBreakdown[cat] += val;
    if (row.verified) verifiedCount++;
  }

  const feePercentage = bp.fee_percentage;
  const feeAmountUsd = Math.round(grossValueUsd * (feePercentage / 100) * 100) / 100;

  return {
    currentPeriod: bp,
    grossValueUsd,
    feePercentage,
    feeAmountUsd,
    categoryBreakdown,
    entryCount: entries.rows.length,
    verifiedCount,
  };
};

export const getValueHistory = async (
  db: pg.Pool,
  months: number = 12
): Promise<{ periods: BillingPeriod[]; entries: ValueLedgerEntry[] }> => {
  const periods = await db.query(
    'SELECT * FROM billing_periods ORDER BY period_start DESC LIMIT $1',
    [months]
  );
  const entries = await db.query(
    `SELECT * FROM value_ledger ORDER BY created_at DESC LIMIT $1`,
    [months * 100]
  );
  return {
    periods: periods.rows as BillingPeriod[],
    entries: entries.rows as ValueLedgerEntry[],
  };
};

export const markVerified = async (
  db: pg.Pool,
  entryId: string,
  verified: boolean
): Promise<boolean> => {
  const now = verified ? new Date().toISOString() : null;
  const result = await db.query(
    'UPDATE value_ledger SET verified = $1, verified_at = $2 WHERE id = $3',
    [verified, now, entryId]
  );
  return (result.rowCount ?? 0) > 0;
};

export const closePeriod = async (
  db: pg.Pool,
  periodId: string
): Promise<BillingPeriod | null> => {
  const summary = await db.query(
    'SELECT COALESCE(SUM(gross_value_usd), 0) as total FROM value_ledger WHERE billing_period = $1',
    [periodId]
  );
  const grossValue = Number(summary.rows[0]?.total) || 0;

  const bp = await db.query('SELECT * FROM billing_periods WHERE id = $1', [periodId]);
  if (bp.rows.length === 0) return null;

  const feePercentage = bp.rows[0].fee_percentage;
  const minFee = Number(process.env.CFO_MIN_MONTHLY_FEE_USD) || 0;
  const maxFee = Number(process.env.CFO_MAX_MONTHLY_FEE_USD) || 10000;
  let feeAmount = Math.round(grossValue * (feePercentage / 100) * 100) / 100;
  feeAmount = Math.max(minFee, Math.min(maxFee, feeAmount));

  await db.query(
    `UPDATE billing_periods SET gross_value_usd = $1, fee_amount_usd = $2, status = 'closed' WHERE id = $3`,
    [grossValue, feeAmount, periodId]
  );

  await db.query(
    'UPDATE value_ledger SET billed = true WHERE billing_period = $1',
    [periodId]
  );

  const updated = await db.query('SELECT * FROM billing_periods WHERE id = $1', [periodId]);
  return updated.rows[0] as BillingPeriod;
};

export const getLedgerEntries = async (
  db: pg.Pool,
  period?: string,
  limit: number = 50
): Promise<ValueLedgerEntry[]> => {
  if (period) {
    const result = await db.query(
      'SELECT * FROM value_ledger WHERE billing_period = $1 ORDER BY created_at DESC LIMIT $2',
      [period, limit]
    );
    return result.rows as ValueLedgerEntry[];
  }
  const result = await db.query(
    'SELECT * FROM value_ledger ORDER BY created_at DESC LIMIT $1',
    [limit]
  );
  return result.rows as ValueLedgerEntry[];
};
