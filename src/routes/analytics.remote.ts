import { query } from '$app/server';
import { db } from '$lib/server/db';
import { workout_logs } from '$lib/server/db/schema';
import { desc } from 'drizzle-orm';

export const getStrengthData = query(async () => {
  const logs = await db.select().from(workout_logs).orderBy(workout_logs.date, workout_logs.set_number);

  // Group by exercise → by date → compute max weight & max reps, total volume
  type DayStat = { date: string; maxWeight: number | null; maxReps: number | null; totalVolume: number; sets: number };
  const byExercise: Record<string, DayStat[]> = {};

  for (const log of logs) {
    if (!byExercise[log.exercise_name]) byExercise[log.exercise_name] = [];
    let entry = byExercise[log.exercise_name].find(e => e.date === log.date);
    if (!entry) {
      entry = { date: log.date, maxWeight: null, maxReps: null, totalVolume: 0, sets: 0 };
      byExercise[log.exercise_name].push(entry);
    }
    if (log.weight_kg != null && (entry.maxWeight === null || log.weight_kg > entry.maxWeight)) {
      entry.maxWeight = log.weight_kg;
    }
    if (log.reps != null && (entry.maxReps === null || log.reps > entry.maxReps)) {
      entry.maxReps = log.reps;
    }
    if (log.weight_kg != null && log.reps != null) {
      entry.totalVolume += log.weight_kg * log.reps;
    }
    entry.sets++;
  }

  // Weekly volume: sum reps*weight per week across all exercises
  const weeklyVolume: Record<string, number> = {};
  for (const log of logs) {
    if (log.weight_kg == null || log.reps == null) continue;
    const d = new Date(log.date + 'T12:00:00');
    const dayOfWeek = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - dayOfWeek);
    const wk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    weeklyVolume[wk] = (weeklyVolume[wk] ?? 0) + log.weight_kg * log.reps;
  }

  return { byExercise, weeklyVolume };
});
