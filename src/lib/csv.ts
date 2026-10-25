import { db, MEASUREMENTS, type BodyLog, type FoodLog, type SleepLog, type Workout } from './db';
import { cmToDisplay, kgToDisplay, lengthUnit, round, weightUnit, type UnitSystem } from './units';

type Cell = string | number | null | undefined;

/** Rows to CSV text, quoting cells that contain commas, quotes or line breaks. */
export function toCsv(rows: Cell[][]): string {
  const cell = (v: Cell) => {
    if (v == null) return '';
    const s = typeof v === 'number' ? String(Math.round(v * 100) / 100) : v;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

const byDate = <T extends { date: string }>(a: T, b: T) => a.date.localeCompare(b.date);

export function foodRows(logs: FoodLog[]): Cell[][] {
  return [
    ['date', 'time', 'food', 'brand', 'amount', 'kcal', 'protein_g', 'carbs_g', 'fat_g'],
    ...logs
      .filter((l) => !l.deleted)
      .sort((a, b) => a.date.localeCompare(b.date) || a.logged_at.localeCompare(b.logged_at))
      .map((l) => [
        l.date,
        new Date(l.logged_at).toTimeString().slice(0, 5),
        l.food.name,
        l.food.brand,
        l.food.source === 'quick' ? '' : `${l.qty} ${l.unit.label}`,
        l.total.kcal,
        l.total.protein,
        l.total.carbs,
        l.total.fat,
      ]),
  ];
}

export function workoutRows(ws: Workout[], units: UnitSystem): Cell[][] {
  const out: Cell[][] = [['date', 'session', 'exercise', 'set', 'type', `weight_${weightUnit(units)}`, 'reps', 'rir', 'note']];
  for (const w of ws.filter((x) => !x.deleted && x.finished_at).sort(byDate)) {
    for (const b of w.blocks) {
      if (b.skipped) continue;
      for (const e of b.exercises) {
        let n = 0;
        for (const s of e.sets) {
          if (s.reps == null) continue;
          out.push([
            w.date,
            w.day_name,
            e.name,
            ++n,
            s.kind,
            s.weight_kg == null ? null : kgToDisplay(s.weight_kg, units),
            s.reps,
            s.rir,
            b.note,
          ]);
        }
      }
    }
  }
  return out;
}

export function bodyRows(logs: BodyLog[], units: UnitSystem): Cell[][] {
  const lu = lengthUnit(units);
  return [
    ['date', `weight_${weightUnit(units)}`, 'body_fat_pct', ...MEASUREMENTS.map((m) => `${m.key}_${lu}`)],
    ...logs
      .filter((l) => !l.deleted)
      .sort(byDate)
      .map((l) => [
        l.date,
        l.weight_kg == null ? null : kgToDisplay(l.weight_kg, units),
        l.body_fat_pct,
        ...MEASUREMENTS.map((m) => {
          const v = l.measurements_cm?.[m.key];
          return v == null ? null : cmToDisplay(v, units);
        }),
      ]),
  ];
}

export function sleepRows(logs: SleepLog[]): Cell[][] {
  return [
    ['date', 'hours', 'rested_1_to_5'],
    ...logs
      .filter((l) => !l.deleted)
      .sort(byDate)
      .map((l) => [l.date, l.hours, l.rested]),
  ];
}

/** One row per day: food totals, weight, sleep and workout. */
export function dailyRows(food: FoodLog[], body: BodyLog[], sleep: SleepLog[], ws: Workout[], units: UnitSystem): Cell[][] {
  type Day = {
    kcal: number;
    protein: number;
    carbs: number;
    fat: number;
    logged: boolean;
    weight?: number;
    sleep?: SleepLog;
    workout: string[];
  };
  const days = new Map<string, Day>();
  const get = (d: string) => {
    let v = days.get(d);
    if (!v) days.set(d, (v = { kcal: 0, protein: 0, carbs: 0, fat: 0, logged: false, workout: [] }));
    return v;
  };
  for (const l of food) {
    if (l.deleted) continue;
    const d = get(l.date);
    d.logged = true;
    d.kcal += l.total.kcal;
    d.protein += l.total.protein;
    d.carbs += l.total.carbs;
    d.fat += l.total.fat;
  }
  for (const b of body) if (!b.deleted && b.weight_kg != null) get(b.date).weight = b.weight_kg;
  for (const s of sleep) if (!s.deleted) get(s.date).sleep = s;
  for (const w of ws) if (!w.deleted && w.finished_at) get(w.date).workout.push(w.day_name);
  return [
    ['date', 'kcal', 'protein_g', 'carbs_g', 'fat_g', `weight_${weightUnit(units)}`, 'sleep_hours', 'rested_1_to_5', 'workout'],
    ...[...days.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => [
        date,
        d.logged ? round(d.kcal, 0) : null,
        d.logged ? round(d.protein, 0) : null,
        d.logged ? round(d.carbs, 0) : null,
        d.logged ? round(d.fat, 0) : null,
        d.weight == null ? null : kgToDisplay(d.weight, units),
        d.sleep?.hours,
        d.sleep?.rested,
        d.workout.join(' + '),
      ]),
  ];
}

export type CsvKind = 'daily' | 'food' | 'workouts' | 'body' | 'sleep';

export async function buildCsv(kind: CsvKind, units: UnitSystem): Promise<string> {
  const [food, body, sleep, ws] = await Promise.all([db.food_logs.toArray(), db.body.toArray(), db.sleep.toArray(), db.workouts.toArray()]);
  const rows =
    kind === 'food'
      ? foodRows(food)
      : kind === 'workouts'
        ? workoutRows(ws, units)
        : kind === 'body'
          ? bodyRows(body, units)
          : kind === 'sleep'
            ? sleepRows(sleep)
            : dailyRows(food, body, sleep, ws, units);
  return toCsv(rows);
}
