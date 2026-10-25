import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Program, type Workout } from './db';
import { saveRecord } from './records';

export function useActiveProgram(): Program | null | undefined {
  return useLiveQuery(async () => {
    const all = await db.programs.filter((p) => !p.deleted).toArray();
    return all.find((p) => p.active === 1) ?? all[0] ?? null;
  }, []);
}

export function useWorkouts(): Workout[] | undefined {
  return useLiveQuery(() => db.workouts.filter((w) => !w.deleted).toArray(), []);
}

export function inProgress(ws: Workout[]): Workout | undefined {
  return ws.filter((w) => !w.finished_at).sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
}

/** Save a modified copy of a workout. */
export async function saveWorkout(w: Workout): Promise<void> {
  await saveRecord<Workout>('workouts', w);
}

export async function saveProgram(p: Omit<Program, 'updated_at' | 'deleted' | 'dirty'>): Promise<void> {
  await saveRecord<Program>('programs', p);
}
