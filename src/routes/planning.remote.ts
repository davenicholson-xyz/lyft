import { command } from '$app/server';
import * as v from 'valibot';
import { db } from '$lib/server/db';
import { plans, sessions, equipment, training_notes, workout_logs, exercise_config, user_settings } from '$lib/server/db/schema';
import { inArray, eq, and } from 'drizzle-orm';
import { getClient, logUsage } from '$lib/server/claude';
import { getMonthData } from './calendar.remote';

const DateSchema = v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/));

const GeneratePlanSchema = v.object({
  weekStart: v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/)),
  notes:     v.optional(v.string()),
});

const AcceptDayWorkoutSchema = v.object({
  date:  DateSchema,
  notes: v.string(),
});

const AcceptPlanSchema = v.object({
  days: v.array(v.object({
    date:  v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/)),
    type:  v.picklist(['run', 'rest', 'workout']),
    notes: v.optional(v.string()),
  })),
});

function buildWeekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart + 'T12:00:00');
    d.setDate(d.getDate() + i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
}

export const generateWeekPlan = command(GeneratePlanSchema, async ({ weekStart, notes }) => {
  const weekDates     = buildWeekDates(weekStart);
  const prevWeekDates = buildWeekDates((() => {
    const d = new Date(weekStart + 'T12:00:00');
    d.setDate(d.getDate() - 7);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })());

  const [weekSessions, weekPlans, gear, userNotes, prevPlans, prevLogs, exConfigs, exLogs, settings] = await Promise.all([
    db.select().from(sessions).where(inArray(sessions.date, weekDates)),
    db.select().from(plans).where(inArray(plans.date, weekDates)),
    db.select().from(equipment),
    db.select().from(training_notes),
    db.select().from(plans).where(and(inArray(plans.date, prevWeekDates), eq(plans.type, 'workout'))),
    db.select().from(workout_logs).where(inArray(workout_logs.date, prevWeekDates)),
    db.select({ name: exercise_config.name }).from(exercise_config),
    db.select({ name: workout_logs.exercise_name }).from(workout_logs),
    db.select().from(user_settings),
  ]);
  const settingsMap = Object.fromEntries(settings.map(s => [s.key, s.value]));

  const knownExercises = [...new Set([...exConfigs.map(r => r.name), ...exLogs.map(r => r.name)])].sort();

  const gearStr = gear.length
    ? gear.map(e => {
        let w = '';
        if (e.weight_type === 'single' && e.weight_min != null) w = ` (${e.weight_min}kg)`;
        if (e.weight_type === 'range' && e.weight_min != null && e.weight_max != null) w = ` (${e.weight_min}–${e.weight_max}kg)`;
        return `- ${e.name}${w}`;
      }).join('\n')
    : 'None listed';

  // Classify each day
  const today     = new Date(); today.setHours(0, 0, 0, 0);
  const runDates  = weekDates.filter(date =>
    weekSessions.some(s => s.date === date && s.type === 'run') ||
    weekPlans.some(p => p.date === date && p.type === 'run')
  );
  const restDates = weekDates.filter(date => weekPlans.some(p => p.date === date && p.type === 'rest'));
  const pastDates = weekDates.filter(date => new Date(date + 'T12:00:00') < today);
  const freeDates = weekDates.filter(date =>
    !runDates.includes(date) && !restDates.includes(date) && !pastDates.includes(date)
  );

  const dayLines = weekDates.map(date => {
    const name   = new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long' });
    if (pastDates.includes(date))  return `${name} ${date}: PAST — skip`;
    if (runDates.includes(date))   return `${name} ${date}: RUN DAY — skip`;
    if (restDates.includes(date))  return `${name} ${date}: REST DAY — skip`;
    return `${name} ${date}: free`;
  }).join('\n');

  // Summarise last week's workouts with actual weights logged
  let prevWeekStr = '';
  if (prevPlans.length > 0) {
    const lines = prevPlans.map(p => {
      const dayName = new Date(p.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long' });
      const colonIdx = (p.notes ?? '').indexOf(':');
      const title    = colonIdx !== -1 ? p.notes!.slice(0, colonIdx).trim() : p.notes ?? '';
      const exStr    = colonIdx !== -1 ? p.notes!.slice(colonIdx + 1) : p.notes ?? '';
      const exercises = exStr.split(',').map(s => s.trim()).filter(Boolean);

      const exerciseDetails = exercises.map(ex => {
        const exName  = ex.replace(/\s+\d+[×x]\d+s?$/i, '').trim();
        const logsForEx = prevLogs.filter(l => l.exercise_name.toLowerCase() === exName.toLowerCase());
        if (logsForEx.length === 0) return `  - ${ex} (not logged)`;
        const setLines = logsForEx
          .sort((a, b) => a.set_number - b.set_number)
          .map(l => {
            if (l.weight_kg != null) return `${l.reps ?? '?'} reps @ ${l.weight_kg}kg`;
            if (l.reps != null)      return `${l.reps} reps`;
            return 'logged';
          }).join(', ');
        return `  - ${exName}: ${setLines}`;
      }).join('\n');

      return `${dayName} (${p.date}) — ${title}\n${exerciseDetails}`;
    }).join('\n');
    prevWeekStr = `\nLast week's workouts (use for progressive overload):\n${lines}`;
  }

  const prompt = `You are a strength and conditioning coach. Create a gym/exercise plan for the free days in the week of ${weekStart}.

Week schedule:
${dayLines}

Available equipment:
${gearStr}

Known exercise names (use these exact names when applicable — do not invent variations):
${knownExercises.length ? knownExercises.map(n => `- ${n}`).join('\n') : 'None yet'}
${settingsMap.phase ? `\nCurrent training phase: ${settingsMap.phase}` : ''}${settingsMap.restrictions ? `\nTraining notes / restrictions: ${settingsMap.restrictions}` : ''}
${userNotes.length ? `\nTraining requirements (must follow):\n${userNotes.map(n => `- ${n.note}`).join('\n')}` : ''}${prevWeekStr}
${notes ? `\nAdditional notes for this week: ${notes}` : ''}

Instructions:
- Only create plans for FREE days (ignore run days completely)
- Use the available equipment to prescribe exercises with sets and reps only — never include weights
- Spread muscle groups across the free days sensibly
- If there are more free days than needed, mark some as rest/recovery
- Keep notes concise: e.g. "Push: bench press 3×10, shoulder press 3×10, tricep dips 3×12"

Reply with ONLY this JSON — no markdown, no explanation, nothing else:
{"summary":"one sentence","days":[{"date":"YYYY-MM-DD","type":"workout","notes":"..."}]}`;

  console.log('\n=== PLAN GENERATION PROMPT ===\n', prompt, '\n==============================\n');

  const client  = getClient();
  const response = await client.messages.create({
    model:      'claude-haiku-4-5',
    max_tokens: 2048,
    messages:   [{ role: 'user', content: prompt }],
  });

  console.log('\n=== CLAUDE RESPONSE ===');
  for (const block of response.content) {
    if (block.type === 'thinking') console.log('[thinking]', block.thinking);
    if (block.type === 'text')    console.log('[text]', block.text);
  }
  console.log('=== STOP REASON:', response.stop_reason, '===\n');

  await logUsage('claude-haiku-4-5', response.usage, 'generate week plan');

  const text      = response.content.filter(b => b.type === 'text').map(b => (b as { type: 'text'; text: string }).text).join('');
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('No JSON found in text:', JSON.stringify(text));
    throw new Error('No JSON in Claude response');
  }

  let plan: { summary: string; days: { date: string; type: string; notes: string }[] };
  try {
    plan = JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error('JSON parse failed:', jsonMatch[0]);
    throw e;
  }
  console.log('=== PARSED PLAN ===\n', JSON.stringify(plan, null, 2), '\n===================\n');
  return { ...plan, runDates, existingDates: weekPlans.filter(p => freeDates.includes(p.date)).map(p => p.date) };
});

