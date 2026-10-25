import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { defaultProfile } from './nutrition';
import { profileOn, withVersion } from './settings';

describe('target history', () => {
  const a = { ...defaultProfile(), manual_kcal: 1 };
  const b = { ...defaultProfile(), manual_kcal: 2 };
  const c = { ...defaultProfile(), manual_kcal: 3 };

  it('keeps earlier answers for earlier days', () => {
    let h = withVersion(undefined, a, b, '2026-10-10');
    h = withVersion(h, b, c, '2026-10-20');
    const prefs = { profile: c, profile_history: h };
    expect(profileOn(prefs, '2026-01-01')!.manual_kcal).toBe(1);
    expect(profileOn(prefs, '2026-10-10')!.manual_kcal).toBe(2);
    expect(profileOn(prefs, '2026-10-19')!.manual_kcal).toBe(2);
    expect(profileOn(prefs, '2026-10-25')!.manual_kcal).toBe(3);
  });

  it('replaces a version saved the same day', () => {
    let h = withVersion(undefined, undefined, a, '2026-10-10');
    h = withVersion(h, a, b, '2026-10-10');
    expect(h).toHaveLength(1);
    expect(profileOn({ profile: b, profile_history: h }, '2026-10-01')!.manual_kcal).toBe(2); // before setup: current answers
  });
});
