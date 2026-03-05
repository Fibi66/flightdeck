import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AlertEngine } from '../coordination/AlertEngine.js';
import type { Alert, AlertAction } from '../coordination/AlertEngine.js';

describe('AlertEngine — Actionable Alerts', () => {
  it('Alert interface supports actions array', () => {
    const action: AlertAction = {
      label: 'Compress context',
      description: 'Restart agent with context handoff',
      actionType: 'api_call',
      endpoint: '/api/agents/123/restart',
      method: 'POST',
      confidence: 90,
    };

    const alert: Alert = {
      id: 1,
      type: 'context_pressure',
      severity: 'warning',
      message: 'Agent at 90%',
      timestamp: new Date().toISOString(),
      agentId: 'agent-123',
      actions: [action],
    };

    expect(alert.actions).toHaveLength(1);
    expect(alert.actions![0].label).toBe('Compress context');
    expect(alert.actions![0].confidence).toBe(90);
  });

  it('AlertAction supports optional body and confidence fields', () => {
    const action: AlertAction = {
      label: 'Switch model',
      description: 'Change to a larger model',
      actionType: 'api_call',
      endpoint: '/api/agents/123',
      method: 'POST',
      body: { model: 'claude-opus-4.6-1m' },
      confidence: 70,
    };

    expect(action.body).toEqual({ model: 'claude-opus-4.6-1m' });
    expect(action.confidence).toBe(70);
  });

  it('Alert without actions is valid (backwards compatible)', () => {
    const alert: Alert = {
      id: 2,
      type: 'stuck_agent',
      severity: 'info',
      message: 'Agent stuck',
      timestamp: new Date().toISOString(),
    };

    expect(alert.actions).toBeUndefined();
  });

  it('Dismiss action uses empty endpoint', () => {
    const dismiss: AlertAction = {
      label: 'Dismiss',
      description: 'Ignore this alert',
      actionType: 'api_call',
      endpoint: '',
      method: 'POST',
      confidence: 10,
    };

    expect(dismiss.endpoint).toBe('');
    expect(dismiss.confidence).toBe(10);
  });

  it('actions can be sorted by confidence descending', () => {
    const actions: AlertAction[] = [
      { label: 'Dismiss', description: '', actionType: 'api_call', endpoint: '', method: 'POST', confidence: 10 },
      { label: 'Compress', description: '', actionType: 'api_call', endpoint: '/restart', method: 'POST', confidence: 90 },
      { label: 'Switch', description: '', actionType: 'api_call', endpoint: '/model', method: 'POST', confidence: 70 },
    ];

    const sorted = [...actions].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
    expect(sorted[0].label).toBe('Compress');
    expect(sorted[1].label).toBe('Switch');
    expect(sorted[2].label).toBe('Dismiss');
  });
});
