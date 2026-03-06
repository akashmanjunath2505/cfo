import express, { type NextFunction, type Request, type Response } from 'express';
import { createServer as createViteServer } from 'vite';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import Stripe from 'stripe';
import dotenv from 'dotenv';
import { orchestrateConversationTurn } from './server/runtime/orchestrator.ts';
import type { PolicyConfig } from './server/runtime/policy.ts';
import { connectors } from './server/runtime/connectors.ts';
import { getCurrentPeriodSummary, getValueHistory, markVerified, getLedgerEntries } from './server/runtime/value-ledger.ts';
import { closeBillingPeriod, getInvoices } from './server/runtime/billing.ts';
import { scanOpportunities, getOpenOpportunities, dismissOpportunity } from './server/runtime/opportunity-scanner.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type ActionType =
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

interface FinancialSnapshot {
  totalCash: number;
  monthlyBurn: number;
  runwayMonths: number;
  healthScore: number;
}

interface ConversationAction {
  type: ActionType;
  rationale: string;
  confidence: number;
  expectedImpactUsd: number;
  parameters: Record<string, unknown>;
}

interface DecisionEnvelope {
  reply: string;
  actions: ConversationAction[];
}

interface ActionExecution {
  id: string;
  type: ActionType;
  status: 'planned' | 'executing' | 'completed' | 'failed' | 'reverted' | 'blocked';
  rationale: string;
  confidence: number;
  expectedImpactUsd: number;
  actualImpactUsd: number;
  rollback: { action: string; parameters: Record<string, unknown> };
  metadata?: Record<string, unknown>;
  error?: string;
}

interface ActionTimelineEvent {
  id: string;
  correlation_id: string;
  created_at: string;
  event_type: string;
  actor: string;
  status: string;
  payload: Record<string, unknown>;
}

const { Pool } = pg;
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgresql://neondb_owner:npg_Ssog1aLZCGE2@ep-little-bread-aiboengh-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

