import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const plans = sqliteTable('plans', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  date: text('date').notNull(),           // 'YYYY-MM-DD'
  type: text('type').notNull(),           // 'weights' | 'run' | 'kettlebell'
  notes: text('notes'),
  status: text('status').notNull().default('planned')  // 'planned' | 'done'
});

export const sessions = sqliteTable('sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  date: text('date').notNull(),
  type: text('type').notNull(),
  notes: text('notes'),
  created_at: text('created_at').notNull()
});
