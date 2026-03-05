import { describe, it, expect, vi } from 'vitest';
import { DebateDetector, type Debate } from '../coordination/DebateDetector.js';
import type { ActivityEntry, ActionType } from '../coordination/ActivityLedger.js';

function makeMsg(overrides: Partial<ActivityEntry> & { summary: string }): ActivityEntry {
  return {
    id: Math.floor(Math.random() * 100000),
    agentId: 'agent-1',
    agentRole: 'Developer',
    actionType: 'message_sent' as ActionType,
    timestamp: new Date().toISOString(),
    details: {},
    projectId: 'lead-1',
    ...overrides,
  };
}

function createMockLedger(entries: ActivityEntry[]) {
  return {
    getSince: vi.fn(() => entries),
    getRecent: vi.fn(() => entries),
  };
}

describe('DebateDetector', () => {
  it('detects no debates in empty activity', () => {
    const detector = new DebateDetector(createMockLedger([]) as any);
    expect(detector.detectDebates('lead-1')).toEqual([]);
  });

  it('detects no debates in non-disagreement messages', () => {
    const entries = [
      makeMsg({ agentId: 'a1', summary: 'I finished the implementation' }),
      makeMsg({ agentId: 'a2', summary: 'Great work, looks good' }),
    ];
    const detector = new DebateDetector(createMockLedger(entries) as any);
    expect(detector.detectDebates('lead-1')).toEqual([]);
  });

  it('detects debate with strong disagreement patterns', () => {
    const now = Date.now();
    const entries = [
      makeMsg({ agentId: 'a1', summary: 'I think we should use SQLite for storage', timestamp: new Date(now).toISOString() }),
      makeMsg({ agentId: 'a2', summary: 'I disagree — PostgreSQL would be better for this use case', timestamp: new Date(now + 1000).toISOString() }),
      makeMsg({ agentId: 'a1', summary: 'But I think SQLite is simpler for our needs', timestamp: new Date(now + 2000).toISOString() }),
    ];
    const detector = new DebateDetector(createMockLedger(entries) as any);
    const debates = detector.detectDebates('lead-1');
    expect(debates).toHaveLength(1);
    expect(debates[0].status).toBe('active');
    expect(debates[0].participants).toContain('a1');
    expect(debates[0].participants).toContain('a2');
    expect(debates[0].confidence).toBeGreaterThanOrEqual(30);
  });

  it('detects resolved debate', () => {
    const now = Date.now();
    const entries = [
      makeMsg({ agentId: 'a1', summary: 'We should refactor the router', timestamp: new Date(now).toISOString() }),
      makeMsg({ agentId: 'a2', summary: 'I disagree, the current design works fine', timestamp: new Date(now + 1000).toISOString() }),
      makeMsg({ agentId: 'a1', summary: 'I don\'t think that\'s right — the router is fragile', timestamp: new Date(now + 2000).toISOString() }),
      makeMsg({ agentId: 'a2', summary: 'Fair point, let\'s go with the refactor approach', timestamp: new Date(now + 3000).toISOString() }),
    ];
    const detector = new DebateDetector(createMockLedger(entries) as any);
    const debates = detector.detectDebates('lead-1');
    expect(debates).toHaveLength(1);
    expect(debates[0].status).toBe('resolved');
    expect(debates[0].resolution).toBeDefined();
  });

  it('requires at least 2 participants', () => {
    const now = Date.now();
    const entries = [
      makeMsg({ agentId: 'a1', summary: 'I disagree with this approach', timestamp: new Date(now).toISOString() }),
      makeMsg({ agentId: 'a1', summary: 'I also push back on this design', timestamp: new Date(now + 1000).toISOString() }),
    ];
    const detector = new DebateDetector(createMockLedger(entries) as any);
    expect(detector.detectDebates('lead-1')).toEqual([]);
  });

  it('detects debate with moderate patterns (needs multiple signals)', () => {
    const now = Date.now();
    const entries = [
      makeMsg({ agentId: 'a1', summary: 'Let\'s use a monorepo structure', timestamp: new Date(now).toISOString() }),
      makeMsg({ agentId: 'a2', summary: 'But I think separate repos would be cleaner', timestamp: new Date(now + 1000).toISOString() }),
      makeMsg({ agentId: 'a1', summary: 'Have you considered the deployment complexity?', timestamp: new Date(now + 2000).toISOString() }),
      makeMsg({ agentId: 'a2', summary: 'On the other hand, monorepo does simplify CI', timestamp: new Date(now + 3000).toISOString() }),
    ];
    const detector = new DebateDetector(createMockLedger(entries) as any);
    const debates = detector.detectDebates('lead-1');
    expect(debates).toHaveLength(1);
    expect(debates[0].confidence).toBeGreaterThanOrEqual(40);
  });

  it('positions include agent details', () => {
    const now = Date.now();
    const entries = [
      makeMsg({ agentId: 'a1', agentRole: 'Architect', summary: 'We need microservices', timestamp: new Date(now).toISOString() }),
      makeMsg({ agentId: 'a2', agentRole: 'Developer', summary: 'I disagree — monolith is simpler for this scale', timestamp: new Date(now + 1000).toISOString() }),
      makeMsg({ agentId: 'a1', agentRole: 'Architect', summary: 'But I think microservices give us better scaling', timestamp: new Date(now + 2000).toISOString() }),
    ];
    const detector = new DebateDetector(createMockLedger(entries) as any);
    const debates = detector.detectDebates('lead-1');
    expect(debates).toHaveLength(1);
    expect(debates[0].positions.length).toBeGreaterThan(0);
    expect(debates[0].positions[0].agentRole).toBeDefined();
  });

  it('filters low-confidence debates', () => {
    const now = Date.now();
    // Very weak signal — single moderate pattern
    const entries = [
      makeMsg({ agentId: 'a1', summary: 'Proposal A', timestamp: new Date(now).toISOString() }),
      makeMsg({ agentId: 'a2', summary: 'What if we tried something else?', timestamp: new Date(now + 1000).toISOString() }),
    ];
    const detector = new DebateDetector(createMockLedger(entries) as any);
    const debates = detector.detectDebates('lead-1');
    // May or may not be detected — but if detected, confidence must be >= 40
    for (const d of debates) {
      expect(d.confidence).toBeGreaterThanOrEqual(40);
    }
  });
});
