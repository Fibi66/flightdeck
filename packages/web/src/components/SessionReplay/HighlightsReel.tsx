import { useState, useEffect } from 'react';
import { X, ExternalLink, Share2 } from 'lucide-react';
import { apiFetch } from '../../hooks/useApi';
import type { ReplayHighlight } from './types';

interface HighlightsReelProps {
  leadId: string;
  sessionTitle: string;
  onSeek: (timeMs: number) => void;
  onClose: () => void;
}

const TYPE_ICONS: Record<ReplayHighlight['type'], string> = {
  decision: '⚠',
  crash: '🔴',
  milestone: '📦',
  debate: '⚡',
  cost_spike: '💰',
};

export function HighlightsReel({ leadId, sessionTitle, onSeek, onClose }: HighlightsReelProps) {
  const [highlights, setHighlights] = useState<ReplayHighlight[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ highlights: ReplayHighlight[] }>(`/replay/${leadId}/highlights`)
      .then((data) => setHighlights(data.highlights ?? []))
      .catch(() => setHighlights([]))
      .finally(() => setLoading(false));
  }, [leadId]);

  const handleExportSummary = () => {
    const lines = highlights.map((h, i) => {
      const time = new Date(h.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      return `${i + 1}. ${TYPE_ICONS[h.type] ?? '●'} ${time} — ${h.summary}`;
    });
    const md = `# Highlights: ${sessionTitle}\n\n${lines.join('\n')}`;
    navigator.clipboard.writeText(md).catch(() => {});
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
      data-testid="highlights-reel"
    >
      <div
        className="bg-surface-raised border border-th-border rounded-xl shadow-2xl w-[520px] max-h-[70vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-th-border shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-th-text-alt">🎬 Highlights Reel</h2>
            <p className="text-[10px] text-th-text-muted">{sessionTitle}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded text-th-text-muted hover:text-th-text hover:bg-th-bg-hover">
            <X size={16} />
          </button>
        </div>

        {/* Highlights list */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1">
          {loading ? (
            <p className="text-xs text-th-text-muted text-center py-6">Curating highlights...</p>
          ) : highlights.length === 0 ? (
            <p className="text-xs text-th-text-muted text-center py-6">
              No highlights available for this session yet.
            </p>
          ) : (
            highlights.map((h, i) => (
              <HighlightItem
                key={`${h.timestamp}-${i}`}
                index={i + 1}
                highlight={h}
                onClick={() => onSeek(new Date(h.timestamp).getTime())}
              />
            ))
          )}
        </div>

        {/* Footer actions */}
        {highlights.length > 0 && (
          <div className="flex items-center gap-2 px-5 py-3 border-t border-th-border shrink-0">
            <button
              onClick={handleExportSummary}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] bg-th-bg border border-th-border rounded-md text-th-text-muted hover:text-th-text"
            >
              <ExternalLink className="w-3 h-3" /> Export as Summary
            </button>
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] bg-th-bg border border-th-border rounded-md text-th-text-muted hover:text-th-text"
            >
              <Share2 className="w-3 h-3" /> Share Highlights Link
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function HighlightItem({ index, highlight, onClick }: { index: number; highlight: ReplayHighlight; onClick: () => void }) {
  const icon = TYPE_ICONS[highlight.type] ?? '●';
  const time = new Date(highlight.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 w-full px-3 py-2 rounded-md hover:bg-th-bg-hover transition-colors text-left"
    >
      <span className="text-[11px] text-th-text-muted font-mono w-4 text-right">{index}.</span>
      <span className="text-sm">{icon}</span>
      <span className="text-[11px] text-th-text-muted font-mono w-16">{time}</span>
      <span className="text-[11px] text-th-text-alt flex-1">{highlight.summary}</span>
      {highlight.significance >= 80 && (
        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-400/20 text-amber-400">key</span>
      )}
    </button>
  );
}
