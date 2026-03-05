import { useState } from 'react';

interface Props {
  pattern: string;
  suggestedRule: string;
  onCreateRule: () => void;
  onDismiss: () => void;
}

export function WorkflowSuggestion({ pattern, suggestedRule, onCreateRule, onDismiss }: Props) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div
      className="fixed bottom-16 right-4 z-40 max-w-xs bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-lg shadow-lg p-3"
      role="alert"
    >
      <div className="flex items-start gap-2">
        <span className="text-base shrink-0">💡</span>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
            {pattern}
          </div>
          <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
            Suggested rule: &ldquo;{suggestedRule}&rdquo;
          </div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={onCreateRule}
              className="text-[11px] font-medium text-accent hover:text-accent/80"
            >
              Create Rule
            </button>
            <button
              onClick={() => {
                setDismissed(true);
                onDismiss();
              }}
              className="text-[11px] text-th-text-muted hover:text-th-text"
            >
              Not now
            </button>
          </div>
        </div>
        <button
          onClick={() => {
            setDismissed(true);
            onDismiss();
          }}
          className="text-amber-400 hover:text-amber-600 text-xs shrink-0"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