const PORT = Number(process.env.PORT || '3000');
const OWNER_TOKEN = process.env.CFO_OWNER_TOKEN || '';
const AUTONOMY_ENABLED = (process.env.CFO_AUTONOMY_ENABLED || 'true') === 'true';
const ACTIONS_KILL_SWITCH = (process.env.CFO_ACTIONS_KILL_SWITCH || 'false') === 'true';
const ALLOWED_ACTIONS = new Set(
  (process.env.CFO_ALLOWED_ACTIONS || 'allocate_research_budget,activate_treasury_strategy,respond_approval,create_investor,run_simulation')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
);
const AUDIT_SLACK_ENABLED = (process.env.CFO_AUDIT_SLACK_ENABLED || 'true') === 'true';
const MAX_SINGLE_ALLOCATION_USD = Number(process.env.CFO_MAX_SINGLE_ALLOCATION_USD || '25000');
const DISABLED_DOMAINS = new Set(
  (process.env.CFO_DISABLED_DOMAINS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
);

// Lazy Stripe init
let stripe: Stripe | null = null;
const getStripe = () => {
  if (!stripe && process.env.STRIPE_SECRET_KEY) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripe;
};

// Initialize Database Schema
const initDb = async () => {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        date TEXT,
        amount REAL,
        category TEXT,
        merchant TEXT,
        status TEXT,
        account_id TEXT
      );

      CREATE TABLE IF NOT EXISTS budgets (
        id TEXT PRIMARY KEY,
        name TEXT,
        allocated REAL,
        spent REAL,
        period TEXT
      );

      CREATE TABLE IF NOT EXISTS ai_decisions (
        id TEXT PRIMARY KEY,
        timestamp TEXT,
        action TEXT,
        reasoning TEXT,
        status TEXT,
        impact_score REAL,
        metadata JSONB DEFAULT '{}'::jsonb
      );

      CREATE TABLE IF NOT EXISTS company_context (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS simulations (
        id TEXT PRIMARY KEY,
        timestamp TEXT,
        scenario TEXT,
        result JSONB
      );

      CREATE TABLE IF NOT EXISTS bills (
        id TEXT PRIMARY KEY,
        date TEXT,
        due_date TEXT,
        amount REAL,
        vendor TEXT,
        category TEXT,
        status TEXT,
        file_url TEXT,
        extracted_data JSONB
      );

      CREATE TABLE IF NOT EXISTS approvals (
        id TEXT PRIMARY KEY,
        type TEXT,
        target_id TEXT,
        requested_at TEXT,
        status TEXT,
        requested_by TEXT,
        approver_note TEXT
      );

      CREATE TABLE IF NOT EXISTS investors (
        id TEXT PRIMARY KEY,
        name TEXT,
        firm TEXT,
        stage TEXT,
        focus TEXT,
        last_contact TEXT,
        status TEXT
      );

      CREATE TABLE IF NOT EXISTS treasury_strategies (
        id TEXT PRIMARY KEY,
        name TEXT,
        description TEXT,
        potential_yield REAL,
        risk_level TEXT,
        status TEXT,
        last_executed TEXT
      );

      CREATE TABLE IF NOT EXISTS conversation_threads (
        id TEXT PRIMARY KEY,
        owner_id TEXT,
        created_at TEXT,
        updated_at TEXT,
        channel TEXT
      );

      CREATE TABLE IF NOT EXISTS conversation_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT,
        role TEXT,
        channel TEXT,
        content TEXT,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TEXT
      );

      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        correlation_id TEXT,
        created_at TEXT,
        event_type TEXT,
        actor TEXT,
        status TEXT,
        payload JSONB
      );

      CREATE TABLE IF NOT EXISTS idempotency_keys (
        key TEXT PRIMARY KEY,
        route TEXT,
        created_at TEXT
      );

      CREATE TABLE IF NOT EXISTS value_ledger (
        id TEXT PRIMARY KEY,
        correlation_id TEXT,
        action_type TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT,
        gross_value_usd REAL NOT NULL DEFAULT 0,
        verified BOOLEAN DEFAULT false,
        verified_at TEXT,
        created_at TEXT NOT NULL,
        billing_period TEXT NOT NULL,
        billed BOOLEAN DEFAULT false
      );

      CREATE TABLE IF NOT EXISTS billing_periods (
        id TEXT PRIMARY KEY,
        period_start TEXT NOT NULL,
        period_end TEXT NOT NULL,
        gross_value_usd REAL DEFAULT 0,
        fee_percentage REAL NOT NULL,
        fee_amount_usd REAL DEFAULT 0,
        stripe_invoice_id TEXT,
        status TEXT DEFAULT 'open'
      );

      CREATE TABLE IF NOT EXISTS opportunities (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        estimated_value_usd REAL DEFAULT 0,
        status TEXT DEFAULT 'open',
        created_at TEXT NOT NULL,
        acted_at TEXT,
        metadata JSONB DEFAULT '{}'::jsonb
      );
    `);

    await client.query(`
      ALTER TABLE ai_decisions
      ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb
    `);
    await client.query(`
      ALTER TABLE audit_events
      ADD COLUMN IF NOT EXISTS correlation_id TEXT
    `);
  } finally {
    client.release();
  }
};

const safeNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const pickText = (value: unknown, fallback = ''): string => {
  return typeof value === 'string' ? value : fallback;
};

const jsonResponse = (res: Response, status: number, body: Record<string, unknown>) => {
  res.status(status).json(body);
};

const getPolicyConfig = (): PolicyConfig => ({
  autonomyEnabled: AUTONOMY_ENABLED,
  killSwitch: ACTIONS_KILL_SWITCH,
  maxSingleAllocationUsd: MAX_SINGLE_ALLOCATION_USD,
  allowedActions: ALLOWED_ACTIONS,
  disabledDomains: DISABLED_DOMAINS
});

const fetchStatsSnapshot = async (): Promise<FinancialSnapshot> => {
  const totalCashRes = await pool.query('SELECT SUM(amount) as total FROM transactions');
  const monthlyBurnRes = await pool.query(
    "SELECT SUM(amount) as total FROM transactions WHERE amount < 0 AND date > TO_CHAR(NOW() - INTERVAL '30 days', 'YYYY-MM-DD')"
  );

  const totalCash = safeNumber(totalCashRes.rows[0]?.total);
  const monthlyBurn = Math.abs(safeNumber(monthlyBurnRes.rows[0]?.total));
  const runway = monthlyBurn === 0 ? 99 : totalCash / monthlyBurn;

  return {
    totalCash,
    monthlyBurn,
    runwayMonths: runway,
    healthScore: 88
  };
};

const requireOwnerForMutation = (req: Request, res: Response, next: NextFunction) => {
  const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase());
  if (!isMutation) {
    next();
    return;
  }

  if (!OWNER_TOKEN) {
    next();
    return;
  }

  const providedToken = req.header('x-owner-token') || '';
  const role = (req.header('x-owner-role') || '').toLowerCase();
  if (providedToken !== OWNER_TOKEN || (role !== 'owner' && role !== 'admin')) {
    jsonResponse(res, 401, { error: 'Unauthorized mutation request.' });
    return;
  }
  next();
};

const withIdempotency = async (req: Request, res: Response, next: NextFunction) => {
  const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase());
  if (!isMutation) {
    next();
    return;
  }
  const key = req.header('x-idempotency-key');
  if (!key) {
    next();
    return;
  }
  try {
    const existing = await pool.query('SELECT key FROM idempotency_keys WHERE key = $1', [key]);
    if (existing.rows.length > 0) {
      jsonResponse(res, 409, { error: 'Duplicate idempotency key.' });
      return;
    }
    await pool.query('INSERT INTO idempotency_keys (key, route, created_at) VALUES ($1, $2, $3)', [
      key,
      `${req.method} ${req.path}`,
      new Date().toISOString()
    ]);
    next();
  } catch (error) {
    jsonResponse(res, 500, { error: (error as Error).message });
  }
};

// Slack Notification Helper
const sendSlackNotification = async (message: string) => {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl || !AUDIT_SLACK_ENABLED) {
    return;
  }
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `AutoCFO Alert: ${message}` })
    });
  } catch (err) {
    console.error('Failed to send Slack notification:', err);
  }
};

const sseClients = new Set<Response>();
const broadcastEvent = (eventType: string, payload: Record<string, unknown>) => {
  for (const client of sseClients) {
    client.write(`event: ${eventType}\n`);
    client.write(`data: ${JSON.stringify(payload)}\n\n`);
  }
};

const writeAuditEvent = async (event: {
  correlationId?: string;
  eventType: string;
  actor: string;
  status: string;
  payload: Record<string, unknown>;
}) => {
  const row: ActionTimelineEvent = {
    id: randomUUID(),
    correlation_id: event.correlationId || randomUUID(),
    created_at: new Date().toISOString(),
    event_type: event.eventType,
    actor: event.actor,
    status: event.status,
    payload: event.payload
  };

  await pool.query(
    'INSERT INTO audit_events (id, correlation_id, created_at, event_type, actor, status, payload) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [row.id, row.correlation_id, row.created_at, row.event_type, row.actor, row.status, JSON.stringify(row.payload)]
  );

  broadcastEvent('audit', row as unknown as Record<string, unknown>);
};

const estimateResearchBudget = (stats: FinancialSnapshot) => {
  const maxComfortable = Math.max(0, Math.min(stats.totalCash * 0.05, stats.monthlyBurn * 0.3 || stats.totalCash * 0.02));
  return Math.round(maxComfortable);
};

const buildFallbackDecisionEnvelope = (message: string, stats: FinancialSnapshot): DecisionEnvelope => {
  const lower = message.toLowerCase();
  if (lower.includes('research') || lower.includes('protein')) {
    const recommended = estimateResearchBudget(stats);
    const affordability = stats.runwayMonths < 6 ? 'tight' : stats.runwayMonths < 12 ? 'moderate' : 'healthy';
    return {
      reply: `We can afford a small research allocation right now. Based on current runway (${stats.runwayMonths.toFixed(1)} months), I recommend starting with about $${recommended.toLocaleString()} and reviewing outcomes in 30 days.`,
      actions: [
        {
          type: 'allocate_research_budget',
          rationale: `Affordability is ${affordability}; starting small preserves runway while enabling learning.`,
          confidence: 0.79,
          expectedImpactUsd: -recommended,
          parameters: {
            amount: recommended,
            budgetName: 'Protein Research',
            reviewInDays: 30
          }
        }
      ]
    };
  }

  return {
    reply:
      "I can run this as an autonomous financial decision. Share your target outcome and timeframe, and I will allocate budget, update strategy, and track impact automatically.",
    actions: []
  };
};

const getLLMDecisionEnvelope = async (
  message: string,
  stats: FinancialSnapshot,
  memory: Array<{ role: string; content: string }>,
  companyContext: Record<string, unknown>
): Promise<DecisionEnvelope> => {
  if (!process.env.GEMINI_API_KEY) {
    return buildFallbackDecisionEnvelope(message, stats);
  }

  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const prompt = `
