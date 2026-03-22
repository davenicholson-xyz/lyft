Build the calendar page for a personal fitness tracker using SvelteKit with TypeScript. This is phase 1 — calendar UI and data layer only. No auth. No other pages yet.
Stack

SvelteKit (latest) with TypeScript
SQLite via better-sqlite3
Drizzle ORM + drizzle-kit for schema and migrations
valibot for validation
@sveltejs/adapter-node
Mobile-first (primary use on iPhone via browser)
daisyui for styling (dim theme)

Enable remote functions in svelte.config.js:
jsconst config = {
  kit: { experimental: { remoteFunctions: true } },
  compilerOptions: { experimental: { async: true } }
};
export default config;
Database — src/lib/server/db/schema.ts
Only these two tables are needed for now:
tsimport { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const plans = sqliteTable('plans', {
  id: integer().primaryKey({ autoIncrement: true }),
  date: text().notNull(),           // ISO date string e.g. '2026-03-17'
  type: text().notNull(),           // 'weights' | 'run' | 'kettlebell'
  notes: text(),
  status: text().notNull().default('planned'), // 'planned' | 'done'
});

export const sessions = sqliteTable('sessions', {
  id: integer().primaryKey({ autoIncrement: true }),
  date: text().notNull(),
  type: text().notNull(),           // 'weights' | 'run' | 'kettlebell'
  notes: text(),
  created_at: text().notNull(),
});
Create src/lib/server/db/index.ts initialising better-sqlite3 with the database at ./data/fittrack.db and exporting the Drizzle client. Run drizzle-kit generate then drizzle-kit migrate to set up the DB.
Remote functions — src/routes/calendar.remote.ts
Use query and command from '$app/server', validated with valibot. Implement:

getMonthData(yearMonth: string) — returns all plans and sessions rows where date starts with the given yearMonth (e.g. '2026-03'). Used to populate the calendar dots.
getDayDetail(date: string) — returns all plans and sessions for a specific ISO date string.
addPlan(data: { date, type, notes? }) — inserts a new plan row, then calls getMonthData and getDayDetail .refresh().
deletePlan(id: number) — deletes a plan by id, then refreshes both queries.

Calendar page — src/routes/+page.svelte
Single page, no layout tabs yet (those come in a later phase). Build a mobile-first calendar component with two views switchable by a toggle:
Monthly view:

Month header with prev/next chevron buttons to navigate months
Day-of-week headers (M T W T F S S)
Full month grid. Each day cell shows the day number and up to 3 coloured dots below it indicating activity types: purple = weights, coral = run, teal = kettlebell. A dashed/faded dot = planned but not done (status = 'planned'). A solid dot = completed (status = 'done' or a session exists). Today's date is highlighted with a filled purple circle behind the number.
Tapping a day selects it and slides up a detail panel at the bottom of the screen showing that day's plans and sessions, each as a card with a coloured left stripe. An "+ add plan" button opens an inline form to pick type (weights/run/kettlebell) and optional notes, submitting via the addPlan command. Each plan card has a delete button.

Weekly view:

Shows only the current week (Mon–Sun), with the same dot indicators but more space per day
Tapping a day shows the same bottom detail panel as the monthly view

Use await getMonthData(yearMonth) and await getDayDetail(date) directly in the component template. After addPlan or deletePlan commands resolve, the queries auto-refresh via .refresh() on the server — no manual state juggling needed on the client.
Styling

Project scaffold + package.json with all dependencies
svelte.config.js and drizzle.config.ts
src/lib/server/db/schema.ts and src/lib/server/db/index.ts
src/routes/calendar.remote.ts
src/routes/+page.svelte — monthly view first, then weekly view toggle
Brief README.md — install, migrate, dev server, build for PM2
