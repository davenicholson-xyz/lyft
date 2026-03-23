import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { strava_tokens } from '$lib/server/db/schema';

export async function getValidToken(): Promise<string | null> {
  const [token] = await db.select().from(strava_tokens).limit(1);
  if (!token) return null;

  // Still valid (with 5 min buffer)
  if (Math.floor(Date.now() / 1000) < token.expires_at - 300) {
    return token.access_token;
  }

  // Refresh
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     parseInt(env.STRAVA_CLIENT_ID, 10),
      client_secret: env.STRAVA_CLIENT_SECRET,
      grant_type:    'refresh_token',
      refresh_token: token.refresh_token,
    }),
  });

  if (!res.ok) return null;

  const data = await res.json();
  await db.update(strava_tokens).set({
    access_token:  data.access_token,
    refresh_token: data.refresh_token,
    expires_at:    data.expires_at,
  });

  return data.access_token;
}
