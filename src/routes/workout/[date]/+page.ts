import type { PageLoad } from './$types';
export const load: PageLoad = ({ params }) => ({ date: params.date });
