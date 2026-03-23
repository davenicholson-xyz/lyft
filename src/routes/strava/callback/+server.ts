import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { strava_tokens } from '$lib/server/db/schema';

export const GET: RequestHandler = async ({ url }) => {
  const code = url.searchParams.get('code');
  if (!code) redirect(302, '/');

  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     parseInt(env.STRAVA_CLIENT_ID, 10),
      client_secret: env.STRAVA_CLIENT_SECRET,
      redirect_uri:  `${url.origin}/strava/callback`,
      code,
      grant_type: 'authorization_code',
    }),
  });

  if (res.ok) {
    const data = await res.json();
    await db.delete(strava_tokens);
    await db.insert(strava_tokens).values({
      access_token:  data.access_token,
      refresh_token: data.refresh_token,
      expires_at:    data.expires_at,
    });
  }

  redirect(302, '/');
};
