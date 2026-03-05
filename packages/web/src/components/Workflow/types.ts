export interface WorkflowRule {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  trigger: WorkflowTrigger;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
  notifications: WorkflowNotification[];
  cooldownMs: number;
  maxFiresPerSession: number | null;
  metadata: {
    source: 'manual' | 'template' | 'suggested';
    firedCount: number;
    lastFiredAt: string | null;
    createdAt: string;
    lastEditedAt: string;
  };
}

export interface WorkflowTrigger {
  event: WorkflowEvent;
  scope?: {
    agentId?: string;
    role?: string;
    taskId?: string;
  };
}

export type WorkflowEvent =
  | 'context_above_threshold'
  | 'context_exhaustion_predicted'
  | 'agent_stalled'
  | 'agent_crashed'
  | 'agent_idle'
  | 'task_completed'
  | 'all_tasks_completed'
  | 'task_overdue'
  | 'budget_threshold'
  | 'decision_pending'
  | 'file_conflict_detected'
  | 'session_duration';

export interface WorkflowCondition {
  field: string;
  operator: 'gt' | 'lt' | 'eq' | 'between' | 'contains';
  value: number | string;
  value2?: number;
}

export interface WorkflowAction {
  type: WorkflowActionType;
  params: Record<string, unknown>;
}

export type WorkflowActionType =
  | 'compact_agent'
  | 'restart_agent'
  | 'pause_agent'
  | 'pause_all'
  | 'resume_agent'
  | 'switch_model'
  | 'reassign_task'
  | 'reprioritize_task'
  | 'generate_summary'
  | 'create_checkpoint'
  | 'approve_decisions'
  | 'set_deadline';

export interface WorkflowNotification {
  channel: 'pulse' | 'desktop' | 'slack' | 'email';
  message: string;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  rule: Omit<WorkflowRule, 'id' | 'metadata'>;
}

export interface WorkflowActivityEntry {
  id: string;
  ruleId: string;
  ruleName: string;
  timestamp: string;
  trigger: { event: string; details: string; values: string };
  actions: { type: string; result: 'success' | 'partial' | 'failed'; detail: string }[];
}

export interface DryRunMatch {
  agentId?: string;
  agentName?: string;
  matchedConditions: string[];
  wouldExecute: string[];
}

// Display labels
export const EVENT_LABELS: Record<WorkflowEvent, string> = {
  context_above_threshold: 'Context above threshold',
  context_exhaustion_predicted: 'Context exhaustion predicted',
  agent_stalled: 'Agent stalled',
  agent_crashed: 'Agent crashed',
  agent_idle: 'Agent idle',
  task_completed: 'Task completed',
  all_tasks_completed: 'All tasks completed',
  task_overdue: 'Task overdue',
  budget_threshold: 'Budget threshold',
  decision_pending: 'Decision pending',
  file_conflict_detected: 'File conflict detected',
  session_duration: 'Session duration',
};

export const ACTION_LABELS: Record<WorkflowActionType, string> = {
  compact_agent: 'Compact agent',
  restart_agent: 'Restart agent',
  pause_agent: 'Pause agent',
  pause_all: 'Pause all agents',
  resume_agent: 'Resume agent',
  switch_model: 'Switch model',
  reassign_task: 'Reassign task',
  reprioritize_task: 'Reprioritize task',
  generate_summary: 'Generate summary',
  create_checkpoint: 'Create checkpoint',
  approve_decisions: 'Approve decisions',
  set_deadline: 'Set deadline',
};

export const OPERATOR_LABELS: Record<string, string> = {
  gt: 'greater than',
  lt: 'less than',
  eq: 'equals',
  between: 'between',
  contains: 'contains',
};

export const TEMPLATE_CATEGORIES = [
  'Context Management',
  'Cost Control',
  'Session Management',
  'Reliability',
];

export function summarizeRule(rule: WorkflowRule): string {
  const eventLabel = EVENT_LABELS[rule.trigger.event] ?? rule.trigger.event;
  const actionLabels = rule.actions
    .map((a) => ACTION_LABELS[a.type] ?? a.type)
    .join(', ');
  return `When ${eventLabel.toLowerCase()} → ${actionLabels.toLowerCase()}`;
}
