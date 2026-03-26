import { query, command } from '$app/server';
import * as v from 'valibot';
import { db } from '$lib/server/db';
import { weight_logs } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';

export const getWeightLogs = query(async () => {
  return db.select().from(weight_logs).orderBy(desc(weight_logs.date));
});

export const deleteWeightLog = command(
  v.object({ id: v.number() }),
  async ({ id }) => {
    await db.delete(weight_logs).where(eq(weight_logs.id, id));
    await getWeightLogs().refresh();
  }
);
