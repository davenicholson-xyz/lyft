import { query, command } from '$app/server';
import * as v from 'valibot';
import { db } from '$lib/server/db';
import { plans, sessions } from '$lib/server/db/schema';
import { eq, like } from 'drizzle-orm';

const YearMonthSchema = v.pipe(v.string(), v.regex(/^\d{4}-\d{2}$/));
const DateSchema      = v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/));
const AddPlanSchema   = v.object({
  date:  v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/)),
  type:  v.pipe(v.string(), v.minLength(1)),
  notes: v.optional(v.string())
});
const DeletePlanSchema = v.object({
  id:   v.number(),
  date: v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/))
});

export const getMonthData = query(YearMonthSchema, async (yearMonth) => {
  const [monthPlans, monthSessions] = await Promise.all([
    db.select().from(plans).where(like(plans.date, `${yearMonth}-%`)),
    db.select().from(sessions).where(like(sessions.date, `${yearMonth}-%`))
  ]);
  return { plans: monthPlans, sessions: monthSessions };
});

export const getDayDetail = query(DateSchema, async (date) => {
  const [dayPlans, daySessions] = await Promise.all([
    db.select().from(plans).where(eq(plans.date, date)),
    db.select().from(sessions).where(eq(sessions.date, date))
  ]);
  return { plans: dayPlans, sessions: daySessions };
});

export const addPlan = command(AddPlanSchema, async (input) => {
  await db.insert(plans).values({
    date: input.date,
    type: input.type,
    notes: input.notes ?? null,
    status: 'planned'
  });
  const yearMonth = input.date.slice(0, 7);
  await Promise.all([
    getMonthData(yearMonth).refresh(),
    getDayDetail(input.date).refresh()
  ]);
});

export const deletePlan = command(DeletePlanSchema, async ({ id, date }) => {
  await db.delete(plans).where(eq(plans.id, id));
  const yearMonth = date.slice(0, 7);
  await Promise.all([
    getMonthData(yearMonth).refresh(),
    getDayDetail(date).refresh()
  ]);
});
