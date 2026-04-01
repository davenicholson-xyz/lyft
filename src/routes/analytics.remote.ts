import { query } from '$app/server';
import { db } from '$lib/server/db';
import { workout_logs, plans } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

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

  // Weekly adherence: planned vs done workout plans, last 12 weeks
  const workoutPlans = await db.select().from(plans).where(eq(plans.type, 'workout'));
  const weeklyAdherence: Record<string, { planned: number; done: number }> = {};
  for (const plan of workoutPlans) {
    const d = new Date(plan.date + 'T12:00:00');
    d.setDate(d.getDate() - (d.getDay() + 6) % 7);
    const wk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!weeklyAdherence[wk]) weeklyAdherence[wk] = { planned: 0, done: 0 };
    weeklyAdherence[wk].planned++;
    if (plan.status === 'done') weeklyAdherence[wk].done++;
  }

  return { byExercise, weeklyVolume, weeklyAdherence };
});
