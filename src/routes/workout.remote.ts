import { query, command } from '$app/server';
import * as v from 'valibot';
import { db } from '$lib/server/db';
import { plans, workout_logs, exercise_config } from '$lib/server/db/schema';
import { and, eq, lt, gt, desc, inArray } from 'drizzle-orm';
import { getMonthData } from './calendar.remote';

const DateExSchema = v.object({
  date: v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/)),
  name: v.pipe(v.string(), v.minLength(1)),
});

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

  const exerciseNames = exercises.map(ex => ex.name);

  // 2 queries total instead of N+1
  const [allCurrentLogs, allHistoricalLogs] = await Promise.all([
    db.select({
      exercise_name: workout_logs.exercise_name,
      set_number:    workout_logs.set_number,
      reps:          workout_logs.reps,
      weight_kg:     workout_logs.weight_kg,
    }).from(workout_logs)
      .where(and(eq(workout_logs.date, date), inArray(workout_logs.exercise_name, exerciseNames)))
      .orderBy(workout_logs.set_number),

    db.select({
      exercise_name: workout_logs.exercise_name,
      date:          workout_logs.date,
      set_number:    workout_logs.set_number,
      reps:          workout_logs.reps,
      weight_kg:     workout_logs.weight_kg,
    }).from(workout_logs)
      .where(and(lt(workout_logs.date, date), inArray(workout_logs.exercise_name, exerciseNames)))
      .orderBy(desc(workout_logs.date)),
  ]);

  // Collect up to 3 most recent distinct dates per exercise
  const recentDatesMap: Record<string, string[]> = {};
  for (const row of allHistoricalLogs) {
    const dates = recentDatesMap[row.exercise_name] ?? [];
    if (!dates.includes(row.date)) {
      if (dates.length < 3) dates.push(row.date);
    }
    recentDatesMap[row.exercise_name] = dates;
  }

  const result = [];
  for (const ex of exercises) {
    const unit: ExerciseUnit = configMap[ex.name] ?? ex.parsedUnit;
    const currentLogs = allCurrentLogs.filter(l => l.exercise_name === ex.name);
    const dates = recentDatesMap[ex.name] ?? [];
    const recentSessions = dates.map(date => ({
      date,
      sets: allHistoricalLogs.filter(l => l.exercise_name === ex.name && l.date === date),
    }));
    result.push({ name: ex.name, sets: ex.sets, reps: ex.reps, unit, currentLogs, recentSessions });
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

const DeleteSetSchema = v.object({
  date:          v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/)),
  exercise_name: v.pipe(v.string(), v.minLength(1)),
  set_number:    v.number(),
});

export const deleteSet = command(DeleteSetSchema, async ({ date, exercise_name, set_number }) => {
  await db.delete(workout_logs).where(and(
    eq(workout_logs.date, date),
    eq(workout_logs.exercise_name, exercise_name),
    eq(workout_logs.set_number, set_number),
  ));
  const higher = await db.select().from(workout_logs).where(and(
    eq(workout_logs.date, date),
    eq(workout_logs.exercise_name, exercise_name),
    gt(workout_logs.set_number, set_number),
  )).orderBy(workout_logs.set_number);
  for (const log of higher) {
    await db.delete(workout_logs).where(and(
      eq(workout_logs.date, date),
      eq(workout_logs.exercise_name, exercise_name),
      eq(workout_logs.set_number, log.set_number),
    ));
    await db.insert(workout_logs).values({ ...log, set_number: log.set_number - 1 });
  }
  await getWorkout(date).refresh();
});

export const setExerciseUnit = command(SetUnitSchema, async ({ name, unit }) => {
  await db.insert(exercise_config)
    .values({ name, unit })
    .onConflictDoUpdate({ target: exercise_config.name, set: { unit } });
});

export const finishWorkout = command(DateSchema, async (date) => {
  await db.update(plans)
    .set({ status: 'done' })
    .where(and(eq(plans.date, date), eq(plans.type, 'workout')));
  await getMonthData(date.slice(0, 7)).refresh();
});

export const getExerciseNames = query(async () => {
  const configs = await db.select({ name: exercise_config.name }).from(exercise_config);
  const logs    = await db.select({ name: workout_logs.exercise_name }).from(workout_logs);
  const all = new Set([...configs.map(c => c.name), ...logs.map(l => l.name)]);
  return [...all].sort();
});

export const addExerciseToPlan = command(DateExSchema, async ({ date, name }) => {
  const [plan] = await db.select().from(plans)
    .where(and(eq(plans.date, date), eq(plans.type, 'workout')))
    .limit(1);
  if (!plan) throw new Error('No workout plan for this date');

  const notes = plan.notes ? `${plan.notes.trimEnd()}, ${name} 3×10` : `Workout: ${name} 3×10`;
  await db.update(plans).set({ notes }).where(eq(plans.id, plan.id));
  await db.insert(exercise_config).values({ name, unit: 'weighted' }).onConflictDoNothing();
  await getWorkout(date).refresh();
  await getExerciseNames().refresh();
});

export const reorderExercise = command(v.object({
  date:      v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/)),
  name:      v.pipe(v.string(), v.minLength(1)),
  direction: v.picklist(['up', 'down']),
}), async ({ date, name, direction }) => {
  const [plan] = await db.select().from(plans)
    .where(and(eq(plans.date, date), eq(plans.type, 'workout')))
    .limit(1);
  if (!plan?.notes) return;

  const colonIdx = plan.notes.indexOf(':');
  const title    = colonIdx !== -1 ? plan.notes.slice(0, colonIdx).trim() : null;
  const exStr    = colonIdx !== -1 ? plan.notes.slice(colonIdx + 1) : plan.notes;
  const parts    = exStr.split(',').map(s => s.trim()).filter(Boolean);

  const idx = parts.findIndex(part => {
    const m = part.match(/^(.+?)\s+\d+[×x]\d+/i);
    return (m ? m[1].trim() : part).toLowerCase() === name.toLowerCase();
  });
  if (idx === -1) return;

  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= parts.length) return;
  [parts[idx], parts[swapIdx]] = [parts[swapIdx], parts[idx]];

  const newNotes = title ? `${title}: ${parts.join(', ')}` : parts.join(', ');
  await db.update(plans).set({ notes: newNotes }).where(eq(plans.id, plan.id));
  await getWorkout(date).refresh();
});

export const removeExerciseFromPlan = command(DateExSchema, async ({ date, name }) => {
  const [plan] = await db.select().from(plans)
    .where(and(eq(plans.date, date), eq(plans.type, 'workout')))
    .limit(1);
  if (!plan?.notes) return;

  const colonIdx = plan.notes.indexOf(':');
  const title    = colonIdx !== -1 ? plan.notes.slice(0, colonIdx).trim() : null;
  const exStr    = colonIdx !== -1 ? plan.notes.slice(colonIdx + 1) : plan.notes;

  const kept = exStr.split(',').map(s => s.trim()).filter(Boolean).filter(part => {
    const m      = part.match(/^(.+?)\s+\d+[×x]\d+s?$/i);
    const exName = m ? m[1].trim() : part;
    return exName.toLowerCase() !== name.toLowerCase();
  });

  const newNotes = title ? `${title}: ${kept.join(', ')}` : kept.join(', ');
  await db.update(plans).set({ notes: newNotes }).where(eq(plans.id, plan.id));
  await getWorkout(date).refresh();
});
