import Dexie, { type Table } from 'dexie';
import type { UnitSystem } from './units';

/**
 * Every synced record carries these fields.
 * - updated_at: ISO time of the last local edit (used for last-write-wins).
 * - deleted: 1 = soft-deleted, so the deletion can sync to other devices.
 * - dirty: 1 = changed locally and not yet pushed to the server.
 */
export interface BaseRecord {
  id: string;
  updated_at: string;
  deleted: 0 | 1;
  dirty: 0 | 1;
}

export interface SleepLog extends BaseRecord {
  /** The morning you woke up, YYYY-MM-DD. One log per date. */
  date: string;
  hours: number;
  /** 1 (wrecked) to 5 (great). */
  rested: number;
}

export const MEASUREMENTS = [
  { key: 'waist', label: 'Waist' },
  { key: 'chest', label: 'Chest' },
  { key: 'hips', label: 'Hips' },
  { key: 'neck', label: 'Neck' },
  { key: 'arm', label: 'Arm (flexed)' },
  { key: 'thigh', label: 'Thigh' },
] as const;
export type MeasurementKey = (typeof MEASUREMENTS)[number]['key'];

export interface BodyLog extends BaseRecord {
  /** YYYY-MM-DD. One log per date. */
  date: string;
  weight_kg?: number;
  body_fat_pct?: number;
  measurements_cm?: Partial<Record<MeasurementKey, number>>;
}

export type Sex = 'male' | 'female';
/** How active your day is outside of workouts. */
export type Lifestyle = 'not_very' | 'light' | 'active' | 'very';
export type Goal = 'lose' | 'recomp' | 'maintain' | 'gain' | 'strength';

/** Answers from the nutrition setup. Everything is stored in metric. */
export interface Profile {
  /** Bumped when the questions change, so older answers get asked again. */
  v: 2;
  sex: Sex;
  birth_year: number;
  height_cm: number;
  lifestyle: Lifestyle;
  goal: Goal;
  /** Weekly change for lose / gain, in kg per week (always positive). */
  rate_kg: number;
  /** How workout calories are added: the same every day, or only on training days. */
  workout_mode: 'spread' | 'training_days';
  /** Calories burned per workout; null = estimate from bodyweight and session length. */
  workout_kcal: number | null;
  protein_mode: 'per_weight' | 'fixed';
  /** Grams of protein per kg of bodyweight (shown as g/lb in imperial). */
  protein_g_per_kg: number;
  protein_fixed_g: number;
  /** Share of calories from fat, e.g. 0.25. Carbs fill the rest. */
  fat_pct: number;
  /** Minimums, in grams per kg of bodyweight. */
  fat_min_g_per_kg: number;
  carb_min_g_per_kg: number;
  calorie_mode: 'calculated' | 'manual';
  manual_kcal: number;
  /** Calories added or removed after comparing the weight trend with the goal (calculated mode). */
  kcal_adjust?: number;
}

export interface Settings extends BaseRecord {
  units: UnitSystem;
  profile?: Profile;
}

/* ---------- Food ---------- */

export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** A way to measure a food, e.g. "1 cup" = 240 g, or "serving" = 1 serving. */
export interface FoodUnit {
  label: string;
  /** Grams for gram-based foods, servings for serving-based foods. */
  amount: number;
}

/** What you need to log a food, saved with every entry so entries never change. */
export interface FoodData {
  name: string;
  brand?: string;
  /** 'g' = macros are per 100 g; 'serving' = macros are per 1 serving. */
  basis: 'g' | 'serving';
  macros: Macros;
  units: FoodUnit[];
  barcode?: string;
  source: 'usda' | 'off' | 'custom' | 'recipe' | 'quick';
  source_id?: string;
}

export interface RecipeIngredient {
  food: FoodData;
  qty: number;
  unit: FoodUnit;
}

