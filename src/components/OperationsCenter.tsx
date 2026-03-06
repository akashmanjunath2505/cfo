import { useState } from 'react';
import { apiFetch } from '../lib/apiClient';
import type { ExternalOperationResult } from '../types';

export function OperationsCenter() {
  const [result, setResult] = useState<ExternalOperationResult | null>(null);

  const run = async (url: string, payload: Record<string, unknown>) => {
    const res = await apiFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-idempotency-key': crypto.randomUUID() },
      body: JSON.stringify(payload)
    });
    const data = (await res.json()) as ExternalOperationResult;
    setResult(data);
  };

  return (
    <div className="bg-[#0F0F11] border border-white/5 rounded-3xl p-6">
      <h3 className="font-bold mb-4">Operations Center</h3>
      <div className="grid grid-cols-2 gap-3">
        <button className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-sm" onClick={() => run('/api/operations/email', { to: 'investor@example.com', subject: 'CFO update', body: 'Growth milestones achieved.' })}>
          Send Email
        </button>
        <button className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-sm" onClick={() => run('/api/operations/message', { channel: 'slack', message: 'Cash runway updated.' })}>
          Send Message
        </button>
        <button className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-sm" onClick={() => run('/api/operations/calendar-task', { title: 'Investor follow-up', dueDate: new Date(Date.now() + 86400000).toISOString() })}>
          Create Task
        </button>
        <button className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-sm" onClick={() => run('/api/operations/crm', { entityType: 'investor', entityId: 'pipeline-1', updates: { stage: 'Interested' } })}>
          Update CRM
        </button>
      </div>
      {result ? (
        <p className={`text-xs mt-4 ${result.ok ? 'text-emerald-400' : 'text-red-400'}`}>
          {result.detail} ({result.provider}) [{result.correlationId?.slice(0, 8)}]
        </p>
      ) : null}
    </div>
  );
}
