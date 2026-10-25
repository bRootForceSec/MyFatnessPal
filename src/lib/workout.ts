import { localDate } from './dates';
import type { Program, ProgramDay, Workout, WorkoutBlock, WorkoutSet } from './db';

const norm = (s: string) => s.trim().toLowerCase();

/** The day planned for `date` (weekly), or the next one in order after the last workout (rotation). */
export function plannedDay(program: Program, history: Workout[], date = localDate()): ProgramDay | null {
  if (program.days.length === 0) return null;
  if (program.schedule === 'weekly') {
    const [y, m, d] = date.split('-').map(Number);
    const weekday = new Date(y, m - 1, d).getDay();
    return program.days.find((day) => day.weekdays.includes(weekday)) ?? null;
  }
  const last = latestFinished(history.filter((w) => w.program_id === program.id));
  const i = last ? program.days.findIndex((d) => d.id === last.day_id) : -1;
  return program.days[(i + 1) % program.days.length];
}

function latestFinished(ws: Workout[]): Workout | undefined {
  return ws
    .filter((w) => w.finished_at && !w.deleted)
    .sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
}

/** How many times this day has been completed, which picks the alternate exercise. */
export function timesDone(dayId: string, history: Workout[]): number {
  return history.filter((w) => w.day_id === dayId && w.finished_at && !w.deleted).length;
}

export interface LastPerformance {
  date: string;
  sets: WorkoutSet[];
}

/** The most recent finished workout that included this exercise. */
export function lastPerformance(name: string, history: Workout[], excludeId?: string): LastPerformance | null {
  const sorted = history
    .filter((w) => w.finished_at && !w.deleted && w.id !== excludeId)
    .sort((a, b) => b.started_at.localeCompare(a.started_at));
  for (const w of sorted) {
    for (const b of w.blocks) {
      if (b.skipped) continue;
      for (const e of b.exercises) {
        if (norm(e.name) === norm(name) && e.sets.some((s) => s.reps != null)) {
          return { date: w.date, sets: e.sets.filter((s) => s.reps != null) };
        }
      }
    }
  }
  return null;
}

/** Fill a set list from the plan, taking weights from last time where we have them. */
export function plannedSets(
  warmupSets: number,
  sets: number,
  rir: number | null,
  last: LastPerformance | null,
): WorkoutSet[] {
  const lastWarm = last?.sets.filter((s) => s.kind === 'warmup') ?? [];
  const lastWork = last?.sets.filter((s) => s.kind === 'work') ?? [];
  const out: WorkoutSet[] = [];
  for (let i = 0; i < warmupSets; i++) {
    out.push({ kind: 'warmup', weight_kg: lastWarm[i]?.weight_kg ?? null, reps: null, rir: null });
  }
  for (let i = 0; i < sets; i++) {
    const prev = lastWork[i] ?? lastWork[lastWork.length - 1];
    out.push({ kind: 'work', weight_kg: prev?.weight_kg ?? null, reps: null, rir });
  }
  return out;
}

export function buildWorkout(
  program: Program,
  day: ProgramDay,
  history: Workout[],
  id: string,
  now = new Date(),
): Omit<Workout, 'updated_at' | 'deleted' | 'dirty'> {
  const n = timesDone(day.id, history);
  const blocks: WorkoutBlock[] = day.blocks.map((b) => ({
    blockId: b.id,
    restSec: b.restSec,
    optional: b.optional,
    exercises: b.slots.map((s) => {
      const options = s.options.filter((o) => o.trim() !== '');
      const name = options.length ? options[n % options.length] : 'Exercise';
      return {
        slotId: s.id,
        name,
        options,
        repsMin: s.repsMin,
        repsMax: s.repsMax,
        rir: s.rir,
        notes: s.notes,
        sets: plannedSets(s.warmupSets, s.sets, s.rir, lastPerformance(name, history)),
      };
    }),
  }));
  return {
    id,
    date: localDate(now),
    program_id: program.id,
    day_id: day.id,
    day_name: day.name,
    started_at: now.toISOString(),
    finished_at: null,
    current: 0,
    blocks,
  };
}

/** Fraction of sets with reps entered (skipped blocks count as done). */
export function progress(w: Pick<Workout, 'blocks'>): number {
  let total = 0;
  let done = 0;
  for (const b of w.blocks) {
    for (const e of b.exercises) {
      for (const s of e.sets) {
        total++;
        if (b.skipped || s.reps != null) done++;
      }
    }
  }
  return total === 0 ? 0 : done / total;
}

export function formatRest(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatReps(min: number, max: number): string {
  return min === max ? String(min) : `${min}–${max}`;
}

export function elapsed(startIso: string, endIso: string | null, now = Date.now()): number {
  const end = endIso ? new Date(endIso).getTime() : now;
  return Math.max(0, Math.floor((end - new Date(startIso).getTime()) / 1000));
}

export function hms(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}
