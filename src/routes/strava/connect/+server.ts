import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

export const GET: RequestHandler = ({ url }) => {
  const redirectUri = `${url.origin}/strava/callback`;
  const params = new URLSearchParams({
    client_id:       env.STRAVA_CLIENT_ID,
    redirect_uri:    redirectUri,
    response_type:   'code',
    scope:           'activity:read_all',
    approval_prompt: 'auto',
  });
  redirect(302, `https://www.strava.com/oauth/authorize?${params}`);
};
