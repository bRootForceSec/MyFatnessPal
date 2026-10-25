import { useLiveQuery } from 'dexie-react-hooks';
import { db, SETTINGS_ID, type Settings } from './db';
import { saveRecord } from './records';

export const DEFAULT_SETTINGS: Pick<Settings, 'units'> = { units: 'metric' };

export function useSettings(): Pick<Settings, 'units'> {
  const s = useLiveQuery(() => db.settings.get(SETTINGS_ID), []);
  return { ...DEFAULT_SETTINGS, ...(s && !s.deleted ? { units: s.units } : {}) };
}

export async function updateSettings(patch: Partial<Pick<Settings, 'units'>>): Promise<void> {
  const cur = await db.settings.get(SETTINGS_ID);
  await saveRecord<Settings>('settings', {
    ...DEFAULT_SETTINGS,
    ...(cur ? { units: cur.units } : {}),
    ...patch,
    id: SETTINGS_ID,
  });
}
