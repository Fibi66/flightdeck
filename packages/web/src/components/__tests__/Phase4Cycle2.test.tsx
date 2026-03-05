import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ── Mocks (must be before imports that use them) ────────────────────────────

// Track mock return values so tests can override them
let mockPredictions: any[] = [];
let mockPredictionsLoading = false;
const mockDismiss = vi.fn();
let mockAccuracy: any = null;

vi.mock('../../hooks/usePredictions', () => ({
  usePredictions: () => ({
    predictions: mockPredictions,
    loading: mockPredictionsLoading,
    dismiss: mockDismiss,
    refetch: vi.fn(),
  }),
  usePredictionAccuracy: () => mockAccuracy,
}));

let mockWorkflowRules: any[] = [];
let mockWorkflowLoading = false;
const mockToggleRule = vi.fn();
const mockDeleteRule = vi.fn();
const mockCreateRule = vi.fn();
const mockUpdateRule = vi.fn();

vi.mock('../../hooks/useWorkflowRules', () => ({
  useWorkflowRules: () => ({
    rules: mockWorkflowRules,
    loading: mockWorkflowLoading,
    toggleRule: mockToggleRule,
    deleteRule: mockDeleteRule,
    createRule: mockCreateRule,
    updateRule: mockUpdateRule,
    reorder: vi.fn(),
    dryRun: vi.fn(),
    refetch: vi.fn(),
  }),
  useWorkflowActivity: () => ({
    activity: [],
    loading: false,
  }),
  useWorkflowTemplates: () => [],
}));

vi.mock('../../hooks/useApi', () => ({
  apiFetch: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../stores/appStore', () => ({
  useAppStore: Object.assign(
    (selector: any) =>
      selector({
        agents: [],
        pendingDecisions: [],
        config: null,
        connected: true,
        systemPaused: false,
        setApprovalQueueOpen: vi.fn(),
      }),
    { getState: () => ({ agents: [], pendingDecisions: [] }) },
  ),
}));

vi.mock('../../stores/leadStore', () => ({
  useLeadStore: Object.assign(
    (selector: any) =>
      selector({
        selectedLeadId: 'test-lead',
        projects: { 'test-lead': { dagStatus: null } },
      }),
    { getState: () => ({ selectedLeadId: 'test-lead' }) },
  ),
}));

// ── Imports ─────────────────────────────────────────────────────────────────

import {
  PREDICTION_TYPE_LABELS,
  SEVERITY_COLORS,
  SEVERITY_BG,
  PREDICTION_ICONS,
  confidenceLabel,
} from '../Predictions/types';
import type { Prediction } from '../Predictions/types';
import { PredictionCard } from '../Predictions/PredictionCard';
import { PredictionsPanel } from '../Predictions/PredictionsPanel';
import { PulsePredictionIndicator } from '../Predictions/PulsePredictionIndicator';

import {
  EVENT_LABELS,
  ACTION_LABELS,
  OPERATOR_LABELS,
  summarizeRule,
} from '../Workflow/types';
import type { WorkflowRule } from '../Workflow/types';
import { WorkflowRuleEditor } from '../Workflow/WorkflowRuleEditor';
import { WorkflowDashboard } from '../Workflow/WorkflowDashboard';
import { WorkflowSuggestion } from '../Workflow/WorkflowSuggestion';
import { WorkflowActivityLog } from '../Workflow/WorkflowActivityLog';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makePrediction(overrides: Partial<Prediction> = {}): Prediction {
  return {
    id: 'pred-1',
    type: 'context_exhaustion',
    severity: 'warning',
    confidence: 85,
    title: 'Agent may exhaust context',
    detail: 'Agent dev-1 is burning context at 2.3k tokens/min',
    timeHorizon: 12,
    dataPoints: 5,
    agentId: 'dev-1',
    actions: [
      { label: 'Compact Now', description: 'Compact agent context', actionType: 'api_call', endpoint: '/agents/dev-1/compact', method: 'POST' },
      { label: 'View Agent', description: 'Navigate to agent', actionType: 'navigate', route: '/agents/dev-1' },
    ],
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    ...overrides,
  };
}

