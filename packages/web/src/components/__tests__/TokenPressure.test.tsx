import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useAppStore } from '../../stores/appStore';
import type { AgentInfo, Role } from '../../types';
import { TokenEconomics } from '../TokenEconomics/TokenEconomics';
import { detectAlerts } from '../MissionControl/AlertsPanel';

function makeRole(overrides: Partial<Role> = {}): Role {
  return {
    id: 'developer',
    name: 'Developer',
    description: 'Writes code',
    systemPrompt: '',
    color: '#3B82F6',
    icon: '💻',
    builtIn: true,
    ...overrides,
  };
}

function makeAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id: `agent-${Math.random().toString(36).slice(2, 10)}`,
    role: makeRole(),
    status: 'running',
    childIds: [],
    createdAt: new Date().toISOString(),
    outputPreview: '',
    autopilot: true,
    ...overrides,
  };
}

beforeEach(() => {
  useAppStore.getState().setAgents([]);
});

describe('TokenEconomics — burn rate display', () => {
  it('shows burn rate when contextBurnRate is available', () => {
    useAppStore.getState().setAgents([
      makeAgent({
        inputTokens: 100_000,
        outputTokens: 50_000,
        contextWindowSize: 200_000,
        contextWindowUsed: 120_000,
        contextBurnRate: 50, // 50 tokens/sec = ~3k/min
        estimatedExhaustionMinutes: 8,
      }),
    ]);
    render(<TokenEconomics />);
    expect(screen.getByText('~3.0k/min')).toBeDefined();
    expect(screen.getByText('~8 min left')).toBeDefined();
  });

  it('shows "Calculating..." when no burn rate data', () => {
    useAppStore.getState().setAgents([
      makeAgent({
        inputTokens: 10_000,
        outputTokens: 5_000,
        contextWindowSize: 200_000,
        contextWindowUsed: 10_000,
      }),
    ]);
    render(<TokenEconomics />);
    expect(screen.getByText('Calculating…')).toBeDefined();
  });

  it('shows Burn Rate column header', () => {
    useAppStore.getState().setAgents([
      makeAgent({ inputTokens: 1000, outputTokens: 500 }),
    ]);
    render(<TokenEconomics />);
    expect(screen.getByText('Burn Rate')).toBeDefined();
  });
});

describe('detectAlerts — actionable alerts', () => {
  it('adds actions to context pressure alerts', () => {
    const agents = [
      makeAgent({
        contextWindowSize: 200_000,
        contextWindowUsed: 180_000,
        contextBurnRate: 100,
        estimatedExhaustionMinutes: 3,
      }),
    ];
    const alerts = detectAlerts(agents, [], null);
    const ctxAlert = alerts.find((a) => a.id.startsWith('ctx-'));
    expect(ctxAlert).toBeDefined();
    expect(ctxAlert!.actions).toBeDefined();
    expect(ctxAlert!.actions!.length).toBeGreaterThanOrEqual(2);
    expect(ctxAlert!.actions!.some((a) => a.label === 'Compress context')).toBe(true);
    expect(ctxAlert!.actions!.some((a) => a.label === 'Switch model')).toBe(true);
  });

  it('fires proactive burn-rate alert when <10 min remaining but context <70%', () => {
    const agents = [
      makeAgent({
        contextWindowSize: 200_000,
        contextWindowUsed: 100_000, // 50% — below 70% threshold
        contextBurnRate: 200,
        estimatedExhaustionMinutes: 8,
      }),
    ];
    const alerts = detectAlerts(agents, [], null);
    const burnAlert = alerts.find((a) => a.id.startsWith('burn-'));
    expect(burnAlert).toBeDefined();
    expect(burnAlert!.severity).toBe('warning');
    expect(burnAlert!.icon).toBe('🔥');
  });

  it('fires critical burn-rate alert when <5 min remaining', () => {
    const agents = [
      makeAgent({
        contextWindowSize: 200_000,
        contextWindowUsed: 100_000,
        contextBurnRate: 500,
        estimatedExhaustionMinutes: 3,
      }),
    ];
    const alerts = detectAlerts(agents, [], null);
    const burnAlert = alerts.find((a) => a.id.startsWith('burn-'));
    expect(burnAlert).toBeDefined();
    expect(burnAlert!.severity).toBe('critical');
  });

  it('includes burn rate info in alert detail', () => {
    const agents = [
      makeAgent({
        contextWindowSize: 200_000,
        contextWindowUsed: 180_000,
        contextBurnRate: 50,
        estimatedExhaustionMinutes: 7,
      }),
    ];
    const alerts = detectAlerts(agents, [], null);
    const ctxAlert = alerts.find((a) => a.id.startsWith('ctx-'));
    expect(ctxAlert!.detail).toContain('tok/min');
    expect(ctxAlert!.detail).toContain('min remaining');
  });
});
