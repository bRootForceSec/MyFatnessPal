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
  bodyweight?: boolean;
}

const BODYWEIGHT_RE = /\b(pull[- ]?ups?|chin[- ]?ups?|dips?|push[- ]?ups?|press[- ]?ups?|inverted rows?|muscle[- ]?ups?|pistol squats?|nordic|hanging (leg|knee) raises?|sit[- ]?ups?|bodyweight)\b/i;

/** Exercises that move your own body (added weight is logged on top). */
export function looksBodyweight(name: string): boolean {
  return BODYWEIGHT_RE.test(name);
}

/** Whether an exercise counts bodyweight: what you chose last time, else a guess from its name. */
export function isBodyweight(name: string, last: LastPerformance | null): boolean {
  return last?.bodyweight ?? looksBodyweight(name);
}

/** How much to add once every working set reaches the top of the rep range. */
export function weightStep(currentKg: number, imperial: boolean): number {
  const LB = 0.45359237;
  if (imperial) return (currentKg / LB >= 200 ? 10 : 5) * LB;
  return currentKg >= 100 ? 5 : 2.5;
}

export interface Suggestion {
  /** Weight to use for working sets (added weight for bodyweight exercises). */
  weightKg: number;
  stepKg: number;
}

/**
 * Double progression: once every working set last time reached the top of the
 * rep range, add a step of weight; otherwise keep the weight and beat the reps.
 */
export function nextWeight(
  last: LastPerformance | null,
  repsMax: number,
  imperial: boolean,
  bodyweight = last?.bodyweight ?? false,
): Suggestion | null {
  const work = last?.sets.filter((s) => s.kind === 'work' && s.reps != null) ?? [];
  if (work.length === 0 || !work.every((s) => s.reps! >= repsMax)) return null;
  const top = Math.max(...work.map((s) => s.weight_kg ?? 0));
  if (top <= 0 && !bodyweight) return null; // no weight logged
  const stepKg = weightStep(top, imperial);
  return { weightKg: top + stepKg, stepKg };
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
          return { date: w.date, sets: e.sets.filter((s) => s.reps != null), bodyweight: e.bodyweight };
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
  next: Suggestion | null = null,
): WorkoutSet[] {
  const lastWarm = last?.sets.filter((s) => s.kind === 'warmup') ?? [];
  const lastWork = last?.sets.filter((s) => s.kind === 'work') ?? [];
  const out: WorkoutSet[] = [];
  for (let i = 0; i < warmupSets; i++) {
    out.push({ kind: 'warmup', weight_kg: lastWarm[i]?.weight_kg ?? null, reps: null, rir: null });
  }
  for (let i = 0; i < sets; i++) {
    const prev = lastWork[i] ?? lastWork[lastWork.length - 1];
    out.push({ kind: 'work', weight_kg: next ? round3(next.weightKg) : (prev?.weight_kg ?? null), reps: null, rir });
  }
  return out;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function buildWorkout(
  program: Program,
  day: ProgramDay,
  history: Workout[],
  id: string,
  now = new Date(),
  imperial = true,
): Omit<Workout, 'updated_at' | 'deleted' | 'dirty'> {
  const n = timesDone(day.id, history);
  const blocks: WorkoutBlock[] = day.blocks.map((b) => ({
    blockId: b.id,
    restSec: b.restSec,
    optional: b.optional,
    exercises: b.slots.map((s) => {
      const options = s.options.filter((o) => o.trim() !== '');
      const name = options.length ? options[n % options.length] : 'Exercise';
      const last = lastPerformance(name, history);
      const bw = isBodyweight(name, last);
      return {
        slotId: s.id,
        name,
        options,
        repsMin: s.repsMin,
        repsMax: s.repsMax,
        rir: s.rir,
        notes: s.notes,
        bodyweight: bw,
        sets: plannedSets(s.warmupSets, s.sets, s.rir, last, nextWeight(last, s.repsMax, imperial, bw)),
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
