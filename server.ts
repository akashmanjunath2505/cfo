import express from 'express';
import { createServer as createViteServer } from 'vite';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import Stripe from 'stripe';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_Ssog1aLZCGE2@ep-little-bread-aiboengh-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

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
        impact_score REAL
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
        status TEXT, -- 'pending', 'approved', 'paid', 'rejected'
        file_url TEXT,
        extracted_data JSONB
      );

      CREATE TABLE IF NOT EXISTS approvals (
        id TEXT PRIMARY KEY,
        type TEXT, -- 'bill_payment', 'budget_change', 'allocation'
        target_id TEXT,
        requested_at TEXT,
        status TEXT, -- 'pending', 'approved', 'rejected'
        requested_by TEXT,
        approver_note TEXT
      );

      CREATE TABLE IF NOT EXISTS investors (
        id TEXT PRIMARY KEY,
        name TEXT,
        firm TEXT,
        stage TEXT, -- 'Seed', 'Series A', etc.
        focus TEXT,
        last_contact TEXT,
        status TEXT -- 'Lead', 'Interested', 'Passed', 'Contacted'
      );

      CREATE TABLE IF NOT EXISTS treasury_strategies (
        id TEXT PRIMARY KEY,
        name TEXT,
        description TEXT,
        potential_yield REAL,
        risk_level TEXT,
        status TEXT, -- 'Active', 'Inactive', 'Proposed'
        last_executed TEXT
      );
    `);
  } finally {
    client.release();
  }
};

async function startServer() {
  await initDb();
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/api/transactions', async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM transactions ORDER BY date DESC LIMIT 100');
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/stats', async (req, res) => {
    try {
      const totalCashRes = await pool.query('SELECT SUM(amount) as total FROM transactions');
      const monthlyBurnRes = await pool.query("SELECT SUM(amount) as total FROM transactions WHERE amount < 0 AND date > TO_CHAR(NOW() - INTERVAL '30 days', 'YYYY-MM-DD')");
      
      const totalCash = parseFloat(totalCashRes.rows[0].total || '0');
      const monthlyBurn = Math.abs(parseFloat(monthlyBurnRes.rows[0].total || '0'));
      const runway = monthlyBurn === 0 ? 99 : totalCash / monthlyBurn;
      
      res.json({
        totalCash,
        monthlyBurn,
        runwayMonths: runway,
        healthScore: 88
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Stripe Payment Endpoint
  app.post('/api/payments/create-intent', async (req, res) => {
    const s = getStripe();
    if (!s) return res.status(400).json({ error: 'Stripe not configured' });

    try {
      const { amount, currency = 'usd' } = req.body;
      const paymentIntent = await s.paymentIntents.create({
        amount,
        currency,
        automatic_payment_methods: { enabled: true },
      });
      res.json({ clientSecret: paymentIntent.client_secret });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Simulation API
  app.post('/api/simulations', async (req, res) => {
    const { scenario, result } = req.body;
    const id = Math.random().toString(36).substr(2, 9);
    const timestamp = new Date().toISOString();
    
    try {
      await pool.query(
        'INSERT INTO simulations (id, timestamp, scenario, result) VALUES ($1, $2, $3, $4)',
        [id, timestamp, scenario, JSON.stringify(result)]
      );
      res.json({ id, timestamp });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // --- Phase 2: Semi-Autonomous Features ---

  // Slack Notification Helper
  const sendSlackNotification = async (message: string) => {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) {
      console.log('Slack webhook not configured, skipping notification:', message);
      return;
    }
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `🚀 *AutoCFO Alert*: ${message}` }),
      });
    } catch (err) {
      console.error('Failed to send Slack notification:', err);
    }
  };

  // Bills Management
  app.get('/api/bills', async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM bills ORDER BY due_date ASC');
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/bills/process', async (req, res) => {
    const { base64Image, fileName } = req.body;
    if (!base64Image) return res.status(400).json({ error: 'No image data provided' });

    try {
      // Use Gemini for OCR and Extraction
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              { text: "Extract the following details from this bill/invoice in JSON format: vendor, amount, date, due_date, category, currency. If any field is missing, return null." },
              { inlineData: { mimeType: "image/jpeg", data: base64Image } }
            ]
          }
        ],
        config: { responseMimeType: "application/json" }
      });

      const extracted = JSON.parse(response.text || '{}');
      const id = Math.random().toString(36).substr(2, 9);
      
      await pool.query(
        'INSERT INTO bills (id, vendor, amount, date, due_date, category, status, extracted_data) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [id, extracted.vendor, extracted.amount, extracted.date, extracted.due_date, extracted.category, 'pending', JSON.stringify(extracted)]
      );

      // Create an approval request automatically
      const approvalId = Math.random().toString(36).substr(2, 9);
      await pool.query(
        'INSERT INTO approvals (id, type, target_id, requested_at, status, requested_by) VALUES ($1, $2, $3, $4, $5, $6)',
        [approvalId, 'bill_payment', id, new Date().toISOString(), 'pending', 'AI Agent']
      );

      await sendSlackNotification(`New bill from *${extracted.vendor}* for *${extracted.amount} ${extracted.currency || 'USD'}* requires approval. Check the dashboard.`);

      res.json({ id, extracted, approvalId });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Approvals Management
  app.get('/api/approvals', async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT a.*, b.vendor, b.amount, b.due_date 
        FROM approvals a 
        LEFT JOIN bills b ON a.target_id = b.id 
        WHERE a.status = 'pending'
      `);
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/approvals/:id/respond', async (req, res) => {
    const { id } = req.params;
    const { status, note } = req.body; // 'approved' or 'rejected'

    try {
      const approval = await pool.query('SELECT * FROM approvals WHERE id = $1', [id]);
      if (approval.rows.length === 0) return res.status(404).json({ error: 'Approval not found' });

      await pool.query(
        'UPDATE approvals SET status = $1, approver_note = $2 WHERE id = $3',
        [status, note, id]
      );

      if (approval.rows[0].type === 'bill_payment') {
        await pool.query(
          'UPDATE bills SET status = $1 WHERE id = $2',
          [status === 'approved' ? 'approved' : 'rejected', approval.rows[0].target_id]
        );
      }

      await sendSlackNotification(`Approval request for *${approval.rows[0].type}* was *${status}*.`);

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Phase 3: Fundraising & Treasury API
  app.get('/api/investors', async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM investors ORDER BY name ASC');
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.post('/api/investors', async (req, res) => {
    const { id, name, firm, stage, focus, status } = req.body;
    try {
      await pool.query(
        'INSERT INTO investors (id, name, firm, stage, focus, status, last_contact) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [id, name, firm, stage, focus, status, new Date().toISOString()]
      );
      res.status(201).json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.get('/api/treasury/strategies', async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM treasury_strategies ORDER BY potential_yield DESC');
      // If empty, seed with some default strategies
      if (result.rows.length === 0) {
        const defaultStrategies = [
          { id: '1', name: 'High-Yield Cash Account', description: 'Move idle cash to a 4.5% APY account.', potential_yield: 4.5, risk_level: 'Low', status: 'Proposed' },
          { id: '2', name: 'Tax Reserve Allocation', description: 'Automatically set aside 25% of revenue for quarterly taxes.', potential_yield: 0, risk_level: 'None', status: 'Active' },
          { id: '3', name: 'Short-term T-Bills', description: 'Invest excess runway (6m+) into 3-month Treasury Bills.', potential_yield: 5.2, risk_level: 'Low', status: 'Proposed' }
        ];
        for (const s of defaultStrategies) {
          await pool.query(
            'INSERT INTO treasury_strategies (id, name, description, potential_yield, risk_level, status) VALUES ($1, $2, $3, $4, $5, $6)',
            [s.id, s.name, s.description, s.potential_yield, s.risk_level, s.status]
          );
        }
        return res.json(defaultStrategies);
      }
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.post('/api/treasury/strategies/:id/activate', async (req, res) => {
    const { id } = req.params;
    try {
      await pool.query(
        'UPDATE treasury_strategies SET status = $1 WHERE id = $2',
        ['Active', id]
      );
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.post('/api/fundraising/analyze', async (req, res) => {
    const { transactions, budgets, companyContext } = req.body;
    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      
      const prompt = `
        As an AI Fundraising Advisor, analyze the following startup financials and context:
        Company Context: ${JSON.stringify(companyContext)}
        Recent Transactions: ${JSON.stringify(transactions)}
        Budgets: ${JSON.stringify(budgets)}
        
        Provide a detailed Fundraising Strategy including:
        1. Current Runway Estimate.
        2. Recommended Raising Timeline (When to start).
        3. Target Raise Amount and Valuation Range.
        4. Investor Profile (Who to target).
        5. Pitch Deck Focus (What metrics to highlight).
        6. A draft investor outreach email.
        
        Format the output in Markdown.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{ parts: [{ text: prompt }] }]
      });

      res.json({ analysis: response.text });
    } catch (err) {
      res.status(500).json({ error: 'AI Analysis failed' });
    }
  });

  app.post('/api/treasury/optimize', async (req, res) => {
    const { cashBalance, monthlyBurn, currentStrategies } = req.body;
    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      
      const prompt = `
        As an AI Treasury Manager, optimize the following:
        Cash Balance: $${cashBalance}
        Monthly Burn: $${monthlyBurn}
        Current Strategies: ${JSON.stringify(currentStrategies)}
        
        Provide 3 specific recommendations to optimize yield, manage risk, or automate tax compliance.
        Format as a JSON array of objects: [{ "name": string, "description": string, "potential_yield": number, "risk_level": string }]
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{ parts: [{ text: prompt }] }],
        config: { responseMimeType: 'application/json' }
      });

      res.json(JSON.parse(response.text));
    } catch (err) {
      res.status(500).json({ error: 'AI Optimization failed' });
    }
  });

  app.post('/api/seed', async (req, res) => {
    const seedTransactions = [
      { id: '1', date: '2024-03-01', amount: 125000, category: 'Revenue', merchant: 'Stripe Payout', status: 'completed', account_id: 'main' },
      { id: '2', date: '2024-03-02', amount: -15000, category: 'Payroll', merchant: 'Gusto', status: 'completed', account_id: 'main' },
      { id: '3', date: '2024-03-03', amount: -2500, category: 'Software', merchant: 'AWS', status: 'completed', account_id: 'main' },
      { id: '4', date: '2024-03-04', amount: -1200, category: 'Marketing', merchant: 'Meta Ads', status: 'completed', account_id: 'main' },
      { id: '5', date: '2024-03-05', amount: -450, category: 'Software', merchant: 'Slack', status: 'completed', account_id: 'main' },
    ];

    const seedInvestors = [
      { id: '1', name: 'Sarah Chen', firm: 'Sequoia Capital', stage: 'Series A', focus: 'Enterprise SaaS', status: 'Interested' },
      { id: '2', name: 'Marc Andreessen', firm: 'a16z', stage: 'Seed/A', focus: 'AI/Infrastructure', status: 'Lead' },
      { id: '3', name: 'Elad Gil', firm: 'Solo GP', stage: 'Seed', focus: 'Growth/AI', status: 'Contacted' }
    ];

    try {
      for (const tx of seedTransactions) {
        await pool.query(
          'INSERT INTO transactions (id, date, amount, category, merchant, status, account_id) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO UPDATE SET amount = EXCLUDED.amount',
          [tx.id, tx.date, tx.amount, tx.category, tx.merchant, tx.status, tx.account_id]
        );
      }

      for (const inv of seedInvestors) {
        await pool.query(
          'INSERT INTO investors (id, name, firm, stage, focus, status, last_contact) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING',
          [inv.id, inv.name, inv.firm, inv.stage, inv.focus, inv.status, new Date().toISOString()]
        );
      }
      res.json({ message: 'Database seeded successfully' });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Autonomous CFO Server running on http://localhost:${PORT}`);
  });
}

startServer();