You are an autonomous CFO. Decide what to execute immediately.
Return STRICT JSON with shape:
{
  "reply": "string",
  "actions": [{
    "type": "allocate_research_budget|activate_treasury_strategy|respond_approval|create_investor|run_simulation",
    "rationale": "string",
    "confidence": number,
    "expectedImpactUsd": number,
    "parameters": {}
  }]
}
Rules:
- Keep reply concise, human, and decisive.
- Only include actions that are safe and directly relevant.
- If uncertain, choose smaller amount and include a review horizon.

Financial snapshot:
${JSON.stringify(stats)}

Company context:
${JSON.stringify(companyContext)}

Recent memory:
${JSON.stringify(memory.slice(-8))}

Owner message:
${message}
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ parts: [{ text: prompt }] }],
      config: { responseMimeType: 'application/json' }
    });
    const parsed = JSON.parse(response.text || '{}') as Partial<DecisionEnvelope>;
    const actions = Array.isArray(parsed.actions) ? parsed.actions : [];
    return {
      reply: pickText(parsed.reply, buildFallbackDecisionEnvelope(message, stats).reply),
      actions: actions
        .map((action) => ({
          type: pickText(action.type) as ActionType,
          rationale: pickText(action.rationale, 'No rationale provided.'),
          confidence: Math.max(0, Math.min(1, safeNumber(action.confidence))),
          expectedImpactUsd: safeNumber(action.expectedImpactUsd),
          parameters: (action.parameters || {}) as Record<string, unknown>
        }))
        .filter((action) => ALLOWED_ACTIONS.has(action.type))
    };
  } catch (error) {
    console.error('LLM decision generation failed, using fallback:', error);
    return buildFallbackDecisionEnvelope(message, stats);
  }
};

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

