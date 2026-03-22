import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import { env } from '$env/dynamic/private';
import fs from 'node:fs';
import path from 'node:path';

if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

fs.mkdirSync(path.dirname(env.DATABASE_URL), { recursive: true });

const client = new Database(env.DATABASE_URL);

export const db = drizzle(client, { schema });
