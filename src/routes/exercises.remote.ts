import { query, command } from '$app/server';
import * as v from 'valibot';
import { db } from '$lib/server/db';
import { exercise_config, workout_logs, plans } from '$lib/server/db/schema';
import { eq, sql } from 'drizzle-orm';
import { getExerciseNames } from './workout.remote';

const RenameSchema = v.object({
  from: v.pipe(v.string(), v.minLength(1)),
  to:   v.pipe(v.string(), v.minLength(1)),
});

function parseExerciseNamesFromNotes(notes: string | null): string[] {
  if (!notes) return [];
  const colonIdx = notes.indexOf(':');
  const exStr = colonIdx !== -1 ? notes.slice(colonIdx + 1) : notes;
  return exStr.split(',')
    .map(s => s.trim().replace(/\s+\d+[×x]\d+s?$/i, '').trim())
    .filter(Boolean);
}

export const getExercises = query(async () => {
  const [configs, logs, workoutPlans] = await Promise.all([
    db.select({ name: exercise_config.name }).from(exercise_config),
    db.select({ name: workout_logs.exercise_name }).from(workout_logs),
    db.select({ notes: plans.notes }).from(plans).where(eq(plans.type, 'workout')),
  ]);

  const planNames = workoutPlans.flatMap(p => parseExerciseNamesFromNotes(p.notes));
  const allNames = [...new Set([...configs.map(c => c.name), ...logs.map(l => l.name), ...planNames])].sort();

  const counts = await db
    .select({ name: workout_logs.exercise_name, count: sql<number>`count(*)` })
    .from(workout_logs)
    .groupBy(workout_logs.exercise_name);
  const countMap = Object.fromEntries(counts.map(c => [c.name, c.count]));

  return allNames.map(name => ({ name, logs: countMap[name] ?? 0 }));
});

export const renameExercise = command(RenameSchema, async ({ from, to }) => {
  // Migrate all log entries to the new name
  await db.update(workout_logs)
    .set({ exercise_name: to })
    .where(eq(workout_logs.exercise_name, from));

  // Handle exercise_config
  const [toConfig]   = await db.select().from(exercise_config).where(eq(exercise_config.name, to)).limit(1);
  const [fromConfig] = await db.select().from(exercise_config).where(eq(exercise_config.name, from)).limit(1);
  if (fromConfig) {
    await db.delete(exercise_config).where(eq(exercise_config.name, from));
    // Only create new entry if target doesn't already have one (preserve target's unit)
    if (!toConfig) {
      await db.insert(exercise_config).values({ name: to, unit: fromConfig.unit });
    }
  }

  // Update exercise names inside plans.notes text
  const affectedPlans = await db.select({ id: plans.id, notes: plans.notes })
    .from(plans)
    .where(eq(plans.type, 'workout'));

  for (const plan of affectedPlans) {
    if (!plan.notes) continue;
    const colonIdx = plan.notes.indexOf(':');
    if (colonIdx === -1) continue;
    const title  = plan.notes.slice(0, colonIdx);
    const exStr  = plan.notes.slice(colonIdx + 1);
    const updated = exStr.split(',').map(part => {
      const trimmed = part.trim();
      const schemeMatch = trimmed.match(/^(.+?)(\s+\d+[×x]\d+s?)$/i);
      if (!schemeMatch) return part;
      const exName = schemeMatch[1].trim();
      if (exName.toLowerCase() === from.toLowerCase()) {
        return ` ${to}${schemeMatch[2]}`;
      }
      return part;
    }).join(',');
    if (updated !== exStr) {
      await db.update(plans).set({ notes: `${title}:${updated}` }).where(eq(plans.id, plan.id));
    }
  }

  await getExercises().refresh();
  await getExerciseNames().refresh();
});
