/**
 * Shared Anthropic client + prompt-cache-friendly helper.
 *
 * Models:
 *   - Haiku 4.5 (claude-haiku-4-5) for the per-query classifier (cheap, fast).
 *   - Opus 4.7 (claude-opus-4-7)  for draft generation (high quality).
 *
 * Cost guard: tokenBudget tracks input+output tokens spent in a single
 * agent run. Caller can abort before generating more drafts when it gets
 * close to the brief's £2/run ceiling.
 */

import Anthropic from '@anthropic-ai/sdk';

export const HAIKU_MODEL = 'claude-haiku-4-5';
export const OPUS_MODEL = 'claude-opus-4-7';

let cached: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (cached) return cached;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  cached = new Anthropic({ apiKey });
  return cached;
}

/** Rough token-cost tracker. Per-million prices, approximate. */
const PRICE_PER_M: Record<string, { input: number; output: number }> = {
  [HAIKU_MODEL]: { input: 1.0, output: 5.0 }, // USD per million
  [OPUS_MODEL]: { input: 15.0, output: 75.0 },
};

export class TokenBudget {
  private spendUsd = 0;
  /** Soft cap in USD. Brief: £2/run, ~$2.50. */
  constructor(private readonly capUsd: number = 2.5) {}

  add(model: string, inputTokens: number, outputTokens: number) {
    const price = PRICE_PER_M[model] ?? PRICE_PER_M[OPUS_MODEL];
    const cost = (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
    this.spendUsd += cost;
  }

  /** Returns true when the next non-trivial Opus call should be skipped. */
  exceeded(): boolean {
    return this.spendUsd >= this.capUsd;
  }

  spent(): number {
    return this.spendUsd;
  }
}

/**
 * Call Claude with strict JSON output. Retries once on transient errors
 * or non-JSON responses. Throws on second failure — caller decides whether
 * to persist the opportunity with `draftContent: null`.
 */
export async function callJson<T>(args: {
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  budget?: TokenBudget;
}): Promise<T> {
  const { model, system, user, maxTokens, budget } = args;
  const client = getAnthropic();

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // Hard ceiling so a stalled upstream can't burn the whole 5-min
      // function budget. Opus drafts can take ~30s, so 90s is generous.
      const res = await client.messages.create(
        {
          model,
          max_tokens: maxTokens,
          // Cache the system prompt across calls within a run (5-min TTL).
          system: [
            {
              type: 'text',
              text: system,
              cache_control: { type: 'ephemeral' },
            },
          ],
          messages: [{ role: 'user', content: user }],
        },
        { timeout: 90_000 },
      );

      if (budget) {
        budget.add(model, res.usage.input_tokens, res.usage.output_tokens);
      }

      const text = res.content
        .filter((c): c is Extract<typeof c, { type: 'text' }> => c.type === 'text')
        .map((c) => c.text)
        .join('')
        .trim();

      // Tolerate occasional ```json fences even though we ask for raw JSON.
      const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
      return JSON.parse(cleaned) as T;
    } catch (err) {
      lastErr = err;
      // Don't retry on a timeout/abort — a second 90s attempt could burn
      // ~180s of the 300s function budget for one draft. Fail fast instead.
      const isTimeout =
        err instanceof Error &&
        (err.name === 'AbortError' ||
          err.name === 'APIConnectionTimeoutError' ||
          /timed? ?out/i.test(err.message));
      if (isTimeout) break;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 800));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Anthropic call failed');
}
