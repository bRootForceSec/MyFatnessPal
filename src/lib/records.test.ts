import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { importBackup } from './records';

const rec = (id: string, updated_at: string, extra: object = {}) => ({ id, date: '2026-10-01', hours: 7, rested: 3, updated_at, deleted: 0, dirty: 0, ...extra });

describe('importBackup', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });

  it('adds missing records, keeps newer local edits, and brings back deleted ones', async () => {
    await db.sleep.bulkPut([
      rec('newer', '2026-10-05T00:00:00Z', { hours: 9 }),
      rec('older', '2026-10-01T00:00:00Z', { hours: 5 }),
      rec('gone', '2026-10-09T00:00:00Z', { deleted: 1 }),
    ] as never);
    const res = await importBackup({
      sleep: [
        rec('missing', '2026-10-02T00:00:00Z'),
        rec('newer', '2026-10-03T00:00:00Z', { hours: 6 }),
        rec('older', '2026-10-03T00:00:00Z', { hours: 8 }),
        rec('gone', '2026-10-01T00:00:00Z'),
      ],
    });
    expect(res).toEqual({ added: 2, updated: 1, skipped: 1 });
    expect((await db.sleep.get('newer'))!.hours).toBe(9);
    expect((await db.sleep.get('older'))!.hours).toBe(8);
    const gone = (await db.sleep.get('gone'))!;
    expect(gone.deleted).toBe(0);
    expect(gone.dirty).toBe(1);
    expect(gone.updated_at > '2026-10-09').toBe(true); // wins over the deletion when it syncs
  });

  it('rejects files that are not backups', async () => {
    await expect(importBackup({ hello: 1 })).rejects.toThrow(/backup/);
  });
});
