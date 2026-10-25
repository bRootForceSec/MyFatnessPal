import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const STORAGE_KEY = 'mfp.supabase';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

/**
 * The project URL and publishable ("anon") key are safe to be public: every row
 * in the database is locked to the signed-in user by row level security.
 * They can come from the build (VITE_ env vars) or be pasted into Settings.
 */
export function getConfig(): SupabaseConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (url && anonKey) return { url, anonKey };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const c = JSON.parse(raw) as SupabaseConfig;
      if (c.url && c.anonKey) return c;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function configFromBuild(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

export function saveConfig(c: SupabaseConfig | null): void {
  if (c) localStorage.setItem(STORAGE_KEY, JSON.stringify({ url: c.url.trim(), anonKey: c.anonKey.trim() }));
  else localStorage.removeItem(STORAGE_KEY);
}

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (client) return client;
  const c = getConfig();
  if (!c) return null;
  client = createClient(c.url, c.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return client;
}
