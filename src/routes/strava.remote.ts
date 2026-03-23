import { query, command } from '$app/server';
import { db } from '$lib/server/db';
import { strava_tokens, sessions, plans } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { getValidToken } from '$lib/server/strava';
import { getMonthData, getDayDetail } from './calendar.remote';

export const getStravaStatus = query(() =>
  db.select().from(strava_tokens).limit(1).then(rows => ({ connected: rows.length > 0 }))
);

export const syncStrava = command(async () => {
  const token = await getValidToken();
  if (!token) throw new Error('Not connected to Strava');

  // Fetch all Run activities (paginate until exhausted)
  const runs: {
    id: number;
    name: string;
    type: string;
    sport_type: string;
    start_date_local: string;
    distance: number;
    moving_time: number;
  }[] = [];

  for (let page = 1; ; page++) {
    const res = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?per_page=200&page=${page}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    runs.push(...batch.filter((a) => a.type === 'Run' || a.sport_type === 'Run'));
    if (batch.length < 200) break;
  }

  const affectedMonths = new Set<string>();
  const affectedDates  = new Set<string>();

  for (const run of runs) {
    const date     = run.start_date_local.slice(0, 10);  // YYYY-MM-DD
    const stravaId = String(run.id);

    // Skip already-synced activities
    const [existing] = await db.select().from(sessions).where(eq(sessions.strava_id, stravaId)).limit(1);
    if (existing) continue;

    const km  = (run.distance / 1000).toFixed(1);
    const min = Math.round(run.moving_time / 60);
    const notes = `${run.name} · ${km} km · ${min} min`;

    await db.insert(sessions).values({
      date,
      type:      'run',
      notes,
      strava_id: stravaId,
      created_at: new Date().toISOString(),
    });

    // Mark any planned run that day as done
    const [planned] = await db
      .select()
      .from(plans)
      .where(and(eq(plans.date, date), eq(plans.type, 'run'), eq(plans.status, 'planned')))
      .limit(1);

    if (planned) {
      await db.update(plans).set({ status: 'done' }).where(eq(plans.id, planned.id));
    }

    affectedDates.add(date);
    affectedMonths.add(date.slice(0, 7));
  }

  await Promise.all([
    ...Array.from(affectedMonths).map((m) => getMonthData(m).refresh()),
    ...Array.from(affectedDates).map((d)  => getDayDetail(d).refresh()),
    getStravaStatus().refresh(),
  ]);

  return { synced: affectedDates.size };
});
