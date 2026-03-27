import { query, command } from '$app/server';
import * as v from 'valibot';
import { db } from '$lib/server/db';
import { weight_logs } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';

export const getWeightLogs = query(async () => {
  return db.select().from(weight_logs).orderBy(desc(weight_logs.date));
});

export const addWeightLog = command(
  v.object({
    date:      v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/)),
    weight_kg: v.number(),
  }),
  async ({ date, weight_kg }) => {
    await db.insert(weight_logs).values({ date, weight_kg, created_at: new Date().toISOString() });
    await getWeightLogs().refresh();
  }
);

export const deleteWeightLog = command(
  v.object({ id: v.number() }),
  async ({ id }) => {
    await db.delete(weight_logs).where(eq(weight_logs.id, id));
    await getWeightLogs().refresh();
  }
);
