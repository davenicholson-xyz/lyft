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

export const swapDays = command(v.object({
  dateA: v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/)),
  dateB: v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/)),
}), async ({ dateA, dateB }) => {
  const [plansA, plansB] = await Promise.all([
    db.select().from(plans).where(eq(plans.date, dateA)),
    db.select().from(plans).where(eq(plans.date, dateB)),
  ]);
  await db.delete(plans).where(eq(plans.date, dateA));
  await db.delete(plans).where(eq(plans.date, dateB));
  if (plansA.length) await db.insert(plans).values(
    plansA.map(p => ({ date: dateB, type: p.type, notes: p.notes, status: p.status }))
  );
  if (plansB.length) await db.insert(plans).values(
    plansB.map(p => ({ date: dateA, type: p.type, notes: p.notes, status: p.status }))
  );
  const monthA = dateA.slice(0, 7);
  const monthB = dateB.slice(0, 7);
  await getMonthData(monthA).refresh();
  if (monthB !== monthA) await getMonthData(monthB).refresh();
  await getDayDetail(dateA).refresh();
  await getDayDetail(dateB).refresh();
});

export const addPlan = command(AddPlanSchema, async (input) => {
  // Replace any existing plans for the day so there's only ever one
  await db.delete(plans).where(eq(plans.date, input.date));
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
