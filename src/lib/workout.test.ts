import { describe, expect, it } from 'vitest';
import type { Program, Workout } from './db';
import { pplTemplate } from './templates';
import { buildWorkout, hms, lastPerformance, looksBodyweight, nextWeight, plannedDay, progress, timesDone } from './workout';

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

describe('progression', () => {
  const LB = 0.45359237;
  const perf = (reps: number[], weight: number | null, bodyweight?: boolean) => ({
    date: '2026-10-20',
    bodyweight,
    sets: reps.map((r) => ({ kind: 'work' as const, weight_kg: weight, reps: r, rir: 0 })),
  });

  it('adds weight only when every working set hit the top of the range', () => {
    expect(nextWeight(perf([10, 9], 60), 10, true)).toBeNull();
    const n = nextWeight(perf([10, 11], 60), 10, true)!;
    expect(n.stepKg).toBeCloseTo(5 * LB);
    expect(n.weightKg).toBeCloseTo(60 + 5 * LB);
    expect(nextWeight(perf([12, 12], 120), 12, false)!.stepKg).toBe(5);
    expect(nextWeight(perf([12, 12], 40), 12, false)!.stepKg).toBe(2.5);
  });

  it('suggests added weight for bodyweight exercises', () => {
    expect(nextWeight(perf([12, 12], null), 12, true)).toBeNull();
    expect(nextWeight(perf([12, 12], null, true), 12, true)!.weightKg).toBeCloseTo(5 * LB);
  });

  it('recognises bodyweight exercises by name', () => {
    expect(looksBodyweight('Weighted pull-up')).toBe(true);
    expect(looksBodyweight('Chin ups')).toBe(true);
    expect(looksBodyweight('Push-up')).toBe(true);
    expect(looksBodyweight('Weighted dips')).toBe(true);
    expect(looksBodyweight('Lat pulldown')).toBe(false);
    expect(looksBodyweight('Incline dumbbell press')).toBe(false);
  });

  it('prefills the suggested weight when building the next workout', () => {
    const p = program();
    const push = p.days[0];
    const done = finish(buildWorkout(p, push, [], 'w1', new Date('2026-10-26T10:00:00Z')), 10, 30);
    // The second session uses the alternate, so look at the third.
    const done2 = finish(buildWorkout(p, push, [done], 'w2', new Date('2026-10-29T10:00:00Z')), 8, 50);
    const next = buildWorkout(p, push, [done, done2], 'w3', new Date('2026-11-02T10:00:00Z'));
    const first = next.blocks[0].exercises[0];
    // Incline dumbbell press range is 6-10, so 10 reps at 30 kg earns +5 lb.
    expect(first.sets.find((s) => s.kind === 'work')!.weight_kg).toBeCloseTo(30 + 5 * LB, 2);
  });
});
