import { describe, expect, it } from 'vitest';
import type { Program, Workout } from './db';
import { pplTemplate } from './templates';
import { buildWorkout, hms, lastPerformance, plannedDay, progress, timesDone } from './workout';

const base = { updated_at: '', deleted: 0 as const, dirty: 0 as const };
const program = (): Program => ({ ...pplTemplate(), ...base });

function finish(w: Omit<Workout, 'updated_at' | 'deleted' | 'dirty'>, reps = 8, weight = 50): Workout {
  return {
    ...w,
    ...base,
    finished_at: w.started_at,
    blocks: w.blocks.map((b) => ({
      ...b,
      exercises: b.exercises.map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s, reps, weight_kg: weight })) })),
    })),
  };
}

describe('plannedDay', () => {
  it('picks the session for the weekday on a weekly schedule', () => {
    const p = program();
    expect(plannedDay(p, [], '2026-10-26')?.name).toBe('Push'); // Monday
    expect(plannedDay(p, [], '2026-10-28')?.name).toBe('Legs'); // Wednesday
    expect(plannedDay(p, [], '2026-10-25')).toBeNull(); // Sunday: rest
  });

  it('goes through sessions in order on a rotation', () => {
    const p = { ...program(), schedule: 'rotation' as const };
    expect(plannedDay(p, [])?.name).toBe('Push');
    const w = finish(buildWorkout(p, p.days[0], [], 'w1'));
    expect(plannedDay(p, [w])?.name).toBe('Pull');
  });
});

describe('buildWorkout', () => {
  it('rotates alternates each time the session is done', () => {
    const p = program();
    const push = p.days[0];
    const first = buildWorkout(p, push, [], 'w1', new Date('2026-10-26T10:00:00Z'));
    expect(first.blocks[0].exercises[0].name).toBe('Incline dumbbell press');
    const done = finish(first);
    expect(timesDone(push.id, [done])).toBe(1);
    const second = buildWorkout(p, push, [done], 'w2', new Date('2026-10-29T10:00:00Z'));
    expect(second.blocks[0].exercises[0].name).toBe('Incline Smith press');
  });

  it('fills weights from last time but leaves reps empty', () => {
    const p = program();
    const push = p.days[0];
    const done = finish(buildWorkout(p, push, [], 'w1', new Date('2026-10-26T10:00:00Z')), 9, 32.5);
    // Third run uses option 1 again (two alternates), so history exists for it.
    const done2 = finish(buildWorkout(p, push, [done], 'w2', new Date('2026-10-29T10:00:00Z')));
    const next = buildWorkout(p, push, [done, done2], 'w3', new Date('2026-11-02T10:00:00Z'));
    const sets = next.blocks[0].exercises[0].sets;
    expect(next.blocks[0].exercises[0].name).toBe('Incline dumbbell press');
    expect(sets.map((s) => s.kind)).toEqual(['warmup', 'work', 'work']);
    expect(sets.every((s) => s.weight_kg === 32.5 && s.reps === null)).toBe(true);
  });

  it('ignores unfinished workouts for history', () => {
    const p = program();
    const w = { ...buildWorkout(p, p.days[0], [], 'w1'), ...base };
    expect(lastPerformance('Incline dumbbell press', [w])).toBeNull();
  });
});

describe('progress', () => {
  it('counts sets with reps, and skipped blocks as done', () => {
    const p = program();
    const w = buildWorkout(p, p.days[0], [], 'w1');
    expect(progress(w)).toBe(0);
    w.blocks[4].skipped = true;
    expect(progress(w)).toBeGreaterThan(0);
    const all = finish(w);
    expect(progress(all)).toBe(1);
  });
});

it('formats the stopwatch', () => {
  expect(hms(3725)).toBe('01:02:05');
});
