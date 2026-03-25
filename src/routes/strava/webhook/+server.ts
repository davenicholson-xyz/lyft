import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { sessions, plans } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { getValidToken } from '$lib/server/strava';
import { getMonthData, getDayDetail } from '../../calendar.remote';

// Strava subscription validation
export const GET: RequestHandler = ({ url }) => {
  const mode      = url.searchParams.get('hub.mode');
  const token     = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === env.STRAVA_WEBHOOK_TOKEN && challenge) {
    return json({ 'hub.challenge': challenge });
  }
  return new Response('Forbidden', { status: 403 });
};

// Strava activity event
export const POST: RequestHandler = async ({ request }) => {
  const event = await request.json() as {
    object_type: string;
    aspect_type: string;
    object_id:   number;
  };

  if (event.object_type === 'activity' && event.aspect_type === 'create') {
    const stravaId = String(event.object_id);
    const [existing] = await db.select().from(sessions).where(eq(sessions.strava_id, stravaId)).limit(1);

    if (!existing) {
      const token = await getValidToken();
      if (token) {
        const res = await fetch(`https://www.strava.com/api/v3/activities/${event.object_id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const run = await res.json();
          if (run.type === 'Run' || run.sport_type === 'Run') {
            const date  = (run.start_date_local as string).slice(0, 10);
            const km    = (run.distance / 1000).toFixed(1);
            const min   = Math.round(run.moving_time / 60);
            const notes = `${run.name} · ${km} km · ${min} min`;

            await db.insert(sessions).values({
              date, type: 'run', notes, strava_id: stravaId,
              created_at: new Date().toISOString(),
            });

            const [planned] = await db.select().from(plans)
              .where(and(eq(plans.date, date), eq(plans.type, 'run'), eq(plans.status, 'planned')))
              .limit(1);
            if (planned) {
              await db.update(plans).set({ status: 'done' }).where(eq(plans.id, planned.id));
            }

            await Promise.all([
              getMonthData(date.slice(0, 7)).refresh(),
              getDayDetail(date).refresh(),
            ]);
          }
        }
      }
    }
  }

  if (event.object_type === 'activity' && event.aspect_type === 'delete') {
    const stravaId = String(event.object_id);
    const [existing] = await db.select().from(sessions).where(eq(sessions.strava_id, stravaId)).limit(1);
    if (existing) {
      await db.delete(sessions).where(eq(sessions.strava_id, stravaId));
      await Promise.all([
        getMonthData(existing.date.slice(0, 7)).refresh(),
        getDayDetail(existing.date).refresh(),
      ]);
    }
  }

  return json({ ok: true });
};
