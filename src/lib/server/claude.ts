import Anthropic from '@anthropic-ai/sdk';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { claude_usage } from '$lib/server/db/schema';

export function getClient() {
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
}

// Pricing per million tokens (update if Anthropic changes rates)
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5':  { input: 0.80,  output: 4.00  },
  'claude-sonnet-4-5': { input: 3.00,  output: 15.00 },
  'claude-opus-4-5':   { input: 15.00, output: 75.00 },
};

export async function logUsage(
  model: string,
  usage: { input_tokens: number; output_tokens: number },
  description?: string,
) {
  const rates   = PRICING[model] ?? { input: 0.80, output: 4.00 };
  const cost_usd =
    (usage.input_tokens  / 1_000_000) * rates.input +
    (usage.output_tokens / 1_000_000) * rates.output;

  await db.insert(claude_usage).values({
    model,
    input_tokens:  usage.input_tokens,
    output_tokens: usage.output_tokens,
    cost_usd,
    description:   description ?? null,
    created_at:    new Date().toISOString(),
  });
}
