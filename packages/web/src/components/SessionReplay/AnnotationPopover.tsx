import { useState } from 'react';
import { X } from 'lucide-react';
import type { ReplayAnnotation } from './types';

interface AnnotationPopoverProps {
  timestamp: string;
  onSave: (annotation: Omit<ReplayAnnotation, 'id'>) => void;
  onCancel: () => void;
}

export function AnnotationPopover({ timestamp, onSave, onCancel }: AnnotationPopoverProps) {
  const [text, setText] = useState('');
  const [type, setType] = useState<ReplayAnnotation['type']>('comment');

  const time = new Date(timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  const handleSave = () => {
    if (!text.trim()) return;
    onSave({ timestamp, author: 'You', text: text.trim(), type });
  };

  return (
    <div
      className="bg-surface-raised border border-th-border rounded-lg shadow-xl w-72 overflow-hidden z-50"
      data-testid="annotation-popover"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-th-border/50">
        <span className="text-[11px] text-th-text-alt font-medium">📌 Add annotation at {time}</span>
        <button onClick={onCancel} className="p-0.5 rounded text-th-text-muted hover:text-th-text">
          <X size={14} />
        </button>
      </div>

      <div className="px-3 py-2 space-y-2.5">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What happened here?"
          className="w-full h-16 px-2.5 py-1.5 text-[11px] bg-th-bg border border-th-border rounded-md text-th-text resize-none focus:border-accent outline-none"
          autoFocus
        />

        {/* Type selector */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-th-text-muted mr-1">Type:</span>
          {(['comment', 'flag', 'bookmark'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`px-2 py-0.5 text-[10px] rounded-full transition-colors ${
                type === t
                  ? 'bg-accent/20 text-accent border border-accent/30'
                  : 'bg-th-bg border border-th-border text-th-text-muted hover:text-th-text'
              }`}
            >
              {t === 'comment' ? '💬' : t === 'flag' ? '🚩' : '🔖'} {t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-th-border/50">
        <button onClick={onCancel} className="px-2.5 py-1 text-[11px] text-th-text-muted hover:text-th-text rounded">
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!text.trim()}
          className="px-3 py-1 text-[11px] bg-accent text-white rounded-md hover:bg-accent/90 disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  );
}
