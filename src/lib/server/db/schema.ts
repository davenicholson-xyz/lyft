import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const plans = sqliteTable('plans', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  date: text('date').notNull(),           // 'YYYY-MM-DD'
  type: text('type').notNull(),           // 'run' | 'rest' | 'workout'
  notes: text('notes'),
  status: text('status').notNull().default('planned')  // 'planned' | 'done'
});

export const sessions = sqliteTable('sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  date: text('date').notNull(),
  type: text('type').notNull(),
  notes: text('notes'),
  strava_id: text('strava_id'),   // Strava activity ID — prevents duplicate syncs
  created_at: text('created_at').notNull()
});

export const strava_tokens = sqliteTable('strava_tokens', {
  id:            integer('id').primaryKey({ autoIncrement: true }),
  access_token:  text('access_token').notNull(),
  refresh_token: text('refresh_token').notNull(),
  expires_at:    integer('expires_at').notNull(),  // unix seconds
});

export const workout_logs = sqliteTable('workout_logs', {
  id:            integer('id').primaryKey({ autoIncrement: true }),
  date:          text('date').notNull(),
  exercise_name: text('exercise_name').notNull(),
  set_number:    integer('set_number').notNull(),
  reps:          integer('reps'),
  weight_kg:     real('weight_kg'),
  created_at:    text('created_at').notNull(),
});

export const training_notes = sqliteTable('training_notes', {
  id:         integer('id').primaryKey({ autoIncrement: true }),
  note:       text('note').notNull(),
  created_at: text('created_at').notNull(),
});

export const equipment = sqliteTable('equipment', {
  id:          integer('id').primaryKey({ autoIncrement: true }),
  name:        text('name').notNull(),
  weight_type: text('weight_type').notNull().default('none'), // 'none' | 'single' | 'range'
  weight_min:  real('weight_min'),   // kg — used for both 'single' and range min
  weight_max:  real('weight_max'),   // kg — range max only
});

export const exercise_config = sqliteTable('exercise_config', {
  name: text('name').primaryKey(),
  unit: text('unit').notNull().default('weighted'), // 'weighted' | 'reps' | 'timed'
});

export const strava_webhook = sqliteTable('strava_webhook', {
  id:              integer('id').primaryKey({ autoIncrement: true }),
  subscription_id: integer('subscription_id').notNull(),
});

export const claude_usage = sqliteTable('claude_usage', {
  id:            integer('id').primaryKey({ autoIncrement: true }),
  model:         text('model').notNull(),
  input_tokens:  integer('input_tokens').notNull(),
  output_tokens: integer('output_tokens').notNull(),
  cost_usd:      real('cost_usd').notNull(),
  description:   text('description'),
  created_at:    text('created_at').notNull(),
});
