import { useWorkflowActivity, useWorkflowRules } from '../../hooks/useWorkflowRules';

const RESULT_ICONS: Record<string, string> = {
  success: '✅',
  partial: '⚠',
  failed: '❌',
};

export function WorkflowActivityLog() {
  const { activity, loading } = useWorkflowActivity();
  const { toggleRule } = useWorkflowRules();

  if (loading) {
    return <div className="text-xs text-th-text-muted animate-pulse">Loading activity…</div>;
  }

  if (activity.length === 0) {
    return (
      <div className="text-xs text-th-text-muted text-center py-6">
        No automation events this session
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {activity.map((entry) => (
        <div key={entry.id} className="border border-th-border-muted rounded-lg p-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-th-text-muted">
              {new Date(entry.timestamp).toLocaleTimeString()}
            </span>
            <span className="text-xs font-medium text-th-text">
              ⚡ &ldquo;{entry.ruleName}&rdquo;
            </span>
          </div>
          <div className="text-[11px] text-th-text-muted ml-4">
            Trigger: {entry.trigger.details} ({entry.trigger.values})
          </div>
          {entry.actions.map((a, i) => (
            <div key={i} className="text-[11px] text-th-text-muted ml-4">
              Action: {a.type.replace(/_/g, ' ')} — {RESULT_ICONS[a.result] ?? ''} {a.detail}
            </div>
          ))}
          <div className="flex gap-2 ml-4 mt-1">
            <button className="text-[10px] text-accent hover:text-accent/80">View rule</button>
            <button
              onClick={() => toggleRule(entry.ruleId)}
              className="text-[10px] text-red-400 hover:text-red-300"
            >
              Disable rule
            </button>
          </div>
        </div>
      ))}
      <div className="text-[10px] text-th-text-muted text-center">
        Showing {activity.length} automation events this session
      </div>
    </div>
  );
}
