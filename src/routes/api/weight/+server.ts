import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { weight_logs } from '$lib/server/db/schema';
export const POST: RequestHandler = async ({ request }) => {
  const auth  = request.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;

  if (!env.API_TOKEN || token !== env.API_TOKEN) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await request.json() as { date?: string; weight_kg?: number };

  if (!body.date || !body.weight_kg || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    return new Response('Bad Request', { status: 400 });
  }

  await db.insert(weight_logs).values({
    date:       body.date,
    weight_kg:  body.weight_kg,
    created_at: new Date().toISOString(),
  });

  return json({ ok: true });
};
