import { COLLECTIONS, db, table, type BaseRecord, type Collection } from './db';

/** A row in the server's `records` table. */
export interface RemoteRow {
  collection: string;
  id: string;
  data: Record<string, unknown>;
  updated_at: string;
  deleted: boolean;
  server_updated_at: string;
}

export type PushRow = Omit<RemoteRow, 'server_updated_at'>;

export interface Remote {
  push(rows: PushRow[]): Promise<void>;
  /** Rows changed on the server after `since` (exclusive), oldest first. */
  pull(since: string | null, limit: number): Promise<RemoteRow[]>;
}

const PAGE = 500;

function toRemote(collection: Collection, r: BaseRecord): PushRow {
  const { id, updated_at, deleted, dirty, ...data } = r;
  return { collection, id, data, updated_at, deleted: deleted === 1 };
}

function isCollection(c: string): c is Collection {
  return (COLLECTIONS as readonly string[]).includes(c);
}

/** Push local changes, then pull everything newer than the last pull. */
export async function syncOnce(remote: Remote, userId: string): Promise<{ pushed: number; pulled: number }> {
  // 1. Push dirty records.
  let pushed = 0;
  for (const c of COLLECTIONS) {
    const dirty = await table(c).where('dirty').equals(1).toArray();
    for (let i = 0; i < dirty.length; i += PAGE) {
      const batch = dirty.slice(i, i + PAGE);
      await remote.push(batch.map((r) => toRemote(c, r)));
      // Only clear the flag if the record wasn't edited again while pushing.
      await db.transaction('rw', table(c), async () => {
        for (const r of batch) {
          const cur = await table(c).get(r.id);
          if (cur && cur.updated_at === r.updated_at) await table(c).update(r.id, { dirty: 0 });
        }
      });
      pushed += batch.length;
    }
  }

  // 2. Pull server changes since our cursor.
  const cursorKey = `cursor:${userId}`;
  let cursor = (await db.meta.get(cursorKey))?.value ?? null;
  let pulled = 0;
  for (;;) {
    const rows = await remote.pull(cursor, PAGE);
    if (rows.length === 0) break;
    await db.transaction('rw', [...COLLECTIONS.map((c) => table(c)), db.meta], async () => {
      for (const row of rows) {
        if (!isCollection(row.collection)) continue; // from a newer app version
        const t = table(row.collection);
        const updated_at = new Date(row.updated_at).toISOString();
        const local = await t.get(row.id);
        // Keep a local edit that is newer than the server's copy.
        if (local && local.dirty === 1 && local.updated_at > updated_at) continue;
        await t.put({ ...row.data, id: row.id, updated_at, deleted: row.deleted ? 1 : 0, dirty: 0 } as BaseRecord);
      }
      cursor = rows[rows.length - 1].server_updated_at;
      await db.meta.put({ key: cursorKey, value: cursor });
    });
    pulled += rows.length;
    if (rows.length < PAGE) break;
  }
  return { pushed, pulled };
}
