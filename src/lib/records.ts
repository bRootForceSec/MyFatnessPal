import { COLLECTIONS, db, table, type BaseRecord, type Collection } from './db';
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

/**
 * Load a backup made by "Download backup". Records missing here (or deleted here)
 * are added back; where both exist, the newer edit wins. Restored records sync.
 */
export async function importBackup(json: unknown): Promise<{ added: number; updated: number; skipped: number }> {
  if (!json || typeof json !== 'object') throw new Error("That file isn't a MyFatnessPal backup.");
  const data = json as Record<string, unknown>;
  if (!COLLECTIONS.some((c) => Array.isArray(data[c]))) throw new Error("That file isn't a MyFatnessPal backup.");
  const now = new Date().toISOString();
  let added = 0;
  let updated = 0;
  let skipped = 0;
  await db.transaction('rw', COLLECTIONS.map((c) => table(c)), async () => {
    for (const c of COLLECTIONS) {
      const rows = data[c];
      if (!Array.isArray(rows)) continue;
      for (const r of rows as BaseRecord[]) {
        if (!r || typeof r.id !== 'string' || typeof r.updated_at !== 'string') {
          skipped++;
          continue;
        }
        const local = await table(c).get(r.id);
        if (local && !local.deleted && local.updated_at >= r.updated_at) {
          skipped++;
          continue;
        }
        await table(c).put({ ...r, deleted: 0, dirty: 1, updated_at: local?.deleted ? now : r.updated_at });
        if (local && !local.deleted) updated++;
        else added++;
      }
    }
  });
  scheduleSync();
  return { added, updated, skipped };
}
