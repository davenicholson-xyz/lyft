import { query, command } from '$app/server';
import * as v from 'valibot';
import { db } from '$lib/server/db';
import { user_settings } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const getUserSettings = query(async () => {
  const rows = await db.select().from(user_settings);
  return Object.fromEntries(rows.map(r => [r.key, r.value])) as Record<string, string>;
});

export const setUserSetting = command(
  v.object({ key: v.string(), value: v.string() }),
  async ({ key, value }) => {
    await db.insert(user_settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: user_settings.key, set: { value } });
    await getUserSettings().refresh();
  }
);
