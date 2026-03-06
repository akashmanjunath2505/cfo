import { randomUUID } from 'crypto';
import type pg from 'pg';
import type { Opportunity, ValueCategory, FinancialSnapshot } from './types.ts';

interface ScanContext {
  stats: FinancialSnapshot;
  bills: Array<{ amount: number; vendor: string; category: string; status: string }>;
  budgets: Array<{ name: string; allocated: number; spent: number }>;
  treasuryStrategies: Array<{ id: string; name: string; potential_yield: number; risk_level: string; status: string }>;
}

const buildOpportunities = (ctx: ScanContext): Omit<Opportunity, 'id' | 'created_at' | 'acted_at'>[] => {
  const opps: Omit<Opportunity, 'id' | 'created_at' | 'acted_at'>[] = [];

  // Underutilized budgets: if spent < 50% of allocated, suggest reallocation
  for (const b of ctx.budgets) {
    if (b.allocated > 0 && b.spent / b.allocated < 0.5) {
      const recoverableAmount = Math.round((b.allocated - b.spent) * 0.5);
      if (recoverableAmount > 100) {
        opps.push({
          category: 'budget_optimization',
          title: `Reallocate unused "${b.name}" budget`,
          description: `Only ${Math.round((b.spent / b.allocated) * 100)}% of the ${b.name} budget is used. $${recoverableAmount.toLocaleString()} could be redirected to higher-impact areas.`,
          estimated_value_usd: recoverableAmount,
          status: 'open',
          metadata: { budgetName: b.name, allocated: b.allocated, spent: b.spent },
        });
      }
    }
  }

  // Inactive high-yield treasury strategies
  for (const s of ctx.treasuryStrategies) {
    if (s.status !== 'Active' && s.potential_yield > 2 && s.risk_level !== 'High') {
      const annualYield = Math.round(ctx.stats.totalCash * (s.potential_yield / 100));
      const monthlyYield = Math.round(annualYield / 12);
      if (monthlyYield > 50) {
        opps.push({
          category: 'treasury_yield',
          title: `Activate "${s.name}" treasury strategy`,
          description: `This ${s.risk_level}-risk strategy could yield ~$${monthlyYield.toLocaleString()}/month (${s.potential_yield}% annually). Currently inactive.`,
          estimated_value_usd: monthlyYield,
          status: 'open',
          metadata: { strategyId: s.id, potentialYield: s.potential_yield },
        });
      }
    }
  }

  // High burn rate warning
  if (ctx.stats.runwayMonths > 0 && ctx.stats.runwayMonths < 6) {
    const reductionTarget = Math.round(ctx.stats.monthlyBurn * 0.1);
    opps.push({
      category: 'cost_avoidance',
      title: 'Reduce burn rate to extend runway',
      description: `Runway is only ${ctx.stats.runwayMonths.toFixed(1)} months. A 10% burn reduction ($${reductionTarget.toLocaleString()}/month) would add ~${Math.round((ctx.stats.totalCash / (ctx.stats.monthlyBurn * 0.9)) - ctx.stats.runwayMonths)} months.`,
      estimated_value_usd: reductionTarget,
      status: 'open',
      metadata: { currentBurn: ctx.stats.monthlyBurn, runway: ctx.stats.runwayMonths },
    });
  }

  // Pending bills that could be renegotiated (large bills)
  const largeBills = ctx.bills.filter(b => b.amount > 5000 && b.status === 'pending');
  if (largeBills.length > 0) {
    const totalLarge = largeBills.reduce((sum, b) => sum + b.amount, 0);
    const savingsEstimate = Math.round(totalLarge * 0.08);
    opps.push({
      category: 'bill_negotiation',
      title: `Negotiate ${largeBills.length} large pending bill(s)`,
      description: `$${totalLarge.toLocaleString()} in pending bills over $5K. Historical negotiation yields ~8% savings ($${savingsEstimate.toLocaleString()}).`,
      estimated_value_usd: savingsEstimate,
      status: 'open',
      metadata: { billCount: largeBills.length, totalAmount: totalLarge },
    });
  }

  return opps;
};

export const scanOpportunities = async (db: pg.Pool, stats: FinancialSnapshot): Promise<Opportunity[]> => {
  const [billsRes, budgetsRes, strategiesRes] = await Promise.all([
    db.query('SELECT amount, vendor, category, status FROM bills'),
    db.query('SELECT name, allocated, spent FROM budgets'),
    db.query('SELECT id, name, potential_yield, risk_level, status FROM treasury_strategies'),
  ]);

  const ctx: ScanContext = {
    stats,
    bills: billsRes.rows,
    budgets: budgetsRes.rows,
    treasuryStrategies: strategiesRes.rows,
  };

  const candidates = buildOpportunities(ctx);
  const now = new Date().toISOString();
  const results: Opportunity[] = [];

  for (const opp of candidates) {
    const id = randomUUID();
    // Upsert by title to avoid duplicates on repeated scans
    const existing = await db.query('SELECT id FROM opportunities WHERE title = $1 AND status = $2', [opp.title, 'open']);
    if (existing.rows.length > 0) continue;

    await db.query(
      `INSERT INTO opportunities (id, category, title, description, estimated_value_usd, status, created_at, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, opp.category, opp.title, opp.description, opp.estimated_value_usd, opp.status, now, JSON.stringify(opp.metadata)]
    );
    results.push({ ...opp, id, created_at: now, acted_at: null } as Opportunity);
  }

  return results;
};

export const getOpenOpportunities = async (db: pg.Pool): Promise<Opportunity[]> => {
  const result = await db.query(
    `SELECT * FROM opportunities WHERE status = 'open' ORDER BY estimated_value_usd DESC LIMIT 20`
  );
  return result.rows as Opportunity[];
};

export const dismissOpportunity = async (db: pg.Pool, oppId: string): Promise<boolean> => {
  const result = await db.query(
    `UPDATE opportunities SET status = 'dismissed' WHERE id = $1`,
    [oppId]
  );
  return (result.rowCount ?? 0) > 0;
};

export const markOpportunityActed = async (db: pg.Pool, oppId: string): Promise<boolean> => {
  const result = await db.query(
    `UPDATE opportunities SET status = 'acted', acted_at = $1 WHERE id = $2`,
    [new Date().toISOString(), oppId]
  );
  return (result.rowCount ?? 0) > 0;
};
