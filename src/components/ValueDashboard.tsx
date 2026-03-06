import { useEffect, useState, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts';
import { CheckCircle2, XCircle, DollarSign, TrendingUp, FileText, Loader2, Lightbulb } from 'lucide-react';
import { apiFetch } from '../lib/apiClient';
import type { ValueSummary, ValueLedgerEntry, BillingPeriod, ValueCategory, Opportunity } from '../types';

const CATEGORY_LABELS: Record<ValueCategory, string> = {
  budget_optimization: 'Budget Optimization',
  treasury_yield: 'Treasury Yield',
  cost_avoidance: 'Cost Avoidance',
  bill_negotiation: 'Bill Negotiation',
  time_savings: 'Time Savings',
  revenue_recovery: 'Revenue Recovery',
};

const CATEGORY_COLORS: Record<ValueCategory, string> = {
  budget_optimization: '#10b981',
  treasury_yield: '#6366f1',
  cost_avoidance: '#f59e0b',
  bill_negotiation: '#ec4899',
  time_savings: '#06b6d4',
  revenue_recovery: '#8b5cf6',
};

const formatUsd = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export function ValueDashboard() {
  const [summary, setSummary] = useState<ValueSummary | null>(null);
  const [history, setHistory] = useState<{ periods: BillingPeriod[]; entries: ValueLedgerEntry[] } | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [closingPeriod, setClosingPeriod] = useState(false);

  const load = useCallback(async () => {
    try {
      const [sumRes, histRes, oppRes] = await Promise.all([
        apiFetch('/api/value/summary'),
        apiFetch('/api/value/history?months=12'),
        apiFetch('/api/opportunities'),
      ]);
      if (sumRes.ok) setSummary(await sumRes.json() as ValueSummary);
      if (histRes.ok) setHistory(await histRes.json() as { periods: BillingPeriod[]; entries: ValueLedgerEntry[] });
      if (oppRes.ok) {
        const data = await oppRes.json();
        setOpportunities((data as { opportunities: Opportunity[] }).opportunities || []);
      }
    } catch { /* network error */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleVerify = async (entryId: string, verified: boolean) => {
    await apiFetch(`/api/value/verify/${entryId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verified }),
    });
    load();
  };

  const handleClosePeriod = async () => {
    if (!summary) return;
    setClosingPeriod(true);
    await apiFetch('/api/billing/close-period', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ periodId: summary.currentPeriod.id }),
    });
    setClosingPeriod(false);
    load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-white/40" size={32} />
      </div>
    );
  }

  const categoryData = summary
    ? (Object.entries(summary.categoryBreakdown) as [ValueCategory, number][])
        .filter(([, v]) => v > 0)
        .map(([cat, val]) => ({
          name: CATEGORY_LABELS[cat],
          value: Math.round(val),
          fill: CATEGORY_COLORS[cat],
        }))
    : [];

  const roiData = history
    ? history.periods
        .slice()
        .reverse()
        .map((p) => ({
          period: p.id,
          value: Math.round(p.gross_value_usd),
          fee: Math.round(p.fee_amount_usd),
        }))
    : [];

  return (
    <div className="space-y-6">
      {/* Hero ROI Card */}
      {summary && (
        <div className="bg-gradient-to-br from-emerald-500/10 to-indigo-500/10 border border-emerald-500/20 rounded-3xl p-8">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-white/50 text-sm font-medium mb-1">Value Delivered This Month</p>
              <p className="text-4xl font-bold text-emerald-400">{formatUsd(summary.grossValueUsd)}</p>
              <p className="text-white/40 text-sm mt-2">
                Your fee: <span className="text-white/70 font-semibold">{formatUsd(summary.feeAmountUsd)}</span>
                <span className="text-white/30 ml-1">({summary.feePercentage}% savings-share)</span>
              </p>
            </div>
            <div className="bg-emerald-500/20 rounded-2xl p-4">
              <TrendingUp size={28} className="text-emerald-400" />
            </div>
          </div>
          <div className="flex gap-6 mt-6 text-sm">
            <div>
              <p className="text-white/40">Entries</p>
              <p className="font-semibold">{summary.entryCount}</p>
            </div>
            <div>
              <p className="text-white/40">Verified</p>
              <p className="font-semibold text-emerald-400">{summary.verifiedCount}</p>
            </div>
            <div>
              <p className="text-white/40">Period</p>
              <p className="font-semibold">{summary.currentPeriod.id}</p>
            </div>
            <div>
              <p className="text-white/40">Status</p>
              <p className="font-semibold capitalize">{summary.currentPeriod.status}</p>
            </div>
          </div>
        </div>
      )}

      {/* Category Breakdown + ROI History side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Breakdown */}
        <div className="bg-[#0F0F11] border border-white/5 rounded-3xl p-6">
          <h3 className="font-bold mb-4 flex items-center gap-2">
            <DollarSign size={18} className="text-emerald-400" />
            Value by Category
          </h3>
          {categoryData.length === 0 ? (
            <p className="text-sm text-white/30">No value recorded yet this period.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={categoryData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <XAxis type="number" tickFormatter={(v: number) => `$${v}`} tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 12 }} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }} />
                <Tooltip
                  formatter={(v: number) => formatUsd(v)}
                  contentStyle={{ background: '#1a1a1d', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                  labelStyle={{ color: 'rgba(255,255,255,0.7)' }}
                />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ROI Over Time */}
        <div className="bg-[#0F0F11] border border-white/5 rounded-3xl p-6">
          <h3 className="font-bold mb-4 flex items-center gap-2">
            <TrendingUp size={18} className="text-indigo-400" />
            Value vs. Fee Over Time
          </h3>
          {roiData.length === 0 ? (
            <p className="text-sm text-white/30">No historical data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={roiData} margin={{ left: 10, right: 20 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="period" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 12 }} />
                <YAxis tickFormatter={(v: number) => `$${v}`} tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 12 }} />
                <Tooltip
                  formatter={(v: number) => formatUsd(v)}
                  contentStyle={{ background: '#1a1a1d', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                  labelStyle={{ color: 'rgba(255,255,255,0.7)' }}
                />
                <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} dot={false} name="Value Delivered" />
                <Line type="monotone" dataKey="fee" stroke="#6366f1" strokeWidth={2} dot={false} name="Fee" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Proactive Opportunities */}
      {opportunities.length > 0 && (
        <div className="bg-[#0F0F11] border border-amber-500/20 rounded-3xl p-6">
          <h3 className="font-bold mb-4 flex items-center gap-2">
            <Lightbulb size={18} className="text-amber-400" />
            Savings Opportunities
          </h3>
          <div className="space-y-3">
            {opportunities.filter(o => o.status === 'open').slice(0, 5).map((opp) => (
              <div key={opp.id} className="flex items-start justify-between p-3 bg-white/[0.02] rounded-xl border border-white/5">
                <div>
                  <p className="text-sm font-medium">{opp.title}</p>
                  <p className="text-xs text-white/40 mt-1">{opp.description}</p>
                </div>
                <span className="text-emerald-400 font-semibold text-sm whitespace-nowrap ml-4">
                  +{formatUsd(opp.estimated_value_usd)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ledger Table */}
      {summary && summary.entries.length > 0 && (
        <div className="bg-[#0F0F11] border border-white/5 rounded-3xl p-6">
          <h3 className="font-bold mb-4 flex items-center gap-2">
            <FileText size={18} className="text-white/60" />
            Value Ledger
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-white/40 border-b border-white/5">
                  <th className="text-left py-2 pr-4">Date</th>
                  <th className="text-left py-2 pr-4">Category</th>
                  <th className="text-left py-2 pr-4">Description</th>
                  <th className="text-right py-2 pr-4">Value</th>
                  <th className="text-center py-2">Status</th>
                  <th className="text-center py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {summary.entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 pr-4 text-white/50">
                      {new Date(entry.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className="inline-block px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{
                          backgroundColor: `${CATEGORY_COLORS[entry.category]}20`,
                          color: CATEGORY_COLORS[entry.category],
                        }}
                      >
                        {CATEGORY_LABELS[entry.category]}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-white/70 max-w-xs truncate">{entry.description}</td>
                    <td className="py-3 pr-4 text-right font-semibold text-emerald-400">
                      {formatUsd(entry.gross_value_usd)}
                    </td>
                    <td className="py-3 text-center">
                      {entry.verified ? (
                        <CheckCircle2 size={16} className="text-emerald-400 inline" />
                      ) : (
                        <span className="text-white/30 text-xs">Unverified</span>
                      )}
                    </td>
                    <td className="py-3 text-center">
                      {!entry.verified ? (
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleVerify(entry.id, true)}
                            className="p-1 rounded-lg hover:bg-emerald-500/20 transition-colors"
                            title="Verify"
                          >
                            <CheckCircle2 size={14} className="text-emerald-400" />
                          </button>
                          <button
                            onClick={() => handleVerify(entry.id, false)}
                            className="p-1 rounded-lg hover:bg-red-500/20 transition-colors"
                            title="Dispute"
                          >
                            <XCircle size={14} className="text-red-400" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-white/20 text-xs">--</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Billing Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Close Period */}
        {summary && summary.currentPeriod.status === 'open' && (
          <div className="bg-[#0F0F11] border border-white/5 rounded-3xl p-6">
            <h3 className="font-bold mb-3">Close Current Period</h3>
            <p className="text-sm text-white/40 mb-4">
              Finalize billing for <span className="text-white/70">{summary.currentPeriod.id}</span>.
              Total value: {formatUsd(summary.grossValueUsd)}, fee: {formatUsd(summary.feeAmountUsd)}.
            </p>
            <button
              onClick={handleClosePeriod}
              disabled={closingPeriod || summary.grossValueUsd === 0}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-sm font-medium transition-colors"
            >
              {closingPeriod ? 'Closing...' : 'Close & Generate Invoice'}
            </button>
          </div>
        )}

        {/* Past Invoices */}
        {history && history.periods.filter(p => p.status !== 'open').length > 0 && (
          <div className="bg-[#0F0F11] border border-white/5 rounded-3xl p-6">
            <h3 className="font-bold mb-3">Past Invoices</h3>
            <div className="space-y-2">
              {history.periods.filter(p => p.status !== 'open').map((p) => (
                <div key={p.id} className="flex items-center justify-between p-3 bg-white/[0.02] rounded-xl border border-white/5">
                  <div>
                    <p className="text-sm font-medium">{p.id}</p>
                    <p className="text-xs text-white/40 capitalize">{p.status}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{formatUsd(p.fee_amount_usd)}</p>
                    <p className="text-xs text-white/40">of {formatUsd(p.gross_value_usd)} value</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
