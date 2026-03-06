/**
 * Adapters to transform between backend IntentRule shape and frontend IntentRuleV2 shape.
 *
 * Backend (DecisionLog.ts) returns:
 *   { id, category, action: 'auto-approve'|'queue'|'alert', source, approvalCount,
 *     createdAt, lastMatchedAt, description, roleScopes, conditions, priority,
 *     effectiveness, enabled }
 *
 * Frontend (types.ts) expects:
 *   { id, name, action: RuleAction, match: { categories, roles },
 *     conditions: IntentCondition[], priority, enabled,
 *     metadata: { source, matchCount, ... } }
 */

import type { IntentRuleV2, RuleAction, IntentCondition } from './types';

/** Shape returned by GET /intents (backend IntentRule) */
export interface BackendIntentRule {
  id: string;
  category: string;
  action: string;
  source: string;
  approvalCount: number;
  createdAt: string;
  lastMatchedAt: string | null;
  description?: string;
  roleScopes?: string[];
  conditions?: BackendCondition[];
  priority?: number;
  effectiveness?: {
    totalMatches: number;
    autoApproved: number;
    overriddenByUser: number;
    lastEvaluatedAt: string | null;
    score: number | null;
  };
  enabled: boolean;
}

interface BackendCondition {
  field: string;
  operator: string;
  value: string;
}

// Backend action → Frontend action
const ACTION_TO_FRONTEND: Record<string, RuleAction> = {
  'auto-approve': 'auto-approve',
  'queue': 'require-review',
  'alert': 'auto-reject',
};

// Frontend action → Backend action
const ACTION_TO_BACKEND: Record<RuleAction, string> = {
  'auto-approve': 'auto-approve',
  'require-review': 'queue',
  'auto-reject': 'alert',
  'queue-silent': 'queue',
};

/** Transform a backend IntentRule to frontend IntentRuleV2 */
export function backendToFrontend(rule: BackendIntentRule): IntentRuleV2 {
  return {
    id: rule.id,
    name: rule.description || `${rule.action} ${rule.category}`,
    enabled: rule.enabled,
    priority: rule.priority ?? 0,
    action: ACTION_TO_FRONTEND[rule.action] ?? 'require-review',
    match: {
      categories: [rule.category],
      roles: rule.roleScopes,
    },
    conditions: (rule.conditions ?? []).map(backendConditionToFrontend),
    metadata: {
      source: (rule.source === 'teach_me' ? 'manual' : rule.source) as 'manual' | 'learned' | 'preset',
      matchCount: rule.effectiveness?.totalMatches ?? rule.approvalCount,
      lastMatchedAt: rule.lastMatchedAt,
      effectivenessScore: rule.effectiveness?.score ?? null,
      issuesAfterMatch: rule.effectiveness?.overriddenByUser ?? 0,
      createdAt: rule.createdAt,
    },
  };
}

/** Build the POST body for creating a new rule */
export function frontendToCreateBody(rule: IntentRuleV2): Record<string, unknown> {
  return {
    category: rule.match.categories[0] ?? 'general',
    source: 'manual',
    action: ACTION_TO_BACKEND[rule.action] ?? 'auto-approve',
    description: rule.name,
    roleScopes: rule.match.roles,
    conditions: (rule.conditions ?? []).map(frontendConditionToBackend),
    priority: rule.priority,
    enabled: rule.enabled,
  };
}

/** Build the PATCH body for updating a rule */
export function frontendToPatchBody(rule: IntentRuleV2): Record<string, unknown> {
  return {
    action: ACTION_TO_BACKEND[rule.action] ?? 'auto-approve',
    description: rule.name,
    roleScopes: rule.match.roles,
    conditions: (rule.conditions ?? []).map(frontendConditionToBackend),
    priority: rule.priority,
    enabled: rule.enabled,
  };
}

// Backend conditions use {field, operator, value:string}
// Frontend conditions use {type, operator, value:number}
function backendConditionToFrontend(c: BackendCondition): IntentCondition {
  return {
    type: (c.field as IntentCondition['type']) || 'file_count',
    operator: mapConditionOp(c.operator),
    value: Number(c.value) || 0,
  };
}

function frontendConditionToBackend(c: IntentCondition): BackendCondition {
  return {
    field: c.type,
    operator: reverseConditionOp(c.operator),
    value: String(c.value),
  };
}

function mapConditionOp(op: string): IntentCondition['operator'] {
  if (op === 'contains' || op === 'equals') return 'lt';
  if (op === 'not_contains' || op === 'matches') return 'gt';
  if (op === 'lt' || op === 'gt' || op === 'between') return op as IntentCondition['operator'];
  return 'lt';
}

function reverseConditionOp(op: IntentCondition['operator']): string {
  return op; // Use the frontend operator directly — the backend stores whatever we send
}
