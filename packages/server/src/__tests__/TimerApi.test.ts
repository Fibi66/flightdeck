import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TimerRegistry } from '../coordination/TimerRegistry.js';

describe('Timer API data shape', () => {
  let registry: TimerRegistry;

  beforeEach(() => {
    registry = new TimerRegistry();
  });

  afterEach(() => {
    registry.stop();
  });

  it('getAllTimers returns active timers with expected fields', () => {
    registry.create('agent-1', {
      label: 'check-build',
      message: 'Check if the build passed',
      delaySeconds: 300,
    });

    const timers = registry.getAllTimers();
    expect(timers).toHaveLength(1);
    expect(timers[0]).toMatchObject({
      agentId: 'agent-1',
      label: 'check-build',
      message: 'Check if the build passed',
      fired: false,
      repeat: false,
    });
    expect(timers[0].id).toBeDefined();
    expect(timers[0].fireAt).toBeGreaterThan(Date.now());
    expect(timers[0].createdAt).toBeDefined();
  });

  it('includes repeat timers with intervalSeconds', () => {
    registry.create('agent-2', {
      label: 'poll-status',
      message: 'Check status',
      delaySeconds: 60,
      repeat: true,
    });

    const timers = registry.getAllTimers();
    expect(timers).toHaveLength(1);
    expect(timers[0].repeat).toBe(true);
    expect(timers[0].intervalSeconds).toBe(60);
  });

  it('timer API response shape includes remainingMs', () => {
    registry.create('agent-1', {
      label: 'test-timer',
      message: 'Hello',
      delaySeconds: 120,
    });

    const timers = registry.getAllTimers();
    // Simulate what the API endpoint does
    const apiResponse = timers.map(t => ({
      id: t.id,
      agentId: t.agentId,
      label: t.label,
      message: t.message,
      fireAt: t.fireAt,
      createdAt: t.createdAt,
      fired: t.fired,
      repeat: t.repeat,
      intervalSeconds: t.intervalSeconds,
      remainingMs: t.fired ? 0 : Math.max(0, t.fireAt - Date.now()),
    }));

    expect(apiResponse).toHaveLength(1);
    expect(apiResponse[0].remainingMs).toBeGreaterThan(0);
    expect(apiResponse[0].remainingMs).toBeLessThanOrEqual(120_000);
  });

  it('fired timers have remainingMs of 0', () => {
    // Create a timer with very short delay
    registry.create('agent-1', {
      label: 'instant',
      message: 'Now',
      delaySeconds: 0,
    });

    const timers = registry.getAllTimers();
    // Timer with 0 delay should have fireAt <= now
    const apiResponse = timers.map(t => ({
      ...t,
      remainingMs: t.fired ? 0 : Math.max(0, t.fireAt - Date.now()),
    }));

    // remainingMs should be 0 or very close to 0
    expect(apiResponse[0].remainingMs).toBeLessThanOrEqual(100);
  });

  it('returns timers from multiple agents', () => {
    registry.create('agent-1', { label: 'timer-a', message: 'A', delaySeconds: 60 });
    registry.create('agent-2', { label: 'timer-b', message: 'B', delaySeconds: 120 });
    registry.create('agent-1', { label: 'timer-c', message: 'C', delaySeconds: 180 });

    const timers = registry.getAllTimers();
    expect(timers).toHaveLength(3);

    const agent1Timers = timers.filter(t => t.agentId === 'agent-1');
    const agent2Timers = timers.filter(t => t.agentId === 'agent-2');
    expect(agent1Timers).toHaveLength(2);
    expect(agent2Timers).toHaveLength(1);
  });

  it('cancelled timers are removed from getAllTimers', () => {
    const timer = registry.create('agent-1', { label: 'will-cancel', message: 'X', delaySeconds: 60 });
    expect(registry.getAllTimers()).toHaveLength(1);

    registry.cancel(timer!.id, 'agent-1');
    expect(registry.getAllTimers()).toHaveLength(0);
  });
});
