/**
 * ProviderManager — Detect, configure, and test CLI provider connections.
 *
 * Reads provider configuration from presets, checks environment variables
 * for API keys, persists enabled/disabled state in the database, and
 * performs lightweight connection tests.
 */

import type { Database } from '../db/database.js';
import { PROVIDER_PRESETS, type ProviderId, type ProviderPreset } from '../adapters/presets.js';

// ── Types ────────────────────────────────────────────────────────

export interface ProviderStatus {
  id: ProviderId;
  name: string;
  /** Whether the required API key / env var is set. */
  configured: boolean;
  /** Masked API key (e.g., 'sk-ant-...****'), or null if not set. */
  maskedKey: string | null;
  /** Whether the provider is enabled in settings. */
  enabled: boolean;
  /** Names of required env vars for this provider. */
  requiredEnvVars: string[];
}

export interface ConnectionTestResult {
  success: boolean;
  error?: string;
  latencyMs: number;
}

// ── Constants ────────────────────────────────────────────────────

const SETTING_PREFIX = 'provider:';
const SETTING_SUFFIX = ':enabled';

/** Extra env vars checked for providers beyond what presets declare. */
const EXTRA_ENV_VARS: Partial<Record<ProviderId, string[]>> = {
  copilot: ['GITHUB_TOKEN', 'COPILOT_TOKEN'],
  gemini: ['GOOGLE_API_KEY'],
};

const CONNECTION_TIMEOUT_MS = 10_000;

// ── ProviderManager ──────────────────────────────────────────────

export class ProviderManager {
  private readonly db: Database | undefined;
  private readonly env: Record<string, string | undefined>;

  constructor(opts: { db?: Database; env?: Record<string, string | undefined> } = {}) {
    this.db = opts.db;
    this.env = opts.env ?? process.env;
  }

  // ── Status ───────────────────────────────────────────────

  /** Get status for a single provider. */
  getProviderStatus(provider: ProviderId): ProviderStatus {
    const preset = PROVIDER_PRESETS[provider];
    if (!preset) throw new Error(`Unknown provider: ${provider}`);

    const envVars = this.getEnvVarsForProvider(provider, preset);
    const keyValue = this.findFirstEnvVar(envVars);

    return {
      id: provider,
      name: preset.name,
      configured: keyValue !== undefined,
      maskedKey: keyValue ? maskApiKey(keyValue) : null,
      enabled: this.isProviderEnabled(provider),
      requiredEnvVars: envVars,
    };
  }

  /** Get status for all providers. */
  getAllProviderStatuses(): ProviderStatus[] {
    return (Object.keys(PROVIDER_PRESETS) as ProviderId[]).map((id) =>
      this.getProviderStatus(id),
    );
  }

  // ── Enabled/Disabled ─────────────────────────────────────

  /** Check if a provider is enabled. Defaults to true if no setting. */
  isProviderEnabled(provider: ProviderId): boolean {
    if (!this.db) return true;
    const val = this.db.getSetting(`${SETTING_PREFIX}${provider}${SETTING_SUFFIX}`);
    return val !== 'false';
  }

  /** Set whether a provider is enabled. */
  setProviderEnabled(provider: ProviderId, enabled: boolean): void {
    if (!this.db) return;
    this.db.setSetting(`${SETTING_PREFIX}${provider}${SETTING_SUFFIX}`, String(enabled));
  }

  // ── Connection Testing ───────────────────────────────────

  /**
   * Test connectivity to a provider's API.
   * Uses a lightweight API call (list models or minimal request).
   * Times out after 10 seconds.
   */
  async testConnection(provider: ProviderId): Promise<ConnectionTestResult> {
    const preset = PROVIDER_PRESETS[provider];
    if (!preset) return { success: false, error: `Unknown provider: ${provider}`, latencyMs: 0 };

    const envVars = this.getEnvVarsForProvider(provider, preset);
    const apiKey = this.findFirstEnvVar(envVars);
    if (!apiKey && envVars.length > 0) {
      return {
        success: false,
        error: `Missing API key. Set one of: ${envVars.join(', ')}`,
        latencyMs: 0,
      };
    }

    const start = Date.now();
    try {
      await this.doConnectionTest(provider, apiKey);
      return { success: true, latencyMs: Date.now() - start };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || String(err),
        latencyMs: Date.now() - start,
      };
    }
  }

  // ── Internals ────────────────────────────────────────────

  /** Get all env var names to check for a provider. */
  private getEnvVarsForProvider(provider: ProviderId, preset: ProviderPreset): string[] {
    const vars = [...(preset.requiredEnvVars ?? [])];
    const extra = EXTRA_ENV_VARS[provider];
    if (extra) vars.push(...extra);
    return vars;
  }

  /** Return the value of the first set env var, or undefined. */
  private findFirstEnvVar(varNames: string[]): string | undefined {
    for (const name of varNames) {
      const val = this.env[name];
      if (val) return val;
    }
    return undefined;
  }

  /** Perform a provider-specific connection test. */
  private async doConnectionTest(provider: ProviderId, apiKey?: string): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONNECTION_TIMEOUT_MS);

    try {
      switch (provider) {
        case 'claude':
          await this.testAnthropicConnection(apiKey!, controller.signal);
          break;
        case 'gemini':
          await this.testGeminiConnection(apiKey!, controller.signal);
          break;
        case 'codex':
        case 'opencode':
          await this.testOpenAIConnection(apiKey!, controller.signal);
          break;
        case 'copilot':
          // Copilot uses GitHub token — just verify the token is valid
          await this.testGitHubConnection(apiKey!, controller.signal);
          break;
        case 'cursor':
          // Cursor doesn't have a public API to test — check key format
          if (!apiKey) throw new Error('CURSOR_API_KEY not set');
          break;
        default:
          throw new Error(`Connection testing not supported for provider: ${provider}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  private async testAnthropicConnection(apiKey: string, signal: AbortSignal): Promise<void> {
    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      signal,
    });
    if (!res.ok) throw new Error(`Anthropic API returned ${res.status}: ${res.statusText}`);
  }

  private async testGeminiConnection(apiKey: string, signal: AbortSignal): Promise<void> {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      { signal },
    );
    if (!res.ok) throw new Error(`Gemini API returned ${res.status}: ${res.statusText}`);
  }

  private async testOpenAIConnection(apiKey: string, signal: AbortSignal): Promise<void> {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal,
    });
    if (!res.ok) throw new Error(`OpenAI API returned ${res.status}: ${res.statusText}`);
  }

  private async testGitHubConnection(token: string, signal: AbortSignal): Promise<void> {
    const res = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    });
    if (!res.ok) throw new Error(`GitHub API returned ${res.status}: ${res.statusText}`);
  }
}

// ── Utility functions ────────────────────────────────────────────

/**
 * Mask an API key for display: show first 8 and last 4 characters.
 * Short keys (< 16 chars) show first 4 + last 2.
 */
export function maskApiKey(key: string): string {
  if (!key) return '****';
  if (key.length < 8) return '****';
  if (key.length < 16) return `${key.slice(0, 4)}...${key.slice(-2)}`;
  return `${key.slice(0, 8)}...${key.slice(-4)}`;
}
