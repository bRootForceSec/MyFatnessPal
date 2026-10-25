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

export interface Settings extends BaseRecord {
  units: UnitSystem;
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
export const COLLECTIONS = ['settings', 'sleep', 'body', 'programs', 'workouts'] as const;
export type Collection = (typeof COLLECTIONS)[number];

class AppDB extends Dexie {
  settings!: Table<Settings, string>;
  sleep!: Table<SleepLog, string>;
  body!: Table<BodyLog, string>;
  programs!: Table<Program, string>;
  workouts!: Table<Workout, string>;
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
  }
}

export const db = new AppDB();

export function table(c: Collection): Table<BaseRecord, string> {
  return db.table(c);
}
