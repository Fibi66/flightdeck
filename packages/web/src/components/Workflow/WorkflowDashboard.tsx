import { useState } from 'react';
import { useWorkflowRules } from '../../hooks/useWorkflowRules';
import { WorkflowRuleEditor } from './WorkflowRuleEditor';
import { WorkflowTemplates } from './WorkflowTemplates';
import { WorkflowActivityLog } from './WorkflowActivityLog';
import { summarizeRule, TEMPLATE_CATEGORIES, type WorkflowRule, type WorkflowTemplate } from './types';

type Tab = 'rules' | 'activity';

export function WorkflowDashboard() {
  const { rules, loading, toggleRule, deleteRule, createRule, updateRule } = useWorkflowRules();
  const [editingRule, setEditingRule] = useState<Partial<WorkflowRule> | null>(null);
  const [creating, setCreating] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [tab, setTab] = useState<Tab>('rules');

  if (loading) {
    return (
      <div className="text-xs text-th-text-muted animate-pulse p-4">
        Loading workflow rules…
      </div>
    );
  }

  if (editingRule || creating) {
    return (
      <WorkflowRuleEditor
        rule={editingRule ?? undefined}
        onSave={async (rule) => {
          if (editingRule?.id) await updateRule(editingRule.id, rule);
          else await createRule(rule);
          setEditingRule(null);
          setCreating(false);
        }}
        onCancel={() => {
          setEditingRule(null);
          setCreating(false);
        }}
      />
    );
  }

  if (showTemplates) {
    return (
      <WorkflowTemplates
        onSelect={(template: WorkflowTemplate) => {
          setCreating(true);
          setEditingRule(template.rule as Partial<WorkflowRule>);
          setShowTemplates(false);
        }}
        onClose={() => setShowTemplates(false)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-th-text flex items-center gap-2">
          <span>⚡</span> Workflow Automation
        </h3>
        <button
          onClick={() => setCreating(true)}
          className="text-xs px-3 py-1.5 rounded-md bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
        >
          + New Rule
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-th-border-muted">
        {(['rules', 'activity'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`text-xs pb-2 transition-colors ${
              tab === t
                ? 'text-accent border-b-2 border-accent'
                : 'text-th-text-muted hover:text-th-text'
            }`}
          >
            {t === 'rules' ? 'Rules' : 'Activity'}
          </button>
        ))}
      </div>

      {tab === 'activity' ? (
        <WorkflowActivityLog />
      ) : (
        <>
          {/* Template shortcuts */}
          <div className="flex gap-2 flex-wrap">
            {TEMPLATE_CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setShowTemplates(true)}
                className="text-[11px] px-2 py-1 rounded-full bg-th-bg-muted text-th-text-muted hover:text-th-text transition-colors"
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Rule list */}
          {rules.length === 0 ? (
            <div className="text-xs text-th-text-muted text-center py-6">
              No workflow rules yet. Create one or start from a template.
            </div>
          ) : (
            <div className="space-y-2">
              {rules
                .sort((a, b) => a.priority - b.priority)
                .map((rule) => (
                  <div
                    key={rule.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-th-border-muted hover:border-th-border transition-colors"
                  >
                    <span
                      className="text-th-text-muted cursor-grab text-xs"
                      title="Drag to reorder"
                    >
                      ⠿
                    </span>
                    <button
                      onClick={() => toggleRule(rule.id)}
                      className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${
                        rule.enabled
                          ? 'bg-accent/20 border-accent text-accent'
                          : 'border-th-border-muted text-th-text-muted'
                      }`}
                      aria-label={rule.enabled ? 'Disable rule' : 'Enable rule'}
                    >
                      {rule.enabled ? '✓' : ''}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-th-text truncate">
                        {rule.name}
                      </div>
                      <div className="text-[11px] text-th-text-muted truncate">
                        {summarizeRule(rule)}
                      </div>
                      <div className="text-[10px] text-th-text-muted mt-0.5">
                        Fired: {rule.metadata.firedCount} time
                        {rule.metadata.firedCount !== 1 ? 's' : ''}
                        {rule.metadata.lastFiredAt &&
                          ` • Last: ${new Date(rule.metadata.lastFiredAt).toLocaleTimeString()}`}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setEditingRule(rule)}
                        className="text-[11px] px-2 py-1 rounded text-th-text-muted hover:bg-th-bg-muted transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteRule(rule.id)}
                        className="text-[11px] px-2 py-1 rounded text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}

          <div className="text-[10px] text-th-text-muted border-t border-th-border-muted pt-2">
            ℹ️ Workflow rules extend Intent Rules with event triggers. Intent Rules handle
            decisions. Workflow rules handle everything.
          </div>
        </>
      )}
    </div>
  );
}