export const acceptWeekPlan = command(AcceptPlanSchema, async ({ days }) => {
  const affectedMonths = new Set<string>();

  for (const day of days) {
    await db.delete(plans).where(eq(plans.date, day.date));
    await db.insert(plans).values({
      date:   day.date,
      type:   day.type,
      notes:  day.notes ?? null,
      status: 'planned',
    });
    affectedMonths.add(day.date.slice(0, 7));
  }

  await Promise.all(Array.from(affectedMonths).map(m => getMonthData(m).refresh()));
});

export const generateDayWorkout = command(DateSchema, async (date) => {
  // Compute week start (Monday)
  const d = new Date(date + 'T12:00:00');
  const dayOfWeek = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dayOfWeek);
  const weekStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const weekDates = buildWeekDates(weekStart);

  const [weekPlans, weekSessions, gear, userNotes, dayExConfigs, dayExLogs, daySettings] = await Promise.all([
    db.select().from(plans).where(inArray(plans.date, weekDates)),
    db.select().from(sessions).where(inArray(sessions.date, weekDates)),
    db.select().from(equipment),
    db.select().from(training_notes),
    db.select({ name: exercise_config.name }).from(exercise_config),
    db.select({ name: workout_logs.exercise_name }).from(workout_logs),
    db.select().from(user_settings),
  ]);
  const daySettingsMap = Object.fromEntries(daySettings.map(s => [s.key, s.value]));

  const knownExercises = [...new Set([...dayExConfigs.map(r => r.name), ...dayExLogs.map(r => r.name)])].sort();

  const dayName = new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long' });

  const gearStr = gear.length
    ? gear.map(e => {
        let w = '';
        if (e.weight_type === 'single' && e.weight_min != null) w = ` (${e.weight_min}kg)`;
        if (e.weight_type === 'range' && e.weight_min != null && e.weight_max != null) w = ` (${e.weight_min}–${e.weight_max}kg)`;
        return `- ${e.name}${w}`;
      }).join('\n')
    : 'None listed';

  // Build a full week schedule the same way generateWeekPlan does
  const dayLines = weekDates.map(d => {
    const name    = new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long' });
    const isRun   = weekSessions.some(s => s.date === d && s.type === 'run') || weekPlans.some(p => p.date === d && p.type === 'run');
    const isRest  = weekPlans.some(p => p.date === d && p.type === 'rest');
    const workout = weekPlans.find(p => p.date === d && p.type === 'workout');
    if (d === date)    return `${name} ${d}: TARGET DAY (run + workout)`;
    if (isRun)         return `${name} ${d}: run day`;
    if (isRest)        return `${name} ${d}: rest day`;
    if (workout)       return `${name} ${d}: workout — ${workout.notes ?? ''}`;
    return `${name} ${d}: free`;
  }).join('\n');

  const prompt = `You are a strength and conditioning coach. Generate a single gym workout for ${dayName} ${date}, which is also a run day.

Full week schedule:
${dayLines}

Available equipment:
${gearStr}

Known exercise names (use these exact names when applicable — do not invent variations):
${knownExercises.length ? knownExercises.map(n => `- ${n}`).join('\n') : 'None yet'}
${daySettingsMap.phase ? `\nCurrent training phase: ${daySettingsMap.phase}` : ''}${daySettingsMap.restrictions ? `\nMovement restrictions / injuries: ${daySettingsMap.restrictions}` : ''}
${userNotes.length ? `\nTraining requirements (must follow):\n${userNotes.map(n => `- ${n.note}`).join('\n')}` : ''}

Instructions:
- Keep it short — this is a run day so the workout should be complementary, not exhausting
- Avoid muscle groups already worked on other workout days this week
- Use the available equipment to prescribe exercises with sets and reps only — never include weights
- Reply with ONLY this JSON — no markdown, no explanation:
{"notes":"Title: exercise1 3×10, exercise2 3×12"}`;

  const client   = getClient();
  const response = await client.messages.create({
    model:      'claude-haiku-4-5',
    max_tokens: 512,
    messages:   [{ role: 'user', content: prompt }],
  });

  await logUsage('claude-haiku-4-5', response.usage, 'generate day workout');

  const text      = response.content.filter(b => b.type === 'text').map(b => (b as { type: 'text'; text: string }).text).join('');
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in Claude response');

  const parsed = JSON.parse(jsonMatch[0]) as { notes: string };
  return { notes: parsed.notes };
});

export const acceptDayWorkout = command(AcceptDayWorkoutSchema, async ({ date, notes }) => {
  const [existing] = await db.select().from(plans)
    .where(and(eq(plans.date, date), eq(plans.type, 'workout')))
    .limit(1);

  if (existing) {
    await db.update(plans).set({ notes }).where(eq(plans.id, existing.id));
  } else {
    await db.insert(plans).values({ date, type: 'workout', notes, status: 'planned' });
  }

  await getMonthData(date.slice(0, 7)).refresh();
});
