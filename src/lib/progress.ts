import { addDays } from './dates';
import type { BodyLog, FoodLog, Profile, SleepLog, Workout } from './db';
import { goalRateKg, KCAL_PER_KG } from './nutrition';

/* ---------- Time ranges ---------- */

export const RANGES = [
  { key: 'week', label: 'Week', days: 7 },
  { key: 'month', label: 'Month', days: 30 },
  { key: '3m', label: '3M', days: 91 },
  { key: 'year', label: 'Year', days: 365 },
  { key: 'all', label: 'All', days: Infinity },
] as const;
export type RangeKey = (typeof RANGES)[number]['key'];

/** First date (YYYY-MM-DD) included in a range ending today. */
export function rangeStart(key: RangeKey, today: string, earliest: string | null): string {
  const r = RANGES.find((x) => x.key === key)!;
  if (r.days === Infinity) return earliest ?? today;
  return addDays(today, -(r.days - 1));
}

export const dayMs = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
};

/* ---------- Strength ---------- */

/** Estimated one-rep max (Epley). Sets above 12 reps are less reliable, so they are capped there. */
export function e1rm(weightKg: number, reps: number): number {
  if (reps <= 1) return weightKg;
  return weightKg * (1 + Math.min(reps, 12) / 30);
}

export interface LiftPoint {
  date: string;
  /** Best estimated 1RM that session, kg. */
  e1rm: number;
  weightKg: number;
  reps: number;
}

export interface Lift {
  key: string;
  name: string;
  points: LiftPoint[];
}

const norm = (s: string) => s.trim().toLowerCase();

/** Best working set per exercise per session, for every exercise done with weight. */
export function liftHistory(workouts: Workout[]): Lift[] {
  const map = new Map<string, Lift>();
  const done = workouts.filter((w) => w.finished_at && !w.deleted).sort((a, b) => a.started_at.localeCompare(b.started_at));
  for (const w of done) {
    for (const b of w.blocks) {
      if (b.skipped) continue;
      for (const e of b.exercises) {
        let best: LiftPoint | null = null;
        for (const s of e.sets) {
          if (s.kind !== 'work' || !s.reps || !s.weight_kg || s.weight_kg <= 0) continue;
          const est = e1rm(s.weight_kg, s.reps);
          if (!best || est > best.e1rm) best = { date: w.date, e1rm: est, weightKg: s.weight_kg, reps: s.reps };
        }
        if (!best) continue;
        const key = norm(e.name);
        const lift = map.get(key) ?? { key, name: e.name.trim(), points: [] };
        const same = lift.points.find((p) => p.date === best!.date);
        if (same) {
          if (best.e1rm > same.e1rm) Object.assign(same, best);
        } else lift.points.push(best);
        map.set(key, lift);
      }
    }
  }
  return [...map.values()].sort((a, b) => b.points.length - a.points.length || a.name.localeCompare(b.name));
}

export interface PR {
  name: string;
  date: string;
  point: LiftPoint;
  /** Previous best estimated 1RM, kg. */
  previous: number;
}

