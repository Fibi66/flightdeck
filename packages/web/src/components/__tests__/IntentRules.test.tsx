import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { IntentRuleV2 } from '../IntentRules/types';
import { ACTION_DISPLAY, TRUST_PRESETS } from '../IntentRules/types';

// Mock apiFetch
vi.mock('../../hooks/useApi', () => ({
  apiFetch: vi.fn().mockResolvedValue([]),
}));

import { IntentRulesDashboard } from '../IntentRules/IntentRulesDashboard';
import { TrustPresetBar } from '../IntentRules/TrustPresetBar';
import { RuleRow } from '../IntentRules/RuleRow';
import { RuleEditor } from '../IntentRules/RuleEditor';

// ── Test Data ──────────────────────────────────────────────────────

const makeRule = (overrides: Partial<IntentRuleV2> = {}): IntentRuleV2 => ({
  id: 'rule-1',
  name: 'Auto-approve style from devs',
  enabled: true,
  priority: 1,
  action: 'auto-approve',
  match: { categories: ['style'], roles: ['developer'] },
  conditions: [],
  metadata: {
    source: 'manual',
    matchCount: 47,
    lastMatchedAt: new Date().toISOString(),
    effectivenessScore: 94,
    issuesAfterMatch: 0,
    createdAt: new Date().toISOString(),
  },
  ...overrides,
});

// ── Tests ──────────────────────────────────────────────────────────

describe('Intent Rules V2', () => {
  describe('IntentRulesDashboard', () => {
    it('renders empty state with no rules', async () => {
      render(<IntentRulesDashboard />);
      const dashboard = await screen.findByTestId('intent-rules-dashboard');
      expect(dashboard).toBeInTheDocument();
      expect(screen.getByText('New Rule')).toBeInTheDocument();
    });
  });

  describe('TrustPresetBar', () => {
    it('renders all three presets', () => {
      render(<TrustPresetBar active={null} onSelect={vi.fn()} />);
      expect(screen.getByText('Conservative')).toBeInTheDocument();
      expect(screen.getByText('Moderate')).toBeInTheDocument();
      expect(screen.getByText('Autonomous')).toBeInTheDocument();
    });

    it('highlights active preset with description', () => {
      render(<TrustPresetBar active="moderate" onSelect={vi.fn()} />);
      expect(screen.getByText(/"Routine decisions/)).toBeInTheDocument();
    });

    it('calls onSelect when clicked', () => {
      const onSelect = vi.fn();
      render(<TrustPresetBar active={null} onSelect={onSelect} />);
      fireEvent.click(screen.getByText('Autonomous'));
      expect(onSelect).toHaveBeenCalledWith('autonomous');
    });
  });

  describe('RuleRow', () => {
    it('renders rule with name and match count', () => {
      render(
        <RuleRow
          rule={makeRule()}
          onToggle={vi.fn()}
          onDelete={vi.fn()}
          onSave={vi.fn()}
        />,
      );
      expect(screen.getByText('Auto-approve style from devs')).toBeInTheDocument();
      expect(screen.getByText('47 matches')).toBeInTheDocument();
    });

    it('shows role badges', () => {
      render(
        <RuleRow rule={makeRule()} onToggle={vi.fn()} onDelete={vi.fn()} onSave={vi.fn()} />,
      );
      expect(screen.getByText('developer')).toBeInTheDocument();
    });

    it('shows warning for low effectiveness', () => {
      const rule = makeRule({
        metadata: { ...makeRule().metadata, effectivenessScore: 33, issuesAfterMatch: 2 },
      });
      render(
        <RuleRow rule={rule} onToggle={vi.fn()} onDelete={vi.fn()} onSave={vi.fn()} />,
      );
      expect(screen.getByText(/2 auto-approved preceded failures/)).toBeInTheDocument();
    });

    it('expands to show editor on click', () => {
      render(
        <RuleRow rule={makeRule()} onToggle={vi.fn()} onDelete={vi.fn()} onSave={vi.fn()} />,
      );
      fireEvent.click(screen.getByText('Auto-approve style from devs'));
      expect(screen.getByTestId('rule-editor')).toBeInTheDocument();
    });
  });

  describe('RuleEditor', () => {
    it('renders with save and cancel buttons', () => {
      render(<RuleEditor onSave={vi.fn()} onCancel={vi.fn()} />);
      expect(screen.getByText('Save Rule')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    it('shows category chips', () => {
      render(<RuleEditor onSave={vi.fn()} onCancel={vi.fn()} />);
      expect(screen.getByText(/Style/)).toBeInTheDocument();
      expect(screen.getByText(/Architecture/)).toBeInTheDocument();
    });

    it('can add conditions', () => {
      render(<RuleEditor onSave={vi.fn()} onCancel={vi.fn()} />);
      fireEvent.click(screen.getByText('+ Add condition'));
      // Should show condition controls
      expect(screen.getByDisplayValue('50')).toBeInTheDocument();
    });
  });

  describe('types', () => {
    it('ACTION_DISPLAY covers all actions', () => {
      expect(ACTION_DISPLAY['auto-approve'].label).toBe('Auto-approve');
      expect(ACTION_DISPLAY['require-review'].label).toBe('Require review');
      expect(ACTION_DISPLAY['auto-reject'].label).toBe('Auto-reject');
      expect(ACTION_DISPLAY['queue-silent'].label).toBe('Queue silent');
    });

    it('TRUST_PRESETS covers all presets', () => {
      expect(TRUST_PRESETS.conservative).toBeDefined();
      expect(TRUST_PRESETS.moderate).toBeDefined();
      expect(TRUST_PRESETS.autonomous).toBeDefined();
    });
  });
});
