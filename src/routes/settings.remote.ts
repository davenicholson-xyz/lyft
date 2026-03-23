import { query } from '$app/server';
import { db } from '$lib/server/db';
import { claude_usage } from '$lib/server/db/schema';
import { sql } from 'drizzle-orm';

export const getClaudeSpend = query(async () => {
  const now            = new Date();
  const monthStart     = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const [totals] = await db.select({
    total_usd: sql<number>`sum(cost_usd)`,
    total_calls: sql<number>`count(*)`,
  }).from(claude_usage);

  const [monthly] = await db.select({
    month_usd: sql<number>`sum(cost_usd)`,
  }).from(claude_usage).where(sql`created_at >= ${monthStart}`);

  return {
    total_usd:   totals.total_usd   ?? 0,
    total_calls: totals.total_calls ?? 0,
    month_usd:   monthly.month_usd  ?? 0,
  };
});
