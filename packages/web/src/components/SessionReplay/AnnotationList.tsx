import { MapPin, X } from 'lucide-react';
import type { ReplayAnnotation } from './types';

interface AnnotationListProps {
  annotations: ReplayAnnotation[];
  onSeek: (timestamp: string) => void;
  onClose: () => void;
}

const TYPE_ICONS: Record<ReplayAnnotation['type'], string> = {
  comment: '💬',
  flag: '🚩',
  bookmark: '🔖',
};

export function AnnotationList({ annotations, onSeek, onClose }: AnnotationListProps) {
  const sorted = [...annotations].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  return (
    <div
      className="bg-surface-raised border border-th-border rounded-lg shadow-xl w-72 max-h-80 overflow-hidden flex flex-col z-50"
      data-testid="annotation-list"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-th-border shrink-0">
        <span className="text-[11px] font-medium text-th-text-alt">
          <MapPin className="w-3 h-3 inline mr-1" />
          {annotations.length} annotation{annotations.length !== 1 ? 's' : ''}
        </span>
        <button onClick={onClose} className="p-0.5 rounded text-th-text-muted hover:text-th-text">
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sorted.length === 0 ? (
          <p className="text-[11px] text-th-text-muted text-center py-4">
            No annotations yet. Click the 📝 button to add one.
          </p>
        ) : (
          sorted.map((ann) => (
            <button
              key={ann.id}
              onClick={() => onSeek(ann.timestamp)}
              className="flex items-start gap-2 px-3 py-2 w-full text-left hover:bg-th-bg-hover transition-colors border-b border-th-border/30 last:border-0"
            >
              <span className="text-xs shrink-0 mt-0.5">{TYPE_ICONS[ann.type]}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-th-text-alt line-clamp-2">{ann.text}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[9px] text-th-text-muted">{ann.author}</span>
                  <span className="text-[9px] text-th-text-muted">
                    {new Date(ann.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
