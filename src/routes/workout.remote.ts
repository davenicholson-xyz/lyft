import { query, command } from '$app/server';
import * as v from 'valibot';
import { db } from '$lib/server/db';
import { plans, workout_logs, exercise_config } from '$lib/server/db/schema';
import { and, eq, lt, desc } from 'drizzle-orm';

const DateSchema       = v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/));
const SaveSetSchema    = v.object({
  date:          v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/)),
  exercise_name: v.pipe(v.string(), v.minLength(1)),
  set_number:    v.number(),
  reps:          v.nullable(v.number()),
  weight_kg:     v.nullable(v.number()),
});
const SetUnitSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1)),
  unit: v.picklist(['weighted', 'reps', 'timed']),
});

type ExerciseUnit = 'weighted' | 'reps' | 'timed';

function parseExercises(notes: string): { name: string; sets: number; reps: number; parsedUnit: ExerciseUnit }[] {
  const str = notes.includes(':') ? notes.slice(notes.indexOf(':') + 1) : notes;
  return str.split(',').map(s => s.trim()).filter(Boolean).map(ex => {
    const m = ex.match(/^(.+?)\s+(\d+)[×x](\d+)(s?)$/i);
    if (m) {
      const parsedUnit: ExerciseUnit = m[4] === 's' ? 'timed' : 'weighted';
      return { name: m[1].trim(), sets: parseInt(m[2]), reps: parseInt(m[3]), parsedUnit };
    }
    return { name: ex, sets: 3, reps: 10, parsedUnit: 'weighted' as ExerciseUnit };
  });
}

export const getWorkout = query(DateSchema, async (date) => {
  const [plan] = await db.select().from(plans)
    .where(and(eq(plans.date, date), eq(plans.type, 'workout')))
    .limit(1);

  if (!plan?.notes) return null;

  const exercises = parseExercises(plan.notes);
  const colonIdx  = plan.notes.indexOf(':');
  const title     = colonIdx !== -1 ? plan.notes.slice(0, colonIdx).trim() : null;

  // load all saved exercise configs in one query
  const configs = await db.select().from(exercise_config);
  const configMap = Object.fromEntries(configs.map(c => [c.name, c.unit as ExerciseUnit]));

  const result = [];
  for (const ex of exercises) {
    // saved config wins; fall back to what the notes imply
    const unit: ExerciseUnit = configMap[ex.name] ?? ex.parsedUnit;

    const currentLogs = await db.select({
      set_number: workout_logs.set_number,
      reps:       workout_logs.reps,
      weight_kg:  workout_logs.weight_kg,
    }).from(workout_logs)
      .where(and(eq(workout_logs.date, date), eq(workout_logs.exercise_name, ex.name)))
      .orderBy(workout_logs.set_number);

    const [lastEntry] = await db.select({ date: workout_logs.date })
      .from(workout_logs)
      .where(and(eq(workout_logs.exercise_name, ex.name), lt(workout_logs.date, date)))
      .orderBy(desc(workout_logs.date))
      .limit(1);

    const previousLogs = lastEntry
      ? await db.select({
          set_number: workout_logs.set_number,
          reps:       workout_logs.reps,
          weight_kg:  workout_logs.weight_kg,
        }).from(workout_logs)
          .where(and(eq(workout_logs.exercise_name, ex.name), eq(workout_logs.date, lastEntry.date)))
          .orderBy(workout_logs.set_number)
      : [];

    result.push({ name: ex.name, sets: ex.sets, reps: ex.reps, unit, currentLogs, previousLogs });
  }

  return { planId: plan.id, title, exercises: result };
});

export const saveSet = command(SaveSetSchema, async ({ date, exercise_name, set_number, reps, weight_kg }) => {
  await db.delete(workout_logs).where(and(
    eq(workout_logs.date, date),
    eq(workout_logs.exercise_name, exercise_name),
    eq(workout_logs.set_number, set_number),
  ));
  await db.insert(workout_logs).values({
    date, exercise_name, set_number,
    reps:       reps ?? null,
    weight_kg:  weight_kg ?? null,
    created_at: new Date().toISOString(),
  });
  await getWorkout(date).refresh();
});

export const setExerciseUnit = command(SetUnitSchema, async ({ name, unit }) => {
  await db.insert(exercise_config)
    .values({ name, unit })
    .onConflictDoUpdate({ target: exercise_config.name, set: { unit } });
});
