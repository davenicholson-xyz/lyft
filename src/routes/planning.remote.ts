import { command } from '$app/server';
import * as v from 'valibot';
import { db } from '$lib/server/db';
import { plans, sessions, equipment, training_notes } from '$lib/server/db/schema';
import { inArray, eq } from 'drizzle-orm';
import { getClient, logUsage } from '$lib/server/claude';
import { getMonthData } from './calendar.remote';

const GeneratePlanSchema = v.object({
  weekStart: v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/)),
  notes:     v.optional(v.string()),
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
  const weekDates = buildWeekDates(weekStart);

  const [weekSessions, weekPlans, gear, userNotes] = await Promise.all([
    db.select().from(sessions).where(inArray(sessions.date, weekDates)),
    db.select().from(plans).where(inArray(plans.date, weekDates)),
    db.select().from(equipment),
    db.select().from(training_notes),
  ]);

  const gearStr = gear.length
    ? gear.map(e => {
        let w = '';
        if (e.weight_type === 'single' && e.weight_min != null) w = ` (${e.weight_min}kg)`;
        if (e.weight_type === 'range' && e.weight_min != null && e.weight_max != null) w = ` (${e.weight_min}–${e.weight_max}kg)`;
        return `- ${e.name}${w}`;
      }).join('\n')
    : 'None listed';

  // Classify each day
  const runDates  = weekDates.filter(date =>
    weekSessions.some(s => s.date === date && s.type === 'run') ||
    weekPlans.some(p => p.date === date && p.type === 'run')
  );
  const freeDates = weekDates.filter(date => !runDates.includes(date));

  const dayLines = weekDates.map(date => {
    const name = new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long' });
    if (runDates.includes(date)) return `${name} ${date}: RUN DAY — skip`;
    return `${name} ${date}: free`;
  }).join('\n');

  const prompt = `You are a strength and conditioning coach. Create a gym/exercise plan for the free days in the week of ${weekStart}.

Week schedule:
${dayLines}

Available equipment:
${gearStr}
${userNotes.length ? `\nTraining requirements (must follow):\n${userNotes.map(n => `- ${n.note}`).join('\n')}` : ''}
${notes ? `\nAdditional notes for this week: ${notes}` : ''}

Instructions:
- Only create plans for FREE days (ignore run days completely)
- Use the available equipment to prescribe exercises with sets and reps (no weights yet)
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
    const [existing] = await db.select().from(plans).where(eq(plans.date, day.date)).limit(1);
    if (existing) continue;

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
