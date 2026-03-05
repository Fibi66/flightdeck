/**
 * Approximate per-token costs in USD (Sonnet-class model).
 * Single source of truth for web UI cost calculations.
 * Keep in sync with packages/server/src/constants/pricing.ts.
 */
export const INPUT_COST_PER_TOKEN = 3.0 / 1_000_000;   // ~$3/MTok
export const OUTPUT_COST_PER_TOKEN = 15.0 / 1_000_000;  // ~$15/MTok

/** Estimate total cost in USD from token counts */
export function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  return inputTokens * INPUT_COST_PER_TOKEN + outputTokens * OUTPUT_COST_PER_TOKEN;
}
