import type { AuditTimelineEvent } from '../types';

export function ActionTimelinePanel({ events }: { events: AuditTimelineEvent[] }) {
  return (
    <div className="bg-[#0F0F11] border border-white/5 rounded-3xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold">What I changed</h3>
        <span className="text-[10px] uppercase tracking-widest text-white/30">Live audit</span>
      </div>
      <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
        {events.length === 0 ? (
          <p className="text-sm text-white/30">No autonomous actions yet.</p>
        ) : (
          events.map((event) => (
            <div key={event.id} className="p-3 rounded-xl bg-white/5 border border-white/5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-bold uppercase tracking-widest text-white/40">{event.event_type.replaceAll('_', ' ')}</p>
                <span className="text-[10px] text-white/30">{new Date(event.created_at).toLocaleTimeString()}</span>
              </div>
              <p className="text-sm text-white/80">{event.status}</p>
              {event.correlation_id ? <p className="text-[10px] mt-1 text-white/30">corr: {event.correlation_id.slice(0, 8)}</p> : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
