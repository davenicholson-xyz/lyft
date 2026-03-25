import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { plans, sessions, workout_logs, training_notes, equipment, exercise_config } from '$lib/server/db/schema';

export const GET: RequestHandler = async () => {
  const [
    plansData,
    sessionsData,
    logsData,
    notesData,
    equipmentData,
    exerciseConfigData,
  ] = await Promise.all([
    db.select().from(plans),
    db.select().from(sessions),
    db.select().from(workout_logs),
    db.select().from(training_notes),
    db.select().from(equipment),
    db.select().from(exercise_config),
  ]);

  const payload = {
    version:     1,
    exported_at: new Date().toISOString(),
    plans:           plansData,
    sessions:        sessionsData,
    workout_logs:    logsData,
    training_notes:  notesData,
    equipment:       equipmentData,
    exercise_config: exerciseConfigData,
  };

  const filename = `lyft-export-${new Date().toISOString().slice(0, 10)}.json`;

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type':        'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
};