/** Saved foods: your own foods, recipes and meals, and anything you've logged before. */
export interface Food extends BaseRecord, FoodData {
  ingredients?: RecipeIngredient[];
  /** Recipes: how many servings the whole recipe makes. */
  yield_servings?: number;
  /** true = shown under "My foods" (created or saved by you). */
  saved: 0 | 1;
}

export interface FoodLog extends BaseRecord {
  date: string;
  logged_at: string;
  food_id?: string;
  food: FoodData;
  qty: number;
  unit: FoodUnit;
  /** Totals for this entry. */
  total: Macros;
}

export const SETTINGS_ID = 'settings';

/* ---------- Workouts ---------- */

/** One exercise position in a session. Alternates rotate each time the session is done. */
export interface Slot {
  id: string;
  /** Exercise names. options[0] is used the 1st time, options[1] the 2nd, and so on. */
  options: string[];
  warmupSets: number;
  sets: number;
  repsMin: number;
  repsMax: number;
  /** Target reps in reserve for working sets (0 = to failure), or null if not tracked. */
  rir: number | null;
  notes?: string;
}

/** One full-screen card: a single exercise, or several done as a superset. */
export interface Block {
  id: string;
  slots: Slot[];
  /** Rest after each set (or after each round of a superset), in seconds. */
  restSec: number;
  /** Optional blocks (e.g. injury-prevention finishers) can be skipped. */
  optional?: boolean;
}

export interface ProgramDay {
  id: string;
  name: string;
  /** Weekly schedule only: 0 = Sunday ... 6 = Saturday. */
  weekdays: number[];
  blocks: Block[];
}

export interface Program extends BaseRecord {
  name: string;
  /** weekly = fixed weekdays; rotation = work through the days in order, whatever the date. */
  schedule: 'weekly' | 'rotation';
  active: 0 | 1;
  days: ProgramDay[];
}

export interface WorkoutSet {
  kind: 'warmup' | 'work';
  weight_kg: number | null;
  reps: number | null;
  rir: number | null;
}

export interface WorkoutExercise {
  slotId: string;
  name: string;
  /** All alternates for this slot, so you can swap on the card. */
  options: string[];
  repsMin: number;
  repsMax: number;
  rir: number | null;
  notes?: string;
  sets: WorkoutSet[];
}

export interface WorkoutBlock {
  blockId: string;
  restSec: number;
  optional?: boolean;
  skipped?: boolean;
  exercises: WorkoutExercise[];
  note?: string;
}

export interface Workout extends BaseRecord {
  date: string;
  program_id: string | null;
  day_id: string | null;
  day_name: string;
  started_at: string;
  finished_at: string | null;
  /** Index of the card you're on, so an interrupted workout resumes in place. */
  current: number;
  blocks: WorkoutBlock[];
}

export interface Meta {
  key: string;
  value: string;
}

/** Collections that sync to the server. Add new ones here as features land. */
export const COLLECTIONS = ['settings', 'sleep', 'body', 'programs', 'workouts', 'foods', 'food_logs'] as const;
export type Collection = (typeof COLLECTIONS)[number];

class AppDB extends Dexie {
  settings!: Table<Settings, string>;
  sleep!: Table<SleepLog, string>;
  body!: Table<BodyLog, string>;
  programs!: Table<Program, string>;
  workouts!: Table<Workout, string>;
  foods!: Table<Food, string>;
  food_logs!: Table<FoodLog, string>;
  meta!: Table<Meta, string>;

  constructor() {
    super('myfatnesspal');
    this.version(1).stores({
      settings: 'id, dirty',
      sleep: 'id, date, dirty',
      body: 'id, date, dirty',
      meta: 'key',
    });
    this.version(2).stores({
      programs: 'id, dirty',
      workouts: 'id, date, started_at, dirty',
    });
    this.version(3).stores({
      foods: 'id, barcode, source_id, dirty',
      food_logs: 'id, date, logged_at, dirty',
    });
  }
}

export const db = new AppDB();

export function table(c: Collection): Table<BaseRecord, string> {
  return db.table(c);
}
