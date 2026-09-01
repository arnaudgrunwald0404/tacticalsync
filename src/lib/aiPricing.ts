/**
 * Anthropic model pricing for the admin AI Usage panel.
 *
 * Cost is computed at display time from token counts stored in ai_usage_log,
 * so a price change here never requires rewriting logged history. Rates are
 * USD per million tokens (first-party Anthropic API rates).
 */

export interface ModelRate {
  /** USD per 1M input tokens */
  input: number;
  /** USD per 1M output tokens */
  output: number;
}

// Keyed by normalized model id (date suffix stripped — see normalizeModelId).
export const MODEL_RATES: Record<string, ModelRate> = {
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-opus-5": { input: 5, output: 25 },
};

// Unknown models fall back to the most expensive rate we use, so a new model
// shows up as an overestimate rather than silently costing $0.
const FALLBACK_RATE: ModelRate = { input: 3, output: 15 };

/** Strips a trailing date snapshot: claude-haiku-4-5-20251001 → claude-haiku-4-5 */
export function normalizeModelId(model: string): string {
  return model.replace(/-\d{8}$/, "");
}

export function getModelRate(model: string): ModelRate {
  return MODEL_RATES[normalizeModelId(model)] ?? FALLBACK_RATE;
}

/**
 * Estimated USD cost of one usage row. Cache reads bill at 10% of the input
 * rate and cache writes at 125% (Anthropic's standard multipliers); regular
 * input_tokens already exclude cached tokens in API usage reports.
 */
export function estimateCostUsd(
  model: string,
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  },
): number {
  const rate = getModelRate(model);
  const M = 1_000_000;
  return (
    (usage.input_tokens / M) * rate.input +
    (usage.output_tokens / M) * rate.output +
    ((usage.cache_creation_input_tokens ?? 0) / M) * rate.input * 1.25 +
    ((usage.cache_read_input_tokens ?? 0) / M) * rate.input * 0.1
  );
}

export function formatUsd(value: number): string {
  if (value >= 100) return `$${value.toFixed(0)}`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(3)}`;
}