function makeWorkflowRule(overrides: Partial<WorkflowRule> = {}): WorkflowRule {
  return {
    id: 'rule-1',
    name: 'Auto-compact on high context',
    enabled: true,
    priority: 0,
    trigger: { event: 'context_above_threshold' },
    conditions: [{ field: 'contextUsage', operator: 'gt', value: 90 }],
    actions: [{ type: 'compact_agent', params: {} }],
    notifications: [],
    cooldownMs: 60000,
    maxFiresPerSession: 10,
    metadata: {
      source: 'manual',
      firedCount: 3,
      lastFiredAt: null,
      createdAt: new Date().toISOString(),
      lastEditedAt: new Date().toISOString(),
    },
    ...overrides,
  };
}

beforeEach(() => {
  mockPredictions = [];
  mockPredictionsLoading = false;
  mockAccuracy = null;
  mockWorkflowRules = [];
  mockWorkflowLoading = false;
  mockDismiss.mockClear();
  mockToggleRule.mockClear();
  mockDeleteRule.mockClear();
  mockCreateRule.mockClear();
  mockUpdateRule.mockClear();
});

// ═════════════════════════════════════════════════════════════════════════════
// PREDICTIONS — Type constants & helpers
// ═════════════════════════════════════════════════════════════════════════════

