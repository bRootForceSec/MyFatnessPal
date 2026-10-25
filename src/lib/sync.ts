import { useSyncExternalStore } from 'react';
import { getSupabase } from './supabase';
import { syncOnce, type Remote, type RemoteRow } from './syncCore';

export type SyncState =
  | { kind: 'off' } // no Supabase configured or not signed in
  | { kind: 'idle'; lastSync: number | null }
  | { kind: 'syncing' }
  | { kind: 'offline' }
  | { kind: 'error'; message: string };

let state: SyncState = { kind: 'off' };
let lastSync: number | null = null;
const listeners = new Set<() => void>();

function setState(s: SyncState) {
  state = s;
  listeners.forEach((l) => l());
}

export function useSyncState(): SyncState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

function supabaseRemote(): Remote | null {
  const sb = getSupabase();
  if (!sb) return null;
  return {
    async push(rows) {
      const { error } = await sb.from('records').upsert(rows, { onConflict: 'user_id,collection,id' });
      if (error) throw new Error(error.message);
    },
    async pull(since, limit) {
      let q = sb.from('records').select('collection,id,data,updated_at,deleted,server_updated_at');
      if (since) q = q.gt('server_updated_at', since);
      const { data, error } = await q.order('server_updated_at', { ascending: true }).limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []) as RemoteRow[];
    },
  };
}

let running: Promise<void> | null = null;
let again = false;

export async function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      const sb = getSupabase();
      const remote = supabaseRemote();
      if (!sb || !remote) return setState({ kind: 'off' });
      const { data } = await sb.auth.getSession();
      const userId = data.session?.user.id;
      if (!userId) return setState({ kind: 'off' });
      if (!navigator.onLine) return setState({ kind: 'offline' });
      setState({ kind: 'syncing' });
      try {
        await syncOnce(remote, userId);
        lastSync = Date.now();
        setState({ kind: 'idle', lastSync });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setState(navigator.onLine ? { kind: 'error', message } : { kind: 'offline' });
      }
    } while (again);
  })().finally(() => {
    running = null;
  });
  return running;
}

let timer: ReturnType<typeof setTimeout> | undefined;

/** Debounced sync after a local write. */
export function scheduleSync(delayMs = 1500): void {
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), delayMs);
}

/** Sync on start, when coming back online, when the app is reopened, and every few minutes. */
export function startAutoSync(): void {
  void syncNow();
  window.addEventListener('online', () => void syncNow());
  window.addEventListener('offline', () => setState({ kind: 'offline' }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow();
  });
  setInterval(() => void syncNow(), 5 * 60 * 1000);
  getSupabase()?.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') void syncNow();
  });
}
