import { query, command } from '$app/server';
import * as v from 'valibot';
import { db } from '$lib/server/db';
import { training_notes } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

const NoteSchema   = v.object({ note: v.pipe(v.string(), v.minLength(1)) });
const IdNoteSchema = v.object({ id: v.number(), note: v.pipe(v.string(), v.minLength(1)) });
const IdSchema     = v.object({ id: v.number() });

export const getNotes = query(() =>
  db.select().from(training_notes).orderBy(training_notes.id)
);

export const addNote = command(NoteSchema, async ({ note }) => {
  await db.insert(training_notes).values({ note, created_at: new Date().toISOString() });
  await getNotes().refresh();
});

export const updateNote = command(IdNoteSchema, async ({ id, note }) => {
  await db.update(training_notes).set({ note }).where(eq(training_notes.id, id));
  await getNotes().refresh();
});

export const deleteNote = command(IdSchema, async ({ id }) => {
  await db.delete(training_notes).where(eq(training_notes.id, id));
  await getNotes().refresh();
});
