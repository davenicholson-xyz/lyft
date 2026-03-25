import { command } from '$app/server';
import * as v from 'valibot';
import { db } from '$lib/server/db';
import { plans, sessions, workout_logs, training_notes, equipment, exercise_config } from '$lib/server/db/schema';

const ImportSchema = v.object({
  version:         v.literal(1),
  plans:           v.array(v.looseObject({})),
  sessions:        v.array(v.looseObject({})),
  workout_logs:    v.array(v.looseObject({})),
  training_notes:  v.array(v.looseObject({})),
  equipment:       v.array(v.looseObject({})),
  exercise_config: v.array(v.looseObject({})),
});

export const importData = command(ImportSchema, async (data) => {
  // Clear all user data tables
  await db.delete(workout_logs);
  await db.delete(sessions);
  await db.delete(plans);
  await db.delete(training_notes);
  await db.delete(equipment);
  await db.delete(exercise_config);

  // Re-insert (strip id so SQLite auto-assigns fresh keys, except exercise_config which uses name as PK)
  if (data.plans.length)
    await db.insert(plans).values(data.plans.map(({ id: _, ...r }) => r) as typeof plans.$inferInsert[]);
  if (data.sessions.length)
    await db.insert(sessions).values(data.sessions.map(({ id: _, ...r }) => r) as typeof sessions.$inferInsert[]);
  if (data.workout_logs.length)
    await db.insert(workout_logs).values(data.workout_logs.map(({ id: _, ...r }) => r) as typeof workout_logs.$inferInsert[]);
  if (data.training_notes.length)
    await db.insert(training_notes).values(data.training_notes.map(({ id: _, ...r }) => r) as typeof training_notes.$inferInsert[]);
  if (data.equipment.length)
    await db.insert(equipment).values(data.equipment.map(({ id: _, ...r }) => r) as typeof equipment.$inferInsert[]);
  if (data.exercise_config.length)
    await db.insert(exercise_config).values(data.exercise_config as typeof exercise_config.$inferInsert[]);
});