const executeAction = async (action: ConversationAction): Promise<ActionExecution> => {
  if (!AUTONOMY_ENABLED || ACTIONS_KILL_SWITCH) {
    return withRollback(
      action,
      'blocked',
      0,
      { action: 'none', parameters: {} },
      { reason: 'autonomy_disabled_or_kill_switch' }
    );
  }
  if (!ALLOWED_ACTIONS.has(action.type)) {
    return withRollback(action, 'blocked', 0, { action: 'none', parameters: {} }, { reason: 'action_not_allowed' });
  }

  try {
    if (action.type === 'allocate_research_budget') {
      const amount = Math.max(0, safeNumber(action.parameters.amount));
      const budgetName = pickText(action.parameters.budgetName, 'Research Budget');
      await pool.query(
        `
        INSERT INTO company_context (key, value) VALUES ($1, $2)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
        `,
        ['research_budget', JSON.stringify({ amount, budgetName, updated_at: new Date().toISOString() })]
      );
      return withRollback(
        action,
        'completed',
        -amount,
        {
          action: 'allocate_research_budget',
          parameters: { amount: 0, budgetName }
        },
        { budgetName }
      );
    }

    if (action.type === 'activate_treasury_strategy') {
      const strategyId = pickText(action.parameters.strategyId, '');
      if (!strategyId) {
        return withRollback(action, 'failed', 0, { action: 'none', parameters: {} }, {}, 'Missing strategyId');
      }
      const previous = await pool.query('SELECT status FROM treasury_strategies WHERE id = $1', [strategyId]);
      await pool.query('UPDATE treasury_strategies SET status = $1, last_executed = $2 WHERE id = $3', [
        'Active',
        new Date().toISOString(),
        strategyId
      ]);
      return withRollback(
        action,
        'completed',
        action.expectedImpactUsd,
        {
          action: 'activate_treasury_strategy',
          parameters: { strategyId, status: previous.rows[0]?.status || 'Proposed' }
        },
        { strategyId }
      );
    }

    if (action.type === 'respond_approval') {
      const approvalId = pickText(action.parameters.approvalId, '');
      const status = pickText(action.parameters.status, 'approved');
      const note = pickText(action.parameters.note, 'Automated by autonomous CFO');
      if (!approvalId) {
        return withRollback(action, 'failed', 0, { action: 'none', parameters: {} }, {}, 'Missing approvalId');
      }
      const approvalRes = await pool.query('SELECT * FROM approvals WHERE id = $1', [approvalId]);
      if (approvalRes.rows.length === 0) {
        return withRollback(action, 'failed', 0, { action: 'none', parameters: {} }, {}, 'Approval not found');
      }
      await pool.query('UPDATE approvals SET status = $1, approver_note = $2 WHERE id = $3', [status, note, approvalId]);
      if (approvalRes.rows[0].type === 'bill_payment') {
        await pool.query('UPDATE bills SET status = $1 WHERE id = $2', [
          status === 'approved' ? 'approved' : 'rejected',
          approvalRes.rows[0].target_id
        ]);
      }
      return withRollback(
        action,
        'completed',
        action.expectedImpactUsd,
        {
          action: 'respond_approval',
          parameters: { approvalId, status: 'pending' }
        },
        { approvalId, status }
      );
    }

    if (action.type === 'create_investor') {
      const id = randomUUID();
      const name = pickText(action.parameters.name, 'New Investor');
      const firm = pickText(action.parameters.firm, 'Unknown Firm');
      const stage = pickText(action.parameters.stage, 'Seed');
      const focus = pickText(action.parameters.focus, 'General');
      const status = pickText(action.parameters.status, 'Contacted');
      await pool.query(
        'INSERT INTO investors (id, name, firm, stage, focus, status, last_contact) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [id, name, firm, stage, focus, status, new Date().toISOString()]
      );
      return withRollback(
        action,
        'completed',
        0,
        { action: 'delete_investor', parameters: { id } },
        { id, name, firm }
      );
    }

    if (action.type === 'run_simulation') {
      const id = randomUUID();
      const scenario = pickText(action.parameters.scenario, 'Autonomous Scenario');
      const result = {
        generatedBy: 'autonomous_cfo',
        impact: action.expectedImpactUsd,
        notes: pickText(action.parameters.notes, 'Simulation generated from conversation context.')
      };
      await pool.query('INSERT INTO simulations (id, timestamp, scenario, result) VALUES ($1, $2, $3, $4)', [
        id,
        new Date().toISOString(),
        scenario,
        JSON.stringify(result)
      ]);
      return withRollback(action, 'completed', 0, { action: 'delete_simulation', parameters: { id } }, { id, scenario });
    }

    return withRollback(action, 'blocked', 0, { action: 'none', parameters: {} }, { reason: 'unknown_action_type' });
  } catch (error) {
    return withRollback(action, 'failed', 0, { action: 'none', parameters: {} }, {}, (error as Error).message);
  }
};

