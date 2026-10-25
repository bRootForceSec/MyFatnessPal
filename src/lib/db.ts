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

export interface Meta {
  key: string;
  value: string;
}

/** Collections that sync to the server. Add new ones here as features land. */
export const COLLECTIONS = ['settings', 'sleep', 'body'] as const;
export type Collection = (typeof COLLECTIONS)[number];

class AppDB extends Dexie {
  settings!: Table<Settings, string>;
  sleep!: Table<SleepLog, string>;
  body!: Table<BodyLog, string>;
  meta!: Table<Meta, string>;

  constructor() {
    super('myfatnesspal');
    this.version(1).stores({
      settings: 'id, dirty',
      sleep: 'id, date, dirty',
      body: 'id, date, dirty',
      meta: 'key',
    });
  }
}

export const db = new AppDB();

export function table(c: Collection): Table<BaseRecord, string> {
  return db.table(c);
}