/** Sessions on or after `from` that beat every earlier session of the same exercise. */
export function personalRecords(lifts: Lift[], from: string): PR[] {
  const out: PR[] = [];
  for (const l of lifts) {
    let best = 0;
    for (const p of l.points) {
      if (best > 0 && p.e1rm > best + 0.01 && p.date >= from) out.push({ name: l.name, date: p.date, point: p, previous: best });
      best = Math.max(best, p.e1rm);
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/** Percent change of estimated 1RM from the first session in range. */
export function liftChange(l: Lift, from: string): { pct: number; points: { date: string; pct: number }[] } | null {
  const pts = l.points.filter((p) => p.date >= from);
  if (pts.length === 0) return null;
  const base = pts[0].e1rm;
  const points = pts.map((p) => ({ date: p.date, pct: (p.e1rm / base - 1) * 100 }));
  return { pct: points[points.length - 1].pct, points };
}

/* ---------- Bodyweight ---------- */

export interface WeightPoint {
  date: string;
  kg: number;
  /** Smoothed trend, kg. */
  trend: number;
}

/**
 * Smooth daily weigh-ins into a trend (an exponential moving average that
 * moves about 10% of the way toward each day's weight; gaps count as days).
 */
export function weightTrend(logs: Pick<BodyLog, 'date' | 'weight_kg' | 'deleted'>[]): WeightPoint[] {
  const ws = logs.filter((l) => !l.deleted && l.weight_kg != null).sort((a, b) => a.date.localeCompare(b.date));
  const out: WeightPoint[] = [];
  let trend: number | null = null;
  let last = '';
  for (const l of ws) {
    const kg = l.weight_kg!;
    if (trend == null) trend = kg;
    else {
      const gap = Math.max(1, Math.round((dayMs(l.date) - dayMs(last)) / 86400_000));
      const a = 1 - 0.9 ** gap;
      trend = trend + a * (kg - trend);
    }
    last = l.date;
    out.push({ date: l.date, kg, trend });
  }
  return out;
}

/** Least-squares slope of weigh-ins, in kg per week. */
export function slopePerWeek(points: { date: string; kg: number }[]): number | null {
  if (points.length < 2) return null;
  const xs = points.map((p) => dayMs(p.date) / 86400_000);
  const ys = points.map((p) => p.kg);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den === 0 ? null : (num / den) * 7;
}

/* ---------- Calorie check ---------- */

export const CHECK_DAYS = 21;
const MIN_WEIGH_INS = 8;
const MIN_SPAN_DAYS = 14;
const MIN_LOGGED_DAYS = 10;
/** Off by less than this (kg/week, about ¼ lb) counts as on pace. */
const ON_PACE_KG = 0.11;
/** Logged intake this far from the target means "hit the target first". */
const INTAKE_GAP_KCAL = 200;
const MAX_STEP_KCAL = 300;

export type Check =
  | { kind: 'not_enough'; weighIns: number; loggedDays: number }
  | { kind: 'on_pace'; actualKg: number; goalKg: number }
  | { kind: 'intake_gap'; actualKg: number; goalKg: number; avgIntake: number; avgTarget: number }
  | { kind: 'adjust'; actualKg: number; goalKg: number; kcal: number };

/**
 * Compare the last 3 weeks of weigh-ins with the goal pace.
 * Only suggests a calorie change when food was logged most days and intake was close to target,
 * so the scale reflects the target rather than missed logging.
 */
export function calorieCheck(
  profile: Pick<Profile, 'goal' | 'rate_kg'>,
  body: Pick<BodyLog, 'date' | 'weight_kg' | 'deleted'>[],
  foodByDay: Map<string, number>,
  targetKcal: number,
  today: string,
): Check {
  const from = addDays(today, -(CHECK_DAYS - 1));
  const ws = body
    .filter((b) => !b.deleted && b.weight_kg != null && b.date >= from && b.date <= today)
    .map((b) => ({ date: b.date, kg: b.weight_kg! }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const logged = [...foodByDay.entries()].filter(([d, k]) => d >= from && d < today && k > 0);
  const span = ws.length ? (dayMs(ws[ws.length - 1].date) - dayMs(ws[0].date)) / 86400_000 : 0;
  if (ws.length < MIN_WEIGH_INS || span < MIN_SPAN_DAYS || logged.length < MIN_LOGGED_DAYS) {
    return { kind: 'not_enough', weighIns: ws.length, loggedDays: logged.length };
  }
  const actualKg = slopePerWeek(ws)!;
  const goalKg = goalRateKg(profile);
  const diff = actualKg - goalKg;
  if (Math.abs(diff) < ON_PACE_KG) return { kind: 'on_pace', actualKg, goalKg };
  const avgIntake = logged.reduce((a, [, k]) => a + k, 0) / logged.length;
  if (Math.abs(avgIntake - targetKcal) > INTAKE_GAP_KCAL) {
    return { kind: 'intake_gap', actualKg, goalKg, avgIntake: Math.round(avgIntake), avgTarget: Math.round(targetKcal) };
  }
  // Gaining faster than planned → eat less, and the other way round.
  const raw = (-diff * KCAL_PER_KG) / 7;
  const kcal = Math.sign(raw) * Math.min(MAX_STEP_KCAL, Math.round(Math.abs(raw) / 25) * 25);
  if (kcal === 0) return { kind: 'on_pace', actualKg, goalKg };
  return { kind: 'adjust', actualKg, goalKg, kcal };
}

/* ---------- Daily totals ---------- */

export function caloriesByDay(logs: Pick<FoodLog, 'date' | 'total' | 'deleted'>[]): Map<string, { kcal: number; protein: number }> {
  const m = new Map<string, { kcal: number; protein: number }>();
  for (const l of logs) {
    if (l.deleted) continue;
    const cur = m.get(l.date) ?? { kcal: 0, protein: 0 };
    cur.kcal += l.total.kcal;
    cur.protein += l.total.protein;
    m.set(l.date, cur);
  }
  return m;
}

/** Monday-start week key for a date. */
export function weekStart(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const wd = (new Date(y, m - 1, d).getDay() + 6) % 7;
  return addDays(date, -wd);
}

/** Finished workouts per week, including empty weeks, from `from` to `today`. */
export function workoutsPerWeek(workouts: Workout[], from: string, today: string): { week: string; count: number }[] {
  const out: { week: string; count: number }[] = [];
  for (let w = weekStart(from); w <= today; w = addDays(w, 7)) out.push({ week: w, count: 0 });
  for (const wo of workouts) {
    if (!wo.finished_at || wo.deleted || wo.date < from || wo.date > today) continue;
    const row = out.find((r) => r.week === weekStart(wo.date));
    if (row) row.count++;
  }
  return out;
}

export function sleepInRange(sleep: SleepLog[], from: string, today: string): SleepLog[] {
  return sleep.filter((s) => !s.deleted && s.date >= from && s.date <= today).sort((a, b) => a.date.localeCompare(b.date));
}
