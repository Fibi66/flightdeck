import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProviderManager, maskApiKey } from '../ProviderManager.js';
import type { Database } from '../../db/database.js';

// ── Mock DB ──────────────────────────────────────────────────────

function createMockDb(): Database {
  const store = new Map<string, string>();
  return {
    getSetting: vi.fn((key: string) => store.get(key)),
    setSetting: vi.fn((key: string, value: string) => { store.set(key, value); }),
  } as unknown as Database;
}

// ── Tests ────────────────────────────────────────────────────────

describe('ProviderManager', () => {
  let db: Database;
  let env: Record<string, string | undefined>;

  beforeEach(() => {
    db = createMockDb();
    env = {};
  });

  function createManager() {
    return new ProviderManager({ db, env });
  }

  // ── getProviderStatus ────────────────────────────────────

  describe('getProviderStatus', () => {
    it('detects configured claude provider', () => {
      env.ANTHROPIC_API_KEY = 'sk-ant-abc123xyz789';
      const status = createManager().getProviderStatus('claude');

      expect(status.id).toBe('claude');
      expect(status.name).toBe('Claude Code');
      expect(status.configured).toBe(true);
      expect(status.maskedKey).toBe('sk-ant-a...z789');
      expect(status.enabled).toBe(true);
    });

    it('detects unconfigured provider', () => {
      const status = createManager().getProviderStatus('claude');

      expect(status.configured).toBe(false);
      expect(status.maskedKey).toBeNull();
    });

    it('checks extra env vars for copilot', () => {
      env.GITHUB_TOKEN = 'ghp_abc123def456';
      const status = createManager().getProviderStatus('copilot');

      expect(status.configured).toBe(true);
      expect(status.maskedKey).toBe('ghp_abc1...f456');
    });

    it('checks COPILOT_TOKEN as alternative', () => {
      env.COPILOT_TOKEN = 'ghu_tokenvalue123456';
      const status = createManager().getProviderStatus('copilot');

      expect(status.configured).toBe(true);
    });

    it('checks GOOGLE_API_KEY as fallback for gemini', () => {
      env.GOOGLE_API_KEY = 'AIzaSy_testkey12345';
      const status = createManager().getProviderStatus('gemini');

      expect(status.configured).toBe(true);
    });

    it('prefers primary env var over fallback', () => {
      env.GEMINI_API_KEY = 'primary-key';
      env.GOOGLE_API_KEY = 'fallback-key';
      const status = createManager().getProviderStatus('gemini');

      expect(status.maskedKey).toBe('prim...ey');
    });

    it('throws for unknown provider', () => {
      expect(() => createManager().getProviderStatus('unknown' as any)).toThrow('Unknown provider');
    });

    it('lists required env vars', () => {
      const status = createManager().getProviderStatus('claude');
      expect(status.requiredEnvVars).toContain('ANTHROPIC_API_KEY');
    });
  });

  // ── getAllProviderStatuses ────────────────────────────────

  describe('getAllProviderStatuses', () => {
    it('returns status for all 6 providers', () => {
      const statuses = createManager().getAllProviderStatuses();

      expect(statuses).toHaveLength(6);
      const ids = statuses.map((s) => s.id).sort();
      expect(ids).toEqual(['claude', 'codex', 'copilot', 'cursor', 'gemini', 'opencode']);
    });

    it('shows multiple configured providers', () => {
      env.ANTHROPIC_API_KEY = 'sk-ant-test';
      env.OPENAI_API_KEY = 'sk-test-openai';

      const statuses = createManager().getAllProviderStatuses();
      const configured = statuses.filter((s) => s.configured);

      expect(configured.length).toBeGreaterThanOrEqual(2);
      expect(configured.map((s) => s.id)).toContain('claude');
      expect(configured.map((s) => s.id)).toContain('codex');
    });
  });

  // ── isProviderEnabled / setProviderEnabled ────────────────

  describe('enabled/disabled', () => {
    it('defaults to enabled when no setting exists', () => {
      expect(createManager().isProviderEnabled('claude')).toBe(true);
    });

    it('returns true when setting is "true"', () => {
      (db.setSetting as any)('provider:claude:enabled', 'true');
      expect(createManager().isProviderEnabled('claude')).toBe(true);
    });

    it('returns false when setting is "false"', () => {
      (db.setSetting as any)('provider:claude:enabled', 'false');
      expect(createManager().isProviderEnabled('claude')).toBe(false);
    });

    it('persists enabled state', () => {
      const mgr = createManager();
      mgr.setProviderEnabled('gemini', false);
      expect(mgr.isProviderEnabled('gemini')).toBe(false);

      mgr.setProviderEnabled('gemini', true);
      expect(mgr.isProviderEnabled('gemini')).toBe(true);
    });

    it('reflects disabled in provider status', () => {
      const mgr = createManager();
      mgr.setProviderEnabled('claude', false);

      const status = mgr.getProviderStatus('claude');
      expect(status.enabled).toBe(false);
    });

    it('defaults to enabled without db', () => {
      const mgr = new ProviderManager({ env });
      expect(mgr.isProviderEnabled('claude')).toBe(true);
    });
  });

  // ── testConnection ────────────────────────────────────────

  describe('testConnection', () => {
    it('returns error for missing API key', async () => {
      const result = await createManager().testConnection('claude');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing API key');
      expect(result.error).toContain('ANTHROPIC_API_KEY');
      expect(result.latencyMs).toBe(0);
    });

    it('returns error for unknown provider', async () => {
      const result = await createManager().testConnection('unknown' as any);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown provider');
    });

    it('succeeds for cursor with API key (format check only)', async () => {
      env.CURSOR_API_KEY = 'cursor-key-123';
      const result = await createManager().testConnection('cursor');

      expect(result.success).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('catches fetch errors gracefully', async () => {
      env.ANTHROPIC_API_KEY = 'sk-ant-invalid';
      const mgr = createManager();

      // Mock global fetch to simulate network error
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network unreachable'));

      try {
        const result = await mgr.testConnection('claude');
        expect(result.success).toBe(false);
        expect(result.error).toBe('Network unreachable');
        expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('catches HTTP error responses', async () => {
      env.ANTHROPIC_API_KEY = 'sk-ant-invalid';
      const mgr = createManager();

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      try {
        const result = await mgr.testConnection('claude');
        expect(result.success).toBe(false);
        expect(result.error).toContain('401');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('measures latency on success', async () => {
      env.OPENAI_API_KEY = 'sk-test';
      const mgr = createManager();

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

      try {
        const result = await mgr.testConnection('codex');
        expect(result.success).toBe(true);
        expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});

// ── maskApiKey ───────────────────────────────────────────────────

describe('maskApiKey', () => {
  it('masks long key (first 8 + last 4)', () => {
    expect(maskApiKey('sk-ant-abc123xyz456def789')).toBe('sk-ant-a...f789');
  });

  it('masks medium key (first 4 + last 2)', () => {
    expect(maskApiKey('abcdefghijkl')).toBe('abcd...kl');
  });

  it('masks very short key', () => {
    expect(maskApiKey('short')).toBe('****');
  });

  it('handles empty string', () => {
    expect(maskApiKey('')).toBe('****');
  });

  it('masks GitHub token format', () => {
    expect(maskApiKey('ghp_abc123def456ghi789')).toBe('ghp_abc1...i789');
  });

  it('masks exactly 16 chars', () => {
    expect(maskApiKey('1234567890123456')).toBe('12345678...3456');
  });

  it('masks exactly 8 chars (medium)', () => {
    expect(maskApiKey('12345678')).toBe('1234...78');
  });
});
