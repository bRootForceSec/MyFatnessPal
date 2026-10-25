import { describe, expect, it } from 'vitest';
import { addDays } from './dates';
import type { Workout } from './db';
import { bodyweightLookup, calorieCheck, e1rm, liftChange, liftHistory, personalRecords, slopePerWeek, weekStart, weightTrend, workoutsPerWeek } from './progress';

function workout(date: string, name: string, sets: [number, number][], extra: Partial<Workout> = {}): Workout {
  return {
    id: date + name,
    date,
    program_id: null,
    day_id: null,
    day_name: 'Push',
    started_at: `${date}T10:00:00Z`,
    finished_at: `${date}T11:00:00Z`,
    current: 0,
    updated_at: '',
    deleted: 0,
    dirty: 0,
    blocks: [
      {
        blockId: 'b',
        restSec: 120,
        exercises: [
          {
            slotId: 's',
            name,
            options: [name],
            repsMin: 6,
            repsMax: 10,
            rir: 0,
            sets: [{ kind: 'warmup', weight_kg: 200, reps: 1, rir: null }, ...sets.map(([w, r]) => ({ kind: 'work' as const, weight_kg: w, reps: r, rir: 0 }))],
          },
        ],
      },
    ],
    ...extra,
  };
}

describe('strength', () => {
  it('estimates 1RM with Epley', () => {
    expect(e1rm(100, 1)).toBe(100);
    expect(e1rm(100, 10)).toBeCloseTo(133.33, 1);
    expect(e1rm(100, 20)).toBeCloseTo(140); // capped at 12 reps
  });

  it('takes the best working set and ignores warm-ups and unfinished workouts', () => {
    const lifts = liftHistory([
      workout('2026-01-01', 'Bench Press', [[80, 8], [80, 6]]),
      workout('2026-01-04', 'bench press ', [[82.5, 8]]),
      workout('2026-01-07', 'Bench Press', [[90, 8]], { finished_at: null }),
    ]);
    expect(lifts).toHaveLength(1);
    expect(lifts[0].points.map((p) => p.weightKg)).toEqual([80, 82.5]);
  });

  it('finds personal records and percent change', () => {
    const lifts = liftHistory([
      workout('2026-01-01', 'Squat', [[100, 5]]),
      workout('2026-01-08', 'Squat', [[100, 4]]),
      workout('2026-01-15', 'Squat', [[105, 5]]),
    ]);
    const prs = personalRecords(lifts, '2026-01-01');
    expect(prs).toHaveLength(1);
    expect(prs[0].date).toBe('2026-01-15');
    expect(liftChange(lifts[0], '2026-01-01')!.pct).toBeCloseTo(5);
    expect(liftChange(lifts[0], '2026-02-01')).toBeNull();
  });
});

describe('bodyweight', () => {
  it('smooths weigh-ins and measures the weekly slope', () => {
    const logs = Array.from({ length: 15 }, (_, i) => ({ date: addDays('2026-03-01', i), weight_kg: 90 - i * 0.1, deleted: 0 as const }));
    const t = weightTrend(logs);
    expect(t[0].trend).toBe(90);
    expect(t[14].trend).toBeGreaterThan(t[14].kg); // trend lags behind a falling weight
    expect(slopePerWeek(t)).toBeCloseTo(-0.7);
  });
});

describe('calorie check', () => {
  const today = '2026-04-22';
  const body = (perWeek: number) =>
    Array.from({ length: 21 }, (_, i) => ({ date: addDays(today, -20 + i), weight_kg: 90 + (perWeek / 7) * i, deleted: 0 as const }));
  const food = (kcal: number) => new Map(Array.from({ length: 20 }, (_, i) => [addDays(today, -20 + i), kcal]));
  const lose1lb = { goal: 'lose' as const, rate_kg: 0.4536 };

  it('waits for enough data', () => {
    expect(calorieCheck(lose1lb, body(-0.45).slice(0, 5), food(2000), 2000, today).kind).toBe('not_enough');
    expect(calorieCheck(lose1lb, body(-0.45), new Map(), 2000, today).kind).toBe('not_enough');
  });

  it('says on pace when close to the goal', () => {
    expect(calorieCheck(lose1lb, body(-0.45), food(2000), 2000, today).kind).toBe('on_pace');
  });

  it('suggests eating less when weight is not dropping', () => {
    const c = calorieCheck(lose1lb, body(0), food(2000), 2000, today);
    expect(c.kind).toBe('adjust');
    if (c.kind === 'adjust') expect(c.kcal).toBe(-300); // 499/day, capped at 300 a step
  });

  it('suggests eating more when losing too fast', () => {
    const c = calorieCheck(lose1lb, body(-0.75), food(2000), 2000, today);
    expect(c.kind).toBe('adjust');
    if (c.kind === 'adjust') expect(c.kcal).toBeGreaterThan(0);
  });

  it('points at intake first when logged food is far from target', () => {
    expect(calorieCheck(lose1lb, body(0), food(2500), 2000, today).kind).toBe('intake_gap');
  });

  it('treats strength and maintain goals as zero change', () => {
    expect(calorieCheck({ goal: 'strength', rate_kg: 0 }, body(0), food(2600), 2600, today).kind).toBe('on_pace');
  });
});

describe('weeks', () => {
  it('starts weeks on Monday and counts empty weeks', () => {
    expect(weekStart('2026-10-25')).toBe('2026-10-19'); // a Sunday
    const rows = workoutsPerWeek([workout('2026-10-20', 'Squat', [[100, 5]])], '2026-10-06', '2026-10-25');
    expect(rows.map((r) => r.count)).toEqual([0, 0, 1]);
  });
});

describe('bodyweight lifts', () => {
  it("adds that day's bodyweight to the added weight", () => {
    const w = workout('2026-02-10', 'Pull-up', [[10, 8]]);
    w.blocks[0].exercises[0].bodyweight = true;
    const body = [
      { date: '2026-02-01', weight_kg: 100, deleted: 0 as const },
      { date: '2026-02-09', weight_kg: 90, deleted: 0 as const },
      { date: '2026-02-20', weight_kg: 80, deleted: 0 as const },
    ];
    const lifts = liftHistory([w], bodyweightLookup(body));
    expect(lifts[0].points[0].weightKg).toBe(100); // 90 kg that day + 10 added
    expect(lifts[0].points[0].addedKg).toBe(10);
    expect(liftHistory([w])).toHaveLength(0); // no weigh-ins yet
  });
});
