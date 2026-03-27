import { query, command } from '$app/server';
import * as v from 'valibot';
import { db } from '$lib/server/db';
import { recovery_logs } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';

const AddRecoverySchema = v.object({
  date:        v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/)),
  sleep_hours: v.optional(v.nullable(v.number())),
  soreness:    v.optional(v.nullable(v.number())),
  notes:       v.optional(v.nullable(v.string())),
});

export const getRecoveryLogs = query(async () => {
  return db.select().from(recovery_logs).orderBy(desc(recovery_logs.date)).limit(90);
});

export const addRecoveryLog = command(AddRecoverySchema, async ({ date, sleep_hours, soreness, notes }) => {
  // Upsert by date — one entry per day
  const [existing] = await db.select().from(recovery_logs).where(eq(recovery_logs.date, date)).limit(1);
  if (existing) {
    await db.update(recovery_logs)
      .set({ sleep_hours: sleep_hours ?? null, soreness: soreness ?? null, notes: notes ?? null })
      .where(eq(recovery_logs.id, existing.id));
  } else {
    await db.insert(recovery_logs).values({
      date,
      sleep_hours: sleep_hours ?? null,
      soreness:    soreness ?? null,
      notes:       notes ?? null,
      created_at:  new Date().toISOString(),
    });
  }
  await getRecoveryLogs().refresh();
});

export const deleteRecoveryLog = command(
  v.object({ id: v.number() }),
  async ({ id }) => {
    await db.delete(recovery_logs).where(eq(recovery_logs.id, id));
    await getRecoveryLogs().refresh();
  }
);
