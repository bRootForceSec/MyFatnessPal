import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Food, type FoodData, type FoodLog, type FoodUnit, type Macros, type Program, type Workout } from './db';
import { computeTargets, entryTotal, isCurrentProfile, targetFor, type Targets, type Training } from './nutrition';
import { newId, saveRecord } from './records';
import { profileOn, useSettings } from './settings';
import { useActiveProgram, useWorkouts } from './workoutData';

export function useFoodLogs(date: string): FoodLog[] | undefined {
  return useLiveQuery(
    () =>
      db.food_logs
        .where('date')
        .equals(date)
        .filter((l) => !l.deleted)
        .sortBy('logged_at'),
    [date],
  );
}

export function useSavedFoods(): Food[] | undefined {
  return useLiveQuery(
    async () =>
      (await db.foods.filter((f) => !f.deleted && f.saved === 1).toArray()).sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );
}

export interface Recent {
  key: string;
  food: FoodData;
  food_id?: string;
  qty: number;
  unit: FoodUnit;
  count: number;
  last: string;
}

const foodKey = (l: Pick<FoodLog, 'food_id' | 'food'>) =>
  l.food_id ?? l.food.source_id ?? `${l.food.name}|${l.food.brand ?? ''}`.toLowerCase();

/** Foods you've logged in the last 60 days, most-used first (quick re-add). */
export function useRecents(): Recent[] | undefined {
  return useLiveQuery(async () => {
    const since = new Date(Date.now() - 60 * 86400_000).toISOString();
    const logs = await db.food_logs.where('logged_at').above(since).filter((l) => !l.deleted && l.food.source !== 'quick').toArray();
    const map = new Map<string, Recent>();
    for (const l of logs.sort((a, b) => a.logged_at.localeCompare(b.logged_at))) {
      const key = foodKey(l);
      const r = map.get(key);
      map.set(key, { key, food: l.food, food_id: l.food_id, qty: l.qty, unit: l.unit, count: (r?.count ?? 0) + 1, last: l.logged_at });
    }
    // Rank by use count, with a bonus for recent use.
    const score = (r: Recent) => r.count + (Date.now() - new Date(r.last).getTime() < 3 * 86400_000 ? 3 : 0);
    return [...map.values()].sort((a, b) => score(b) - score(a)).slice(0, 40);
  }, []);
}

export async function logFood(date: string, food: FoodData, qty: number, unit: FoodUnit, food_id?: string, id?: string): Promise<void> {
  const existing = id ? await db.food_logs.get(id) : undefined;
  await saveRecord<FoodLog>('food_logs', {
    id: id ?? newId(),
    date,
    logged_at: existing?.logged_at ?? new Date().toISOString(),
    food_id,
    food,
    qty,
    unit,
    total: entryTotal(food, qty, unit),
  });
  // Remember scanned foods so the same barcode works offline next time.
  if (!id && food.barcode && !food_id) {
    const known = await db.foods.where('barcode').equals(food.barcode).first();
    if (!known) await saveRecord<Food>('foods', { ...food, id: newId(), saved: 0 });
  }
}

export async function saveFood(food: FoodData & Partial<Pick<Food, 'ingredients' | 'yield_servings'>>, id?: string): Promise<string> {
  const fid = id ?? newId();
  await saveRecord<Food>('foods', { ...food, id: fid, saved: 1 });
  return fid;
}

export function isTrainingDay(date: string, program: Program | null | undefined, workouts: Workout[]): boolean {
  if (workouts.some((w) => w.date === date)) return true;
  if (program?.schedule === 'weekly') {
    const [y, m, d] = date.split('-').map(Number);
    const wd = new Date(y, m - 1, d).getDay();
    return program.days.some((day) => day.weekdays.includes(wd));
  }
  return false;
}

/** Latest weigh-in on or before a date (kg). */
export function useWeightOn(date: string): number | null | undefined {
  return useLiveQuery(async () => {
    const logs = await db.body
      .where('date')
      .belowOrEqual(date)
      .filter((b) => !b.deleted && b.weight_kg != null)
      .reverse()
      .sortBy('date');
    return logs[0]?.weight_kg ?? null;
  }, [date]);
}

/** Workouts per week and typical length, from the program and the last 4 weeks of logs. */
export function trainingStats(program: Program | null | undefined, workouts: Workout[], now = Date.now()): Training {
  const since = now - 28 * 86400_000;
  const recent = workouts.filter((w) => w.finished_at && !w.deleted && new Date(w.started_at).getTime() >= since);
  const lengths = recent
    .map((w) => (new Date(w.finished_at!).getTime() - new Date(w.started_at).getTime()) / 3600_000)
    .filter((h) => h > 0.15 && h < 4);
  const hours = lengths.length >= 3 ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0.75;
  let sessionsPerWeek: number;
  if (program?.schedule === 'weekly') sessionsPerWeek = new Set(program.days.flatMap((d) => d.weekdays)).size;
  else if (recent.length >= 4) sessionsPerWeek = Math.min(7, recent.length / 4);
  else sessionsPerWeek = program ? 3 : 0;
  return { sessionsPerWeek: Math.round(sessionsPerWeek * 10) / 10, hours: Math.round(hours * 100) / 100 };
}

export function useTraining(): Training | undefined {
  const program = useActiveProgram();
  const workouts = useWorkouts();
  if (program === undefined || workouts === undefined) return undefined;
  return trainingStats(program, workouts);
}

export interface DayTarget {
  targets: Targets;
  today: Macros;
  training: boolean;
}

/** Targets for a date, or null if the nutrition setup isn't done yet. undefined while loading. */
export function useDayTarget(date: string): DayTarget | null | undefined {
  const prefs = useSettings();
  const { loaded } = prefs;
  const profile = profileOn(prefs, date);
  const weight = useWeightOn(date);
  const program = useActiveProgram();
  const workouts = useWorkouts();
  if (!loaded || weight === undefined || program === undefined || workouts === undefined) return undefined;
  if (!isCurrentProfile(profile) || weight == null) return null;
  const targets = computeTargets(profile, weight, trainingStats(program, workouts), Number(date.slice(0, 4)));
  const training = isTrainingDay(date, program, workouts);
  return { targets, today: targetFor(targets, training), training };
}
