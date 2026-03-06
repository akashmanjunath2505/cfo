import { GoogleGenAI } from '@google/genai';
import type { DecisionEnvelope, FinancialSnapshot, OrchestratorContext } from './types.ts';

const safeNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const pickText = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);

const estimateResearchBudget = (stats: FinancialSnapshot) => {
  const maxComfortable = Math.max(0, Math.min(stats.totalCash * 0.05, stats.monthlyBurn * 0.3 || stats.totalCash * 0.02));
  return Math.round(maxComfortable);
};

const fallbackDecision = (message: string, stats: FinancialSnapshot): DecisionEnvelope => {
  const lower = message.toLowerCase();
  if (lower.includes('research') || lower.includes('protein')) {
    const amount = estimateResearchBudget(stats);
    return {
      reply: `We can afford targeted research. Start with $${amount.toLocaleString()} now and review in 30 days based on measurable outcomes.`,
      actions: [
        {
          type: 'allocate_research_budget',
          rationale: 'Controlled spend protects runway while enabling experimentation.',
          confidence: 0.82,
          expectedImpactUsd: -amount,
          parameters: { amount, budgetName: 'Protein Research', reviewInDays: 30 }
        }
      ]
    };
  }
  if (lower.includes('email') || lower.includes('reach out') || lower.includes('outreach')) {
    return {
      reply: 'I can start outreach now. I will draft and send a concise owner-approved style update.',
      actions: [
        {
          type: 'send_email_outreach',
          rationale: 'Proactive outreach keeps stakeholders aligned.',
          confidence: 0.76,
          expectedImpactUsd: 0,
          parameters: {
            to: 'investor@example.com',
            subject: 'Quarterly update',
            body: 'Sharing our latest metrics and next milestones.'
          }
        }
      ]
    };
  }

  return {
    reply: 'Understood. I can plan and execute this autonomously with clear audit trail and rollback metadata.',
    actions: []
  };
};

export const buildDecisionPlan = async (ctx: OrchestratorContext): Promise<DecisionEnvelope> => {
  if (!process.env.GEMINI_API_KEY) {
    return fallbackDecision(ctx.message, ctx.stats);
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const prompt = `
You are an autonomous CFO. Return strict JSON:
{
  "reply":"string",
  "actions":[
    {
      "type":"allocate_research_budget|activate_treasury_strategy|respond_approval|create_investor|run_simulation|send_email_outreach|send_message_notification|create_calendar_task|update_crm_pipeline|create_payment_intent",
      "rationale":"string",
      "confidence":0.0,
      "expectedImpactUsd":0,
      "parameters":{}
    }
  ]
}

Rules:
- Keep response executive and human.
- Prefer concrete actions over generic advice.
- Use small reversible first steps when uncertain.
- Include at most 3 actions.

Stats: ${JSON.stringify(ctx.stats)}
Context: ${JSON.stringify(ctx.companyContext)}
Memory: ${JSON.stringify(ctx.memory.slice(-8))}
OwnerMessage: ${ctx.message}
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ parts: [{ text: prompt }] }],
      config: { responseMimeType: 'application/json' }
    });

    const parsed = JSON.parse(response.text || '{}') as Partial<DecisionEnvelope>;
    const normalized = (Array.isArray(parsed.actions) ? parsed.actions : []).map((action: any) => ({
      type: pickText(action.type),
      rationale: pickText(action.rationale, 'No rationale provided.'),
      confidence: Math.max(0, Math.min(1, safeNumber(action.confidence))),
      expectedImpactUsd: safeNumber(action.expectedImpactUsd),
      parameters: (action.parameters || {}) as Record<string, unknown>
    }));
    return {
      reply: pickText(parsed.reply, fallbackDecision(ctx.message, ctx.stats).reply),
      actions: normalized as DecisionEnvelope['actions']
    };
  } catch {
    return fallbackDecision(ctx.message, ctx.stats);
  }
};