const persistDecision = async (
  conversationId: string,
  userMessage: string,
  assistantReply: string,
  channel: string,
  actions: ActionExecution[]
) => {
  const now = new Date().toISOString();
  await pool.query(
    `
    INSERT INTO conversation_messages (id, conversation_id, role, channel, content, metadata, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7),
           ($8, $2, $9, $4, $10, $11, $7)
    `,
    [
      randomUUID(),
      conversationId,
      'user',
      channel,
      userMessage,
      JSON.stringify({}),
      now,
      randomUUID(),
      'assistant',
      assistantReply,
      JSON.stringify({ actions })
    ]
  );

  for (const action of actions) {
    await pool.query(
      `
      INSERT INTO ai_decisions (id, timestamp, action, reasoning, status, impact_score, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        action.id,
        now,
        action.type,
        action.rationale,
        action.status,
        action.actualImpactUsd,
        JSON.stringify({
          confidence: action.confidence,
          expectedImpactUsd: action.expectedImpactUsd,
          rollback: action.rollback,
          metadata: action.metadata || {}
        })
      ]
    );
  }
};

const getCompanyContext = async () => {
  const contextRows = await pool.query('SELECT key, value FROM company_context');
  const context: Record<string, unknown> = {};
  for (const row of contextRows.rows) {
    try {
      context[row.key] = JSON.parse(row.value);
    } catch {
      context[row.key] = row.value;
    }
  }
  return context;
};

async function createApp() {
  await initDb();
  const app = express();

  app.use(express.json({ limit: '15mb' }));
  app.use(requireOwnerForMutation);
  app.use(withIdempotency);

  // API Routes
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), autonomyEnabled: AUTONOMY_ENABLED, killSwitch: ACTIONS_KILL_SWITCH });
  });

  app.get('/api/guardrails', async (_req, res) => {
    try {
      res.json({
        autonomyEnabled: AUTONOMY_ENABLED,
        killSwitch: ACTIONS_KILL_SWITCH,
        maxSingleAllocationUsd: MAX_SINGLE_ALLOCATION_USD,
        allowedActions: Array.from(ALLOWED_ACTIONS),
        disabledDomains: Array.from(DISABLED_DOMAINS)
      });
    } catch (err) {
      jsonResponse(res, 500, { error: (err as Error).message });
    }
  });

  app.get('/api/realtime/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    res.write(`event: connected\ndata: ${JSON.stringify({ connectedAt: new Date().toISOString() })}\n\n`);

    sseClients.add(res);
    req.on('close', () => {
      sseClients.delete(res);
      res.end();
    });
  });

  app.get('/api/actions/timeline', async (_req, res) => {
    try {
      const result = await pool.query('SELECT * FROM audit_events ORDER BY created_at DESC LIMIT 100');
      res.json(result.rows);
    } catch (err) {
      jsonResponse(res, 500, { error: (err as Error).message });
    }
  });

  app.get('/api/transactions', async (_req, res) => {
    try {
      const result = await pool.query('SELECT * FROM transactions ORDER BY date DESC LIMIT 100');
      res.json(result.rows);
    } catch (err) {
      jsonResponse(res, 500, { error: (err as Error).message });
    }
  });

  app.get('/api/stats', async (_req, res) => {
    try {
      const stats = await fetchStatsSnapshot();
      res.json(stats);
    } catch (err) {
      jsonResponse(res, 500, { error: (err as Error).message });
    }
  });

  app.post('/api/conversation/respond', async (req, res) => {
    const message = pickText(req.body?.message).trim();
    const channel = pickText(req.body?.channel, 'text');
    let conversationId = pickText(req.body?.conversationId);
    if (!message) {
      jsonResponse(res, 400, { error: 'message is required.' });
      return;
    }

    try {
      if (!conversationId) {
        conversationId = randomUUID();
        const now = new Date().toISOString();
        await pool.query(
          'INSERT INTO conversation_threads (id, owner_id, created_at, updated_at, channel) VALUES ($1, $2, $3, $4, $5)',
          [conversationId, 'owner', now, now, channel]
        );
      } else {
        await pool.query('UPDATE conversation_threads SET updated_at = $1 WHERE id = $2', [new Date().toISOString(), conversationId]);
      }

      const stats = await fetchStatsSnapshot();
      const companyContext = await getCompanyContext();
      const memoryRows = await pool.query(
        'SELECT role, content FROM conversation_messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 12',
        [conversationId]
      );
      const memory = memoryRows.rows.reverse();

      const orchestrated = await orchestrateConversationTurn({
        db: pool,
        policyConfig: getPolicyConfig(),
        message,
        channel,
        conversationId,
        ownerId: 'owner',
        stats,
        companyContext,
        memory,
        onAudit: async (audit) => {
          await writeAuditEvent({
            correlationId: audit.correlationId,
            eventType: audit.eventType,
            actor: audit.actor,
            status: audit.status,
            payload: audit.payload
          });
        }
      });

      await persistDecision(conversationId, message, orchestrated.reply, channel, orchestrated.actions);
      await writeAuditEvent({
        correlationId: orchestrated.correlationId,
        eventType: 'conversation_turn',
        actor: 'owner',
        status: 'completed',
        payload: {
          conversationId,
          channel,
          message,
          actions: orchestrated.actions.map((item) => ({
            id: item.id,
            type: item.type,
            status: item.status
          }))
        }
      });

      for (const execution of orchestrated.actions) {
        if (execution.status === 'completed') {
          await sendSlackNotification(`Executed autonomous action: ${execution.type} [${orchestrated.correlationId}]`);
        }
      }

      res.json({
        conversationId,
        correlationId: orchestrated.correlationId,
        reply: orchestrated.reply,
        actions: orchestrated.actions,
        stats
      });
    } catch (err) {
      console.error(err);
      jsonResponse(res, 500, { error: (err as Error).message });
    }
  });

  app.post('/api/operations/email', async (req, res) => {
    try {
      const correlationId = randomUUID();
      const result = await connectors.sendEmail({
        to: pickText(req.body?.to, 'investor@example.com'),
        subject: pickText(req.body?.subject, 'Owner requested outreach'),
        body: pickText(req.body?.body, 'Sending a quick business update.'),
        correlationId
      });
      await writeAuditEvent({
        correlationId,
        eventType: 'external_email_outreach',
        actor: 'owner',
        status: result.ok ? 'completed' : 'failed',
        payload: result as unknown as Record<string, unknown>
      });
      res.json({ correlationId, ...result });
    } catch (err) {
      jsonResponse(res, 500, { error: (err as Error).message });
    }
  });

  app.post('/api/operations/message', async (req, res) => {
    try {
      const correlationId = randomUUID();
      const result = await connectors.sendMessage({
        channel: pickText(req.body?.channel, 'slack'),
        message: pickText(req.body?.message, 'Autonomous CFO message'),
        correlationId
      });
      await writeAuditEvent({
        correlationId,
        eventType: 'external_message_notification',
        actor: 'owner',
        status: result.ok ? 'completed' : 'failed',
        payload: result as unknown as Record<string, unknown>
      });
      res.json({ correlationId, ...result });
    } catch (err) {
      jsonResponse(res, 500, { error: (err as Error).message });
    }
  });

  app.post('/api/operations/calendar-task', async (req, res) => {
    try {
      const correlationId = randomUUID();
      const result = await connectors.createCalendarTask({
        title: pickText(req.body?.title, 'Strategic follow-up'),
        dueDate: pickText(req.body?.dueDate, ''),
        notes: pickText(req.body?.notes, ''),
        correlationId
      });
      await writeAuditEvent({
        correlationId,
        eventType: 'external_calendar_task',
        actor: 'owner',
        status: result.ok ? 'completed' : 'failed',
        payload: result as unknown as Record<string, unknown>
      });
      res.json({ correlationId, ...result });
    } catch (err) {
      jsonResponse(res, 500, { error: (err as Error).message });
    }
  });

  app.post('/api/operations/crm', async (req, res) => {
    try {
      const correlationId = randomUUID();
      const entityType = pickText(req.body?.entityType, 'investor');
      const entityId = pickText(req.body?.entityId, randomUUID());
      const updates = (req.body?.updates || {}) as Record<string, unknown>;
      const result = await connectors.updateCrm({
        entityType,
        entityId,
        updates,
        correlationId
      });
      await pool.query(
        'INSERT INTO company_context (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
        [`crm:${entityType}:${entityId}`, JSON.stringify(updates)]
      );
      await writeAuditEvent({
        correlationId,
        eventType: 'external_crm_update',
        actor: 'owner',
        status: result.ok ? 'completed' : 'failed',
        payload: { ...result, entityType, entityId, updates }
      });
      res.json({ correlationId, ...result, entityType, entityId, updates });
    } catch (err) {
      jsonResponse(res, 500, { error: (err as Error).message });
    }
  });

  // Value Ledger & Billing Endpoints
  app.get('/api/value/summary', async (_req, res) => {
    try {
      const summary = await getCurrentPeriodSummary(pool);
      const entries = await getLedgerEntries(pool, summary.currentPeriod.id, 100);
      res.json({ ...summary, entries });
    } catch (err) {
      jsonResponse(res, 500, { error: (err as Error).message });
    }
  });

  app.get('/api/value/history', async (req, res) => {
    try {
      const months = Math.min(Number(req.query.months) || 12, 36);
      const history = await getValueHistory(pool, months);
      res.json(history);
    } catch (err) {
      jsonResponse(res, 500, { error: (err as Error).message });
    }
  });

  app.post('/api/value/verify/:entryId', async (req, res) => {
    try {
      const { entryId } = req.params;
      const { verified } = req.body;
      const ok = await markVerified(pool, entryId, verified !== false);
      if (!ok) {
        jsonResponse(res, 404, { error: 'Ledger entry not found' });
        return;
      }
      res.json({ ok: true, entryId, verified: verified !== false });
    } catch (err) {
      jsonResponse(res, 500, { error: (err as Error).message });
    }
  });

  app.post('/api/billing/close-period', async (req, res) => {
    try {
      const { periodId } = req.body;
      if (!periodId) {
        jsonResponse(res, 400, { error: 'periodId is required' });
        return;
      }
      const result = await closeBillingPeriod(pool, getStripe(), periodId);
      if (!result) {
        jsonResponse(res, 404, { error: 'Billing period not found' });
        return;
      }
      res.json(result);
    } catch (err) {
      jsonResponse(res, 500, { error: (err as Error).message });
    }
  });

  app.get('/api/billing/invoices', async (_req, res) => {
    try {
      const invoices = await getInvoices(pool);
      res.json({ invoices });
    } catch (err) {
      jsonResponse(res, 500, { error: (err as Error).message });
    }
  });

  // Opportunities Endpoints
  app.get('/api/opportunities', async (_req, res) => {
    try {
      const opportunities = await getOpenOpportunities(pool);
      res.json({ opportunities });
    } catch (err) {
      jsonResponse(res, 500, { error: (err as Error).message });
    }
  });

  app.post('/api/opportunities/scan', async (_req, res) => {
    try {
      const statsResult = await pool.query(
        `SELECT
          COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as total_cash,
          COALESCE(AVG(CASE WHEN amount < 0 THEN ABS(amount) ELSE NULL END) * 30, 0) as monthly_burn
        FROM transactions`
      );
      const totalCash = Number(statsResult.rows[0]?.total_cash) || 0;
      const monthlyBurn = Number(statsResult.rows[0]?.monthly_burn) || 1;
      const stats = {
        totalCash,
        monthlyBurn,
        runwayMonths: monthlyBurn > 0 ? totalCash / monthlyBurn : 999,
        healthScore: Math.min(100, Math.round((totalCash / Math.max(1, monthlyBurn * 6)) * 100)),
      };
      const found = await scanOpportunities(pool, stats);
      res.json({ scanned: true, newOpportunities: found.length, opportunities: found });
    } catch (err) {
      jsonResponse(res, 500, { error: (err as Error).message });
    }
  });

  app.post('/api/opportunities/:id/dismiss', async (req, res) => {
    try {
      const ok = await dismissOpportunity(pool, req.params.id);
      if (!ok) { jsonResponse(res, 404, { error: 'Opportunity not found' }); return; }
      res.json({ ok: true });
    } catch (err) {
      jsonResponse(res, 500, { error: (err as Error).message });
    }
  });

  // Stripe Payment Endpoint
  app.post('/api/payments/create-intent', async (req, res) => {
    const s = getStripe();
    if (!s) {
      jsonResponse(res, 400, { error: 'Stripe not configured' });
      return;
    }

    try {
      const { amount, currency = 'usd' } = req.body;
      const paymentIntent = await s.paymentIntents.create({
        amount,
        currency,
        automatic_payment_methods: { enabled: true }
      });
      res.json({ clientSecret: paymentIntent.client_secret });
    } catch (err) {
      jsonResponse(res, 500, { error: (err as Error).message });
    }
  });

  // Simulation APIs
  app.post('/api/simulations', async (req, res) => {
    const { scenario, result } = req.body;
    const id = randomUUID();
    const timestamp = new Date().toISOString();

    try {
      await pool.query('INSERT INTO simulations (id, timestamp, scenario, result) VALUES ($1, $2, $3, $4)', [
        id,
        timestamp,
        scenario || 'Custom Scenario',
        JSON.stringify(result || {})
      ]);
      res.json({ id, timestamp });
    } catch (err) {
      jsonResponse(res, 500, { error: (err as Error).message });
    }
  });

  app.post('/api/simulations/run', async (req, res) => {
    const { scenario = 'Custom Scenario', parameters = {} } = req.body || {};
    const stats = await fetchStatsSnapshot();
    const marketingSpend = safeNumber(parameters.marketingSpend);
    const hiring = safeNumber(parameters.hiring);
    const projectedBurn = stats.monthlyBurn + marketingSpend + hiring * 12000;
    const projectedRunway = projectedBurn === 0 ? 99 : stats.totalCash / projectedBurn;
    const analysis = `If you proceed with "${scenario}", projected burn becomes $${projectedBurn.toLocaleString()} and runway is approximately ${projectedRunway.toFixed(1)} months.`;

    try {
      await pool.query('INSERT INTO simulations (id, timestamp, scenario, result) VALUES ($1, $2, $3, $4)', [
        randomUUID(),
        new Date().toISOString(),
        scenario,
        JSON.stringify({
          input: parameters,
          projectedBurn,
          projectedRunway
        })
      ]);
      res.json({
        analysis,
        projectedBurn,
        projectedRunway
      });
    } catch (err) {
      jsonResponse(res, 500, { error: (err as Error).message });
    }
  });

  // Bills Management
  app.get('/api/bills', async (_req, res) => {
    try {
      const result = await pool.query('SELECT * FROM bills ORDER BY due_date ASC');
      res.json(result.rows);
    } catch (err) {
      jsonResponse(res, 500, { error: (err as Error).message });
    }
  });

  app.post('/api/bills/process', async (req, res) => {
    const { base64Image } = req.body;
    if (!base64Image) {
      jsonResponse(res, 400, { error: 'No image data provided' });
      return;
    }

    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          {
            parts: [
              {
                text: 'Extract vendor, amount, date, due_date, category, currency in JSON format. Return nulls when missing.'
              },
              { inlineData: { mimeType: 'image/jpeg', data: base64Image } }
            ]
          }
        ],
        config: { responseMimeType: 'application/json' }
      });

      const extracted = JSON.parse(response.text || '{}');
      const billId = randomUUID();
      await pool.query(
        'INSERT INTO bills (id, vendor, amount, date, due_date, category, status, extracted_data) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [
          billId,
          extracted.vendor,
          extracted.amount,
          extracted.date,
          extracted.due_date,
          extracted.category,
          'pending',
          JSON.stringify(extracted)
        ]
      );

      const approvalId = randomUUID();
      await pool.query(
        'INSERT INTO approvals (id, type, target_id, requested_at, status, requested_by) VALUES ($1, $2, $3, $4, $5, $6)',
        [approvalId, 'bill_payment', billId, new Date().toISOString(), 'pending', 'AI Agent']
      );
      await sendSlackNotification(
        `New bill from ${extracted.vendor || 'Unknown vendor'} for ${extracted.amount || 0} ${extracted.currency || 'USD'} requires approval.`
      );
      await writeAuditEvent({
        eventType: 'bill_processed',
        actor: 'autonomous_cfo',
        status: 'completed',
        payload: { billId, approvalId, extracted }
      });

      res.json({ id: billId, extracted, approvalId });
    } catch (err) {
      console.error(err);
      jsonResponse(res, 500, { error: (err as Error).message });
    }
  });

  // Approvals Management
  app.get('/api/approvals', async (_req, res) => {
    try {
      const result = await pool.query(`
        SELECT a.*, b.vendor, b.amount, b.due_date
        FROM approvals a
        LEFT JOIN bills b ON a.target_id = b.id
        WHERE a.status = 'pending'
      `);
      res.json(result.rows);
    } catch (err) {
      jsonResponse(res, 500, { error: (err as Error).message });
    }
  });

  app.post('/api/approvals/:id/respond', async (req, res) => {
    const { id } = req.params;
    const { status, note } = req.body;

    try {
      const approval = await pool.query('SELECT * FROM approvals WHERE id = $1', [id]);
      if (approval.rows.length === 0) {
        jsonResponse(res, 404, { error: 'Approval not found' });
        return;
      }

      await pool.query('UPDATE approvals SET status = $1, approver_note = $2 WHERE id = $3', [status, note, id]);

      if (approval.rows[0].type === 'bill_payment') {
        await pool.query('UPDATE bills SET status = $1 WHERE id = $2', [
          status === 'approved' ? 'approved' : 'rejected',
          approval.rows[0].target_id
        ]);
      }

      await writeAuditEvent({
        eventType: 'approval_response',
        actor: 'owner',
        status,
        payload: { id, note: note || null }
      });
      await sendSlackNotification(`Approval request for ${approval.rows[0].type} was ${status}.`);
      res.json({ success: true });
    } catch (err) {
      jsonResponse(res, 500, { error: (err as Error).message });
    }
  });

  // Fundraising & Treasury APIs
  app.get('/api/investors', async (_req, res) => {
    try {
      const result = await pool.query('SELECT * FROM investors ORDER BY name ASC');
      res.json(result.rows);
    } catch {
      jsonResponse(res, 500, { error: 'Database error' });
    }
  });

  app.post('/api/investors', async (req, res) => {
    const { id, name, firm, stage, focus, status } = req.body;
    try {
      await pool.query(
        'INSERT INTO investors (id, name, firm, stage, focus, status, last_contact) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [id || randomUUID(), name, firm, stage, focus, status, new Date().toISOString()]
      );
      await writeAuditEvent({
        eventType: 'investor_created',
        actor: 'owner',
        status: 'completed',
        payload: { name, firm, stage, status }
      });
      res.status(201).json({ success: true });
    } catch {
      jsonResponse(res, 500, { error: 'Database error' });
    }
  });

  app.get('/api/treasury/strategies', async (_req, res) => {
    try {
      const result = await pool.query('SELECT * FROM treasury_strategies ORDER BY potential_yield DESC');
      if (result.rows.length === 0) {
        const defaultStrategies = [
          {
            id: '1',
            name: 'High-Yield Cash Account',
            description: 'Move idle cash to a 4.5% APY account.',
            potential_yield: 4.5,
            risk_level: 'Low',
            status: 'Proposed'
          },
          {
            id: '2',
            name: 'Tax Reserve Allocation',
            description: 'Automatically set aside 25% of revenue for quarterly taxes.',
            potential_yield: 0,
            risk_level: 'None',
            status: 'Active'
          },
          {
            id: '3',
            name: 'Short-term T-Bills',
            description: 'Invest excess runway (6m+) into 3-month Treasury Bills.',
            potential_yield: 5.2,
            risk_level: 'Low',
            status: 'Proposed'
          }
        ];
        for (const strategy of defaultStrategies) {
          await pool.query(
            'INSERT INTO treasury_strategies (id, name, description, potential_yield, risk_level, status) VALUES ($1, $2, $3, $4, $5, $6)',
            [strategy.id, strategy.name, strategy.description, strategy.potential_yield, strategy.risk_level, strategy.status]
          );
        }
        res.json(defaultStrategies);
        return;
      }
      res.json(result.rows);
    } catch {
      jsonResponse(res, 500, { error: 'Database error' });
    }
  });

  app.post('/api/treasury/strategies/:id/activate', async (req, res) => {
    const { id } = req.params;
    try {
      await pool.query('UPDATE treasury_strategies SET status = $1, last_executed = $2 WHERE id = $3', [
        'Active',
        new Date().toISOString(),
        id
      ]);
      await writeAuditEvent({
        eventType: 'treasury_strategy_activated',
        actor: 'owner',
        status: 'completed',
        payload: { strategyId: id }
      });
      res.json({ success: true });
    } catch {
      jsonResponse(res, 500, { error: 'Database error' });
    }
  });

  app.post('/api/fundraising/analyze', async (req, res) => {
    const { transactions, budgets, companyContext } = req.body;
    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      const prompt = `
As an AI Fundraising Advisor, analyze:
Company Context: ${JSON.stringify(companyContext)}
Recent Transactions: ${JSON.stringify(transactions)}
Budgets: ${JSON.stringify(budgets)}
Provide markdown with runway, timing, target raise, investor profile, and outreach draft.
      `;
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{ parts: [{ text: prompt }] }]
      });
      res.json({ analysis: response.text });
    } catch {
      jsonResponse(res, 500, { error: 'AI Analysis failed' });
    }
  });

  app.post('/api/treasury/optimize', async (req, res) => {
    const { cashBalance, monthlyBurn, currentStrategies } = req.body;
    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      const prompt = `
As an AI Treasury Manager:
Cash Balance: $${cashBalance}
Monthly Burn: $${monthlyBurn}
Current Strategies: ${JSON.stringify(currentStrategies)}
Return JSON array with 3 strategy recommendations.
      `;
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{ parts: [{ text: prompt }] }],
        config: { responseMimeType: 'application/json' }
      });
      res.json(JSON.parse(response.text || '[]'));
    } catch {
      jsonResponse(res, 500, { error: 'AI Optimization failed' });
    }
  });

  app.post('/api/seed', async (_req, res) => {
    const seedTransactions = [
      {
        id: '1',
        date: '2024-03-01',
        amount: 125000,
        category: 'Revenue',
        merchant: 'Stripe Payout',
        status: 'completed',
        account_id: 'main'
      },
      {
        id: '2',
        date: '2024-03-02',
        amount: -15000,
        category: 'Payroll',
        merchant: 'Gusto',
        status: 'completed',
        account_id: 'main'
      },
      {
        id: '3',
        date: '2024-03-03',
        amount: -2500,
        category: 'Software',
        merchant: 'AWS',
        status: 'completed',
        account_id: 'main'
      },
      {
        id: '4',
        date: '2024-03-04',
        amount: -1200,
        category: 'Marketing',
        merchant: 'Meta Ads',
        status: 'completed',
        account_id: 'main'
      },
      {
        id: '5',
        date: '2024-03-05',
        amount: -450,
        category: 'Software',
        merchant: 'Slack',
        status: 'completed',
        account_id: 'main'
      }
    ];

    const seedInvestors = [
      {
        id: '1',
        name: 'Sarah Chen',
        firm: 'Sequoia Capital',
        stage: 'Series A',
        focus: 'Enterprise SaaS',
        status: 'Interested'
      },
      {
        id: '2',
        name: 'Marc Andreessen',
        firm: 'a16z',
        stage: 'Seed/A',
        focus: 'AI/Infrastructure',
        status: 'Lead'
      },
      { id: '3', name: 'Elad Gil', firm: 'Solo GP', stage: 'Seed', focus: 'Growth/AI', status: 'Contacted' }
    ];

    try {
      for (const tx of seedTransactions) {
        await pool.query(
          `
          INSERT INTO transactions (id, date, amount, category, merchant, status, account_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id) DO UPDATE SET amount = EXCLUDED.amount
          `,
          [tx.id, tx.date, tx.amount, tx.category, tx.merchant, tx.status, tx.account_id]
        );
      }

      for (const inv of seedInvestors) {
        await pool.query(
          `
          INSERT INTO investors (id, name, firm, stage, focus, status, last_contact)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id) DO NOTHING
          `,
          [inv.id, inv.name, inv.firm, inv.stage, inv.focus, inv.status, new Date().toISOString()]
        );
      }
      res.json({ message: 'Database seeded successfully' });
    } catch (err) {
      jsonResponse(res, 500, { error: (err as Error).message });
    }
  });

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  } else if (process.env.NODE_ENV !== 'test') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  }

  return app;
}

async function startServer() {
  const app = await createApp();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Autonomous CFO Server running on http://localhost:${PORT}`);
  });
}

if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export { createApp };
