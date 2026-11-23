/**
 * Rough Claude API cost from recorded token counts, for the Takara dashboard. List prices in US
 * dollars per million tokens (Anthropic first-party API, November 2026). Prompt-cache discounts
 * aren't counted, so this errs on the high side. Unknown models are priced as Claude Opus 5.5,
 * the app's default.
 */
const PRICES: Record<string, { in: number; out: number }> = {
  "claude-fable-5-2": { in: 8, out: 40 },
  "claude-fable-5-1": { in: 10, out: 50 },
  "claude-fable-5": { in: 10, out: 50 },
  "claude-opus-5-5": { in: 4, out: 20 },
  "claude-opus-5": { in: 5, out: 25 },
  "claude-opus-4-8": { in: 5, out: 25 },
  "claude-opus-4-7": { in: 5, out: 25 },
  "claude-opus-4-6": { in: 5, out: 25 },
  "claude-sonnet-5-5": { in: 2, out: 10 },
  "claude-sonnet-5": { in: 2, out: 10 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-haiku-5-5": { in: 0.1, out: 0.5 },
  "claude-haiku-4-5": { in: 1, out: 5 },
};
const DEFAULT = PRICES["claude-opus-5-5"];

export type TokenUse = Record<string, { in: number; out: number }>;

/** Estimated cost in US dollars for token counts grouped by model. */
export function aiCostUsd(tokens: TokenUse | null | undefined): number {
  let usd = 0;
  for (const [model, t] of Object.entries(tokens ?? {})) {
    const p = PRICES[model.split("[")[0]] ?? DEFAULT;
    usd += (Number(t.in) * p.in + Number(t.out) * p.out) / 1_000_000;
  }
  return usd;
}

export function formatUsd(usd: number): string {
  return usd < 0.01 && usd > 0 ? "< $0.01" : `$${usd.toFixed(2)}`;
}
