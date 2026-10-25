import { liveQuery } from 'dexie';
import { db, SETTINGS_ID } from './db';
import { cacheUsdaKey, localUsdaKey } from './foodApi';
import { updateSettings } from './settings';

/** Save the key for all your devices. */
export async function saveUsdaKey(k: string): Promise<void> {
  cacheUsdaKey(k);
  await updateSettings({ usda_key: k.trim() });
}

/**
 * Keep this device's copy of the USDA key in step with the synced settings.
 * A key saved on this device before keys synced is uploaded once.
 */
export function startUsdaKeySync(): void {
  liveQuery(() => db.settings.get(SETTINGS_ID)).subscribe((rec) => {
    if (!rec || rec.deleted) return;
    if (rec.usda_key !== undefined) cacheUsdaKey(rec.usda_key);
    else if (localUsdaKey()) void updateSettings({ usda_key: localUsdaKey() });
  });
}
