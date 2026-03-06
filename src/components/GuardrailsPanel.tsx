import { useEffect, useState } from 'react';
import type { GuardrailsConfig } from '../types';
import { apiFetch } from '../lib/apiClient';

export function GuardrailsPanel() {
  const [config, setConfig] = useState<GuardrailsConfig | null>(null);

  useEffect(() => {
    const load = async () => {
      const res = await apiFetch('/api/guardrails');
      if (!res.ok) return;
      const data = (await res.json()) as GuardrailsConfig;
      setConfig(data);
    };
    load();
  }, []);

  return (
    <div className="bg-[#0F0F11] border border-white/5 rounded-3xl p-6">
      <h3 className="font-bold mb-4">Guardrails</h3>
      {!config ? (
        <p className="text-sm text-white/30">Loading policy...</p>
      ) : (
        <div className="space-y-2 text-sm">
          <p>Autonomy: <span className={config.autonomyEnabled ? 'text-emerald-400' : 'text-red-400'}>{config.autonomyEnabled ? 'Enabled' : 'Disabled'}</span></p>
          <p>Kill Switch: <span className={config.killSwitch ? 'text-red-400' : 'text-emerald-400'}>{config.killSwitch ? 'On' : 'Off'}</span></p>
          <p>Max Allocation: ${config.maxSingleAllocationUsd.toLocaleString()}</p>
          <p className="text-white/60">Disabled Domains: {config.disabledDomains.length ? config.disabledDomains.join(', ') : 'None'}</p>
        </div>
      )}
    </div>
  );
}
