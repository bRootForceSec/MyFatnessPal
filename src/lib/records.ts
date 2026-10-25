import { db, table, type BaseRecord, type Collection } from './db';
import { scheduleSync } from './sync';

export function newId(): string {
  return crypto.randomUUID();
}

type Fields<T extends BaseRecord> = Omit<T, 'updated_at' | 'deleted' | 'dirty'>;

/** Save a record locally, mark it for sync, and kick off a sync soon. */
export async function saveRecord<T extends BaseRecord>(c: Collection, fields: Fields<T>): Promise<void> {
  const rec = { ...fields, updated_at: new Date().toISOString(), deleted: 0, dirty: 1 } as T;
  await table(c).put(rec);
  scheduleSync();
}

/** Soft-delete so the deletion reaches other devices. */
export async function deleteRecord(c: Collection, id: string): Promise<void> {
  await table(c).update(id, { deleted: 1, dirty: 1, updated_at: new Date().toISOString() });
  scheduleSync();
}

/** Every local record (including deleted ones), for the data export. */
export async function exportAll(): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {};
  for (const t of db.tables) {
    if (t.name === 'meta') continue;
    out[t.name] = (await t.toArray()).filter((r: BaseRecord) => !r.deleted);
  }
  return out;
}