describe('Predictions types', () => {
  it('PREDICTION_TYPE_LABELS has 6 entries for all prediction types', () => {
    const keys = Object.keys(PREDICTION_TYPE_LABELS);
    expect(keys).toHaveLength(6);
    expect(keys).toContain('context_exhaustion');
    expect(keys).toContain('cost_overrun');
    expect(keys).toContain('agent_stall');
    expect(keys).toContain('task_duration');
    expect(keys).toContain('completion_estimate');
    expect(keys).toContain('file_conflict');
  });

  it('SEVERITY_COLORS has entries for info, warning, and critical', () => {
    expect(Object.keys(SEVERITY_COLORS)).toHaveLength(3);
    expect(SEVERITY_COLORS.info).toBeDefined();
    expect(SEVERITY_COLORS.warning).toBeDefined();
    expect(SEVERITY_COLORS.critical).toBeDefined();
  });

  it('PREDICTION_ICONS has an icon for every prediction type', () => {
    const typeKeys = Object.keys(PREDICTION_TYPE_LABELS);
    const iconKeys = Object.keys(PREDICTION_ICONS);
    expect(iconKeys).toEqual(expect.arrayContaining(typeKeys));
    expect(iconKeys).toHaveLength(6);
  });

  it('confidenceLabel returns "High" for confidence >= 80', () => {
    expect(confidenceLabel(80)).toEqual({ text: 'High', color: 'text-green-400' });
    expect(confidenceLabel(95)).toEqual({ text: 'High', color: 'text-green-400' });
  });

  it('confidenceLabel returns percentage for confidence 60-79', () => {
    expect(confidenceLabel(60)).toEqual({ text: '60%', color: 'text-amber-400' });
    expect(confidenceLabel(79)).toEqual({ text: '79%', color: 'text-amber-400' });
  });

  it('confidenceLabel returns muted percentage for confidence < 60', () => {
    expect(confidenceLabel(59)).toEqual({ text: '59%', color: 'text-th-text-muted' });
    expect(confidenceLabel(10)).toEqual({ text: '10%', color: 'text-th-text-muted' });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PREDICTIONS — PredictionCard
// ═════════════════════════════════════════════════════════════════════════════

describe('PredictionCard', () => {
  it('renders prediction title and detail', () => {
    const pred = makePrediction();
    render(
      <MemoryRouter>
        <PredictionCard prediction={pred} onDismiss={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Agent may exhaust context')).toBeInTheDocument();
    expect(screen.getByText(/burning context at 2.3k/)).toBeInTheDocument();
  });

  it('renders confidence badge with correct text', () => {
    const pred = makePrediction({ confidence: 85 });
    render(
      <MemoryRouter>
        <PredictionCard prediction={pred} onDismiss={vi.fn()} />
      </MemoryRouter>,
    );
    // High confidence → "High" label
    expect(screen.getByText('High')).toBeInTheDocument();
  });

  it('renders action buttons from prediction actions', () => {
    const pred = makePrediction();
    render(
      <MemoryRouter>
        <PredictionCard prediction={pred} onDismiss={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Compact Now')).toBeInTheDocument();
    expect(screen.getByText('View Agent')).toBeInTheDocument();
  });

  it('calls onDismiss when dismiss button is clicked', () => {
    const onDismiss = vi.fn();
    const pred = makePrediction({ id: 'pred-42' });
    render(
      <MemoryRouter>
        <PredictionCard prediction={pred} onDismiss={onDismiss} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByLabelText('Dismiss prediction'));
    expect(onDismiss).toHaveBeenCalledWith('pred-42');
  });

  it('renders compact mode with truncated layout', () => {
    const pred = makePrediction();
    render(
      <MemoryRouter>
        <PredictionCard prediction={pred} onDismiss={vi.fn()} compact />
      </MemoryRouter>,
    );
    // Compact mode still shows title
    expect(screen.getByText('Agent may exhaust context')).toBeInTheDocument();
    // But no action buttons
    expect(screen.queryByText('Compact Now')).not.toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PREDICTIONS — PredictionsPanel
// ═════════════════════════════════════════════════════════════════════════════

describe('PredictionsPanel', () => {
  it('shows loading state', () => {
    mockPredictionsLoading = true;
    render(
      <MemoryRouter>
        <PredictionsPanel />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Loading predictions/)).toBeInTheDocument();
  });

  it('shows empty state when no predictions', () => {
    mockPredictions = [];
    render(
      <MemoryRouter>
        <PredictionsPanel />
      </MemoryRouter>,
    );
    expect(screen.getByText('No active predictions')).toBeInTheDocument();
  });

  it('renders prediction cards when predictions exist', () => {
    mockPredictions = [
      makePrediction({ id: 'p1', title: 'Context running low' }),
      makePrediction({ id: 'p2', title: 'Cost overrun imminent', type: 'cost_overrun', severity: 'critical' }),
    ];
    render(
      <MemoryRouter>
        <PredictionsPanel />
      </MemoryRouter>,
    );
    expect(screen.getByText('Context running low')).toBeInTheDocument();
    expect(screen.getByText('Cost overrun imminent')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PREDICTIONS — PulsePredictionIndicator
// ═════════════════════════════════════════════════════════════════════════════

describe('PulsePredictionIndicator', () => {
  it('returns null when no predictions', () => {
    mockPredictions = [];
    const { container } = render(<PulsePredictionIndicator />);
    expect(container.innerHTML).toBe('');
  });

  it('returns null when only completion_estimate predictions exist', () => {
    mockPredictions = [makePrediction({ type: 'completion_estimate' })];
    const { container } = render(<PulsePredictionIndicator />);
    expect(container.innerHTML).toBe('');
  });

  it('shows short label for most urgent non-estimate prediction', () => {
    mockPredictions = [
      makePrediction({ type: 'context_exhaustion', severity: 'warning', timeHorizon: 8 }),
    ];
    render(<PulsePredictionIndicator />);
    expect(screen.getByText('ctx ~8m')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// WORKFLOW — Type constants & helpers
// ═════════════════════════════════════════════════════════════════════════════

describe('Workflow types', () => {
  it('EVENT_LABELS has 12 entries for all workflow events', () => {
    const keys = Object.keys(EVENT_LABELS);
    expect(keys).toHaveLength(12);
    expect(EVENT_LABELS.context_above_threshold).toBe('Context above threshold');
    expect(EVENT_LABELS.agent_crashed).toBe('Agent crashed');
    expect(EVENT_LABELS.file_conflict_detected).toBe('File conflict detected');
  });

  it('ACTION_LABELS has 12 entries for all action types', () => {
    const keys = Object.keys(ACTION_LABELS);
    expect(keys).toHaveLength(12);
    expect(ACTION_LABELS.compact_agent).toBe('Compact agent');
    expect(ACTION_LABELS.pause_all).toBe('Pause all agents');
    expect(ACTION_LABELS.set_deadline).toBe('Set deadline');
  });

  it('OPERATOR_LABELS covers all 5 operators', () => {
    expect(Object.keys(OPERATOR_LABELS)).toHaveLength(5);
    expect(OPERATOR_LABELS.gt).toBe('greater than');
    expect(OPERATOR_LABELS.between).toBe('between');
  });

  it('summarizeRule produces correct human-readable text', () => {
    const rule = makeWorkflowRule();
    const summary = summarizeRule(rule);
    expect(summary).toBe('When context above threshold → compact agent');
  });

  it('summarizeRule joins multiple actions with commas', () => {
    const rule = makeWorkflowRule({
      actions: [
        { type: 'compact_agent', params: {} },
        { type: 'pause_agent', params: {} },
      ],
    });
    const summary = summarizeRule(rule);
    expect(summary).toBe('When context above threshold → compact agent, pause agent');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// WORKFLOW — WorkflowRuleEditor
// ═════════════════════════════════════════════════════════════════════════════

describe('WorkflowRuleEditor', () => {
  it('renders form fields and save/cancel buttons', () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(<WorkflowRuleEditor onSave={onSave} onCancel={onCancel} />);

    expect(screen.getByText(/New Workflow Rule/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Auto-generated if empty')).toBeInTheDocument();
    expect(screen.getByText('Save Rule')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('calls onSave with rule data when save is clicked', () => {
    const onSave = vi.fn();
    render(<WorkflowRuleEditor onSave={onSave} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByText('Save Rule'));
    expect(onSave).toHaveBeenCalledTimes(1);
    const savedRule = onSave.mock.calls[0][0];
    expect(savedRule).toHaveProperty('trigger');
    expect(savedRule).toHaveProperty('actions');
    expect(savedRule.enabled).toBe(true);
  });

  it('calls onCancel when cancel is clicked', () => {
    const onCancel = vi.fn();
    render(<WorkflowRuleEditor onSave={vi.fn()} onCancel={onCancel} />);

    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// WORKFLOW — WorkflowDashboard
// ═════════════════════════════════════════════════════════════════════════════

describe('WorkflowDashboard', () => {
  it('shows loading state', () => {
    mockWorkflowLoading = true;
    render(
      <MemoryRouter>
        <WorkflowDashboard />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Loading workflow rules/)).toBeInTheDocument();
  });

  it('shows empty state when no rules exist', () => {
    mockWorkflowRules = [];
    render(
      <MemoryRouter>
        <WorkflowDashboard />
      </MemoryRouter>,
    );
    expect(screen.getByText(/No workflow rules yet/)).toBeInTheDocument();
  });

  it('renders header with New Rule button', () => {
    render(
      <MemoryRouter>
        <WorkflowDashboard />
      </MemoryRouter>,
    );
    expect(screen.getByText('Workflow Automation')).toBeInTheDocument();
    expect(screen.getByText('+ New Rule')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// WORKFLOW — WorkflowSuggestion
// ═════════════════════════════════════════════════════════════════════════════

describe('WorkflowSuggestion', () => {
  it('renders pattern text and suggested rule', () => {
    render(
      <WorkflowSuggestion
        pattern="You've compacted agents 5 times this session"
        suggestedRule="Auto-compact when context > 90%"
        onCreateRule={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText("You've compacted agents 5 times this session")).toBeInTheDocument();
    expect(screen.getByText(/Auto-compact when context > 90%/)).toBeInTheDocument();
  });

  it('renders Create Rule button and calls onCreateRule', () => {
    const onCreateRule = vi.fn();
    render(
      <WorkflowSuggestion
        pattern="Pattern detected"
        suggestedRule="Suggested rule"
        onCreateRule={onCreateRule}
        onDismiss={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Create Rule'));
    expect(onCreateRule).toHaveBeenCalledTimes(1);
  });

  it('dismisses when "Not now" is clicked and calls onDismiss', () => {
    const onDismiss = vi.fn();
    render(
      <WorkflowSuggestion
        pattern="Pattern detected"
        suggestedRule="Suggested rule"
        onCreateRule={vi.fn()}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByText('Not now'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    // Component should disappear after dismiss
    expect(screen.queryByText('Pattern detected')).not.toBeInTheDocument();
  });

  it('dismisses when X button is clicked', () => {
    const onDismiss = vi.fn();
    render(
      <WorkflowSuggestion
        pattern="Pattern detected"
        suggestedRule="Suggested rule"
        onCreateRule={vi.fn()}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByLabelText('Dismiss'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Pattern detected')).not.toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// WORKFLOW — WorkflowActivityLog
// ═════════════════════════════════════════════════════════════════════════════

describe('WorkflowActivityLog', () => {
  it('renders empty state when no activity', () => {
    render(<WorkflowActivityLog />);
    expect(screen.getByText('No automation events this session')).toBeInTheDocument();
  });
});
