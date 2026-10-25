import { useLiveQuery } from 'dexie-react-hooks';
import { db, SETTINGS_ID, type Profile, type Settings } from './db';
import { saveRecord } from './records';

type Prefs = Pick<Settings, 'units' | 'profile'>;
export const DEFAULT_SETTINGS: Prefs = { units: 'imperial' };

export function useSettings(): Prefs & { loaded: boolean } {
  const s = useLiveQuery(async () => ({ rec: await db.settings.get(SETTINGS_ID) }), []);
  const rec = s?.rec && !s.rec.deleted ? s.rec : undefined;
  return { ...DEFAULT_SETTINGS, ...(rec ? { units: rec.units, profile: rec.profile } : {}), loaded: s !== undefined };
}

export async function updateSettings(patch: Partial<Prefs>): Promise<void> {
  const cur = await db.settings.get(SETTINGS_ID);
  await saveRecord<Settings>('settings', {
    ...DEFAULT_SETTINGS,
    ...(cur && !cur.deleted ? { units: cur.units, profile: cur.profile } : {}),
    ...patch,
    id: SETTINGS_ID,
  });
}

export type { Profile };
