import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { syncOnce, type PushRow, type Remote, type RemoteRow } from './syncCore';

/** In-memory stand-in for the Supabase `records` table, with the same last-write-wins rule. */
class FakeServer implements Remote {
  rows = new Map<string, RemoteRow>();
  clock = 0;
  async push(rows: PushRow[]) {
    for (const r of rows) {
      const key = `${r.collection}/${r.id}`;
      const old = this.rows.get(key);
      if (old && r.updated_at < old.updated_at) continue;
      this.clock++;
      this.rows.set(key, { ...r, server_updated_at: String(this.clock).padStart(10, '0') });
    }
  }
  async pull(since: string | null, limit: number) {
    return [...this.rows.values()]
      .filter((r) => since == null || r.server_updated_at > since)
      .sort((a, b) => a.server_updated_at.localeCompare(b.server_updated_at))
      .slice(0, limit);
  }
}

const iso = (s: number) => new Date(Date.UTC(2026, 9, 25, 7, 0, s)).toISOString();

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('syncOnce', () => {
  it('pushes dirty records and clears the dirty flag', async () => {
    const server = new FakeServer();
    await db.sleep.put({ id: 'a', date: '2026-10-25', hours: 7.5, rested: 4, updated_at: iso(1), deleted: 0, dirty: 1 });
    const res = await syncOnce(server, 'u1');
    expect(res.pushed).toBe(1);
    expect(server.rows.get('sleep/a')?.data).toEqual({ date: '2026-10-25', hours: 7.5, rested: 4 });
    expect((await db.sleep.get('a'))?.dirty).toBe(0);
  });

  it('pulls records written by another device', async () => {
    const server = new FakeServer();
    await server.push([{ collection: 'body', id: 'b', data: { date: '2026-10-24', weight_kg: 80 }, updated_at: iso(1), deleted: false }]);
    await syncOnce(server, 'u1');
    expect(await db.body.get('b')).toMatchObject({ weight_kg: 80, dirty: 0, deleted: 0 });

    // Second sync only fetches newer rows.
    const res = await syncOnce(server, 'u1');
    expect(res.pulled).toBe(0);
  });

  it('keeps the newer edit when two devices change the same record', async () => {
    const server = new FakeServer();
    // Phone edited at t=5 (newer), computer edited at t=3.
    await db.sleep.put({ id: 'a', date: '2026-10-25', hours: 8, rested: 5, updated_at: iso(5), deleted: 0, dirty: 1 });
    await server.push([{ collection: 'sleep', id: 'a', data: { date: '2026-10-25', hours: 6, rested: 2 }, updated_at: iso(3), deleted: false }]);
    await syncOnce(server, 'u1');
    expect((await db.sleep.get('a'))?.hours).toBe(8);
    expect(server.rows.get('sleep/a')?.data.hours).toBe(8);
  });

  it('syncs deletions', async () => {
    const server = new FakeServer();
    await server.push([{ collection: 'sleep', id: 'a', data: { date: '2026-10-25', hours: 6, rested: 2 }, updated_at: iso(1), deleted: false }]);
    await syncOnce(server, 'u1');
    await server.push([{ collection: 'sleep', id: 'a', data: { date: '2026-10-25', hours: 6, rested: 2 }, updated_at: iso(2), deleted: true }]);
    await syncOnce(server, 'u1');
    expect((await db.sleep.get('a'))?.deleted).toBe(1);
  });

  it('ignores collections this version does not know about', async () => {
    const server = new FakeServer();
    await server.push([{ collection: 'future', id: 'x', data: {}, updated_at: iso(1), deleted: false }]);
    await expect(syncOnce(server, 'u1')).resolves.toBeDefined();
  });
});
