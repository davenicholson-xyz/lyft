import { query, command } from '$app/server';
import * as v from 'valibot';
import { db } from '$lib/server/db';
import { equipment } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

const AddEquipmentSchema = v.object({
  name:        v.pipe(v.string(), v.minLength(1)),
  weight_type: v.picklist(['none', 'single', 'range']),
  weight_min:  v.optional(v.number()),
  weight_max:  v.optional(v.number()),
});
const DeleteEquipmentSchema = v.object({ id: v.number() });

export const getEquipment = query(() => db.select().from(equipment).orderBy(equipment.name));

export const addEquipment = command(AddEquipmentSchema, async (input) => {
  await db.insert(equipment).values({
    name:        input.name,
    weight_type: input.weight_type,
    weight_min:  input.weight_min ?? null,
    weight_max:  input.weight_max ?? null,
  });
  await getEquipment().refresh();
});

export const deleteEquipment = command(DeleteEquipmentSchema, async ({ id }) => {
  await db.delete(equipment).where(eq(equipment.id, id));
  await getEquipment().refresh();
});
