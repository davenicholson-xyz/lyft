import { query, command } from '$app/server';
import * as v from 'valibot';
import { db } from '$lib/server/db';
import { workout_templates, plans } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { getMonthData } from './calendar.remote';
import { getWorkout } from './workout.remote';

export const getTemplates = query(async () => {
  return db.select().from(workout_templates).orderBy(workout_templates.name);
});

export const saveTemplate = command(
  v.object({
    name:  v.pipe(v.string(), v.minLength(1)),
    notes: v.pipe(v.string(), v.minLength(1)),
  }),
  async ({ name, notes }) => {
    await db.insert(workout_templates).values({ name, notes, created_at: new Date().toISOString() });
    await getTemplates().refresh();
  }
);

export const deleteTemplate = command(
  v.object({ id: v.number() }),
  async ({ id }) => {
    await db.delete(workout_templates).where(eq(workout_templates.id, id));
    await getTemplates().refresh();
  }
);

export const applyTemplate = command(
  v.object({
    date:       v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/)),
    templateId: v.number(),
  }),
  async ({ date, templateId }) => {
    const [tpl] = await db.select().from(workout_templates).where(eq(workout_templates.id, templateId)).limit(1);
    if (!tpl) throw new Error('Template not found');

    await db.delete(plans).where(eq(plans.date, date));
    await db.insert(plans).values({ date, type: 'workout', notes: tpl.notes, status: 'planned' });

    await Promise.all([
      getMonthData(date.slice(0, 7)).refresh(),
      getWorkout(date).refresh(),
    ]);
  }
);
