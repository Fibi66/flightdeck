import { useState, useEffect, useMemo } from 'react';
import type { TimerInfo } from '../../types';

type TimerFilter = 'active' | 'fired' | 'all';

function formatRemaining(ms: number): string {
  if (ms <= 0) return '—';
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

export function TimerDisplay() {
  const [timers, setTimers] = useState<TimerInfo[]>([]);
  const [filter, setFilter] = useState<TimerFilter>('active');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchTimers() {
      try {
        const res = await fetch('/api/timers');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setTimers(data);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to fetch timers');
      }
    }

    fetchTimers();
    const interval = setInterval(fetchTimers, 5_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const filtered = useMemo(() => {
    if (filter === 'active') return timers.filter(t => !t.fired);
    if (filter === 'fired') return timers.filter(t => t.fired);
    return timers;
  }, [timers, filter]);

  const activeCount = timers.filter(t => !t.fired).length;
  const firedCount = timers.filter(t => t.fired).length;

  if (error) {
    return <div className="p-3 text-xs text-red-400">Error: {error}</div>;
  }

  return (
    <div className="p-3 text-xs">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[11px] font-semibold text-th-text-alt uppercase tracking-wide">
          Timers
        </h3>
        <div className="flex gap-1">
          {(['active', 'fired', 'all'] as TimerFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-1.5 py-0.5 rounded text-[10px] ${
                filter === f
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'text-th-text-muted hover:text-th-text-alt'
              }`}
            >
              {f === 'active' ? `Active (${activeCount})` : f === 'fired' ? `Fired (${firedCount})` : `All (${timers.length})`}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-th-text-muted text-center py-4">
          {filter === 'active' ? 'No active timers' : filter === 'fired' ? 'No fired timers' : 'No timers'}
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map(timer => (
            <div
              key={timer.id}
              className={`rounded border px-2 py-1.5 ${
                timer.fired
                  ? 'border-th-border/50 bg-th-bg-muted/30 opacity-60'
                  : 'border-th-border bg-th-bg-muted/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-th-text-alt">{timer.label}</span>
                <span className={`text-[10px] ${timer.fired ? 'text-green-400' : timer.repeat ? 'text-purple-400' : 'text-yellow-400'}`}>
                  {timer.fired ? '✓ fired' : timer.repeat ? '⟳ repeat' : formatRemaining(timer.remainingMs)}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-th-text-muted">
                <span title={timer.agentId}>agent: {shortId(timer.agentId)}</span>
                {timer.repeat && !timer.fired && (
                  <span>every {timer.intervalSeconds}s</span>
                )}
              </div>
              {timer.message && (
                <div className="mt-0.5 text-th-text-muted truncate" title={timer.message}>
                  💬 {timer.message}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
