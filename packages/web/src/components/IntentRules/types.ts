// Intent Rules V2 types — aligned with backend DecisionLog API

export type RuleAction = 'auto-approve' | 'require-review' | 'auto-reject' | 'queue-silent';
export type ConditionType = 'file_count' | 'cost_estimate' | 'time_elapsed' | 'context_usage';
export type ConditionOp = 'lt' | 'gt' | 'between';

export interface IntentCondition {
  type: ConditionType;
  operator: ConditionOp;
  value: number;
  value2?: number;
  unit?: string;
}

export interface IntentRuleV2 {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  action: RuleAction;
  match: {
    categories: string[];
    roles?: string[];
    agentIds?: string[];
  };
  conditions?: IntentCondition[];
  metadata: {
    source: 'manual' | 'learned' | 'preset';
    matchCount: number;
    lastMatchedAt: string | null;
    effectivenessScore: number | null;
    issuesAfterMatch: number;
    createdAt: string;
  };
}

export type TrustPreset = 'conservative' | 'moderate' | 'autonomous';

export const TRUST_PRESETS: Record<TrustPreset, { label: string; description: string }> = {
  conservative: { label: 'Conservative', description: 'You review everything except basic tool use.' },
  moderate: { label: 'Moderate', description: 'Routine decisions handled automatically. Architecture and security need you.' },
  autonomous: { label: 'Autonomous', description: 'Maximum delegation. You focus on strategic decisions only.' },
};

export const ACTION_DISPLAY: Record<RuleAction, { label: string; color: string; icon: string }> = {
  'auto-approve': { label: 'Auto-approve', color: 'text-green-500', icon: '✅' },
  'require-review': { label: 'Require review', color: 'text-yellow-500', icon: '⏸' },
  'auto-reject': { label: 'Auto-reject', color: 'text-red-500', icon: '🚫' },
  'queue-silent': { label: 'Queue silent', color: 'text-blue-400', icon: '🔇' },
};

export const CONDITION_LABELS: Record<ConditionType, string> = {
  file_count: 'File changes',
  cost_estimate: 'Estimated cost',
  time_elapsed: 'Session elapsed',
  context_usage: 'Context usage',
};

export const CONDITION_UNITS: Record<ConditionType, string> = {
  file_count: 'lines',
  cost_estimate: '$',
  time_elapsed: 'min',
  context_usage: '%',
};
