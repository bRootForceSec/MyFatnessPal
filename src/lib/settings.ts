import { useLiveQuery } from 'dexie-react-hooks';
import { localDate } from './dates';
import { db, SETTINGS_ID, type Profile, type ProfileVersion, type Settings } from './db';
import { saveRecord } from './records';

type Prefs = Pick<Settings, 'units' | 'profile' | 'profile_history'>;
export const DEFAULT_SETTINGS: Prefs = { units: 'imperial' };

const pick = (rec: Settings): Prefs => ({ units: rec.units, profile: rec.profile, profile_history: rec.profile_history });

export function useSettings(): Prefs & { loaded: boolean } {
  const s = useLiveQuery(async () => ({ rec: await db.settings.get(SETTINGS_ID) }), []);
  const rec = s?.rec && !s.rec.deleted ? s.rec : undefined;
  return { ...DEFAULT_SETTINGS, ...(rec ? pick(rec) : {}), loaded: s !== undefined };
}

/** Add a version starting `today`, replacing one already saved today. */
export function withVersion(
  history: ProfileVersion[] | undefined,
  previous: Profile | undefined,
  next: Profile,
  today: string,
): ProfileVersion[] {
  let h = [...(history ?? [])];
  // Answers saved before history existed apply to every earlier day.
  if (h.length === 0 && previous) h.push({ from: '0000-00-00', profile: previous });
  h = h.filter((v) => v.from !== today);
  h.push({ from: today, profile: next });
  return h.sort((a, b) => a.from.localeCompare(b.from));
}

/** The answers in effect on a date (falls back to the current ones). */
export function profileOn(prefs: Pick<Prefs, 'profile' | 'profile_history'>, date: string): Profile | undefined {
  const h = prefs.profile_history ?? [];
  let found: ProfileVersion | undefined;
  for (const v of h) if (v.from <= date) found = v;
  return found?.profile.v === 2 ? found.profile : prefs.profile;
}

export async function updateSettings(patch: Partial<Pick<Prefs, 'units' | 'profile'>>): Promise<void> {
  const cur = await db.settings.get(SETTINGS_ID);
  const base: Prefs = { ...DEFAULT_SETTINGS, ...(cur && !cur.deleted ? pick(cur) : {}) };
  const next: Prefs = { ...base, ...patch };
  if (patch.profile) {
    const prev = base.profile?.v === 2 ? base.profile : undefined;
    next.profile_history = withVersion(base.profile_history, prev, patch.profile, localDate());
  }
  await saveRecord<Settings>('settings', { ...next, id: SETTINGS_ID });
}

export type { Profile };
