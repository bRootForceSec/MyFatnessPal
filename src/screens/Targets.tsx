import { useEffect, useState } from 'react';
import { Header } from '../components/Header';
import { NumberField } from '../components/NumberField';
import { localDate } from '../lib/dates';
import type { Activity, BodyLog, Goal, Profile } from '../lib/db';
import { useWeightOn } from '../lib/foodData';
import { ACTIVITY, computeTargets, defaultProfile, fmt, GOALS, KCAL_PER_KG } from '../lib/nutrition';
import { newId, saveRecord } from '../lib/records';
import { go } from '../lib/router';
import { updateSettings, useSettings } from '../lib/settings';
import { CM_PER_IN, displayToKg, KG_PER_LB, kgToDisplay, round, weightUnit } from '../lib/units';
import { useActiveProgram } from '../lib/workoutData';
import { db } from '../lib/db';

export function Targets() {
  const { units, profile, loaded } = useSettings();
  const today = localDate();
  const weightKg = useWeightOn(today);
  const program = useActiveProgram();
  const [p, setP] = useState<Profile | null>(null);
  const [weight, setWeight] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!loaded || weightKg === undefined || program === undefined || p) return;
    const trainingDays =
      program?.schedule === 'weekly' ? new Set(program.days.flatMap((d) => d.weekdays)).size || 6 : 6;
    setP(profile ?? defaultProfile(trainingDays));
    setWeight(weightKg == null ? null : kgToDisplay(weightKg, units));
    if (!profile) setEditing(true);
  }, [loaded, weightKg, program, profile, units, p]);

  if (!p) return <main className="screen" />;

  const imperial = units === 'imperial';
  const wu = weightUnit(units);
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setP({ ...p, [k]: v });
  const wKg = weight == null ? null : displayToKg(weight, units);
  const t = wKg ? computeTargets(p, wKg) : null;

  async function save() {
    if (!p || wKg == null) return;
    if (weightKg == null || Math.abs(weightKg - wKg) > 0.05) {
      // Record the weight you entered as today's weigh-in.
      const existing = await db.body.where('date').equals(today).filter((b) => !b.deleted).first();
      await saveRecord<BodyLog>('body', { ...(existing ?? { id: newId(), date: today }), weight_kg: round(wKg, 3) });
    }
    await updateSettings({ profile: p });
    setEditing(false);
  }

  const totalIn = Math.round(p.height_cm / CM_PER_IN);
  const ft = Math.floor(totalIn / 12);
  const inch = totalIn % 12;
  const proteinPerUnit = imperial ? p.protein_g_per_kg * KG_PER_LB : p.protein_g_per_kg;
  const rateLabel = (r: number) => {
    if (r === 0) return 'Hold weight';
    const perWeek = wKg ? kgToDisplay(Math.abs((r / 100) * wKg), units) : null;
    return `${r > 0 ? '+' : '−'}${Math.abs(r)}%/wk${perWeek != null ? ` (${perWeek} ${wu})` : ''}`;
  };

  return (
    <main className="screen">
      <Header title="Targets" back="meal" />

      {t && !editing && <Working t={t} p={p} units={units} />}

      {!editing ? (
        <button className="secondary" onClick={() => setEditing(true)}>
          Change my answers
        </button>
      ) : (
        <>
          <section className="card form-card">
            <h2>About you</h2>
            <div className="segmented">
              {(['male', 'female'] as const).map((s) => (
                <button key={s} className={p.sex === s ? 'on' : ''} onClick={() => set('sex', s)}>
                  {s === 'male' ? 'Male' : 'Female'}
                </button>
              ))}
            </div>
            <div className="field-row">
              <label className="field">
                <span>Age</span>
                <NumberField label="Age" value={new Date().getFullYear() - p.birth_year} onChange={(v) => v && set('birth_year', new Date().getFullYear() - Math.round(v))} />
              </label>
              {imperial ? (
                <>
                  <label className="field">
                    <span>Height (ft)</span>
                    <NumberField
                      label="Height feet"
                      value={ft}
                      onChange={(v) => v != null && set('height_cm', (Math.round(v) * 12 + inch) * CM_PER_IN)}
                    />
                  </label>
                  <label className="field">
                    <span>(in)</span>
                    <NumberField
                      label="Height inches"
                      value={inch}
                      onChange={(v) => v != null && set('height_cm', (ft * 12 + v) * CM_PER_IN)}
                    />
                  </label>
                </>
              ) : (
                <label className="field">
                  <span>Height (cm)</span>
                  <NumberField label="Height cm" value={round(p.height_cm, 0)} onChange={(v) => v && set('height_cm', v)} />
                </label>
              )}
              <label className="field">
                <span>Weight ({wu})</span>
                <NumberField label="Weight" value={weight} onChange={setWeight} />
              </label>
            </div>
          </section>

          <section className="card form-card">
            <h2>Activity</h2>
            <p className="muted small">Count your training. You lift {p.training_days} days a week.</p>
            <div className="choice-list">
              {(Object.keys(ACTIVITY) as Activity[]).map((a) => (
                <button key={a} className={`choice ${p.activity === a ? 'on' : ''}`} onClick={() => set('activity', a)}>
                  <strong>{ACTIVITY[a].label}</strong>
                  <span>{ACTIVITY[a].desc}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="card form-card">
            <h2>Goal</h2>
            <div className="choice-list">
              {(Object.keys(GOALS) as Goal[]).map((g) => (
                <button
                  key={g}
                  className={`choice ${p.goal === g ? 'on' : ''}`}
                  onClick={() => setP({ ...p, goal: g, rate_pct: GOALS[g].defaultRate })}
                >
                  <strong>{GOALS[g].label}</strong>
                  <span>{GOALS[g].desc}</span>
                </button>
              ))}
            </div>
            {GOALS[p.goal].rates.length > 1 && (
              <>
                <p className="muted small">How fast, as a share of bodyweight per week:</p>
                <div className="chips wrap">
                  {GOALS[p.goal].rates.map((r) => (
                    <button key={r} className={`chip ${p.rate_pct === r ? 'on' : ''}`} onClick={() => set('rate_pct', r)}>
                      {rateLabel(r)}
                    </button>
                  ))}
                </div>
              </>
            )}
          </section>

          <section className="card form-card">
            <h2>Calories</h2>
            <div className="segmented">
              <button className={p.calorie_mode === 'calculated' ? 'on' : ''} onClick={() => set('calorie_mode', 'calculated')}>
                Calculate for me
              </button>
              <button className={p.calorie_mode === 'manual' ? 'on' : ''} onClick={() => set('calorie_mode', 'manual')}>
                My own number
              </button>
            </div>
            {p.calorie_mode === 'manual' && (
              <label className="field">
                <span>Calories per day</span>
                <NumberField label="Calories" value={p.manual_kcal} onChange={(v) => v && set('manual_kcal', Math.round(v))} />
              </label>
            )}
            <label className="toggle">
              <input type="checkbox" checked={p.cycle} onChange={(e) => set('cycle', e.target.checked)} />
              Eat more on training days, less on rest days
            </label>
            {p.cycle && (
              <div className="field-row">
                <label className="field">
                  <span>Training days get</span>
                  <div className="with-unit">
                    <NumberField label="Training day extra %" value={Math.round(p.cycle_pct * 100)} onChange={(v) => v != null && set('cycle_pct', v / 100)} />
                    <span className="unit">% more than rest days</span>
                  </div>
                </label>
                <label className="field">
                  <span>Training days / week</span>
                  <NumberField label="Training days per week" value={p.training_days} onChange={(v) => v != null && set('training_days', Math.min(7, Math.max(0, Math.round(v))))} />
                </label>
              </div>
            )}
          </section>

          <section className="card form-card">
            <h2>Protein and fat</h2>
            <div className="segmented">
              <button className={p.protein_mode === 'per_weight' ? 'on' : ''} onClick={() => set('protein_mode', 'per_weight')}>
                Per {wu} bodyweight
              </button>
              <button className={p.protein_mode === 'fixed' ? 'on' : ''} onClick={() => set('protein_mode', 'fixed')}>
                Fixed grams
              </button>
            </div>
            <div className="field-row">
              {p.protein_mode === 'per_weight' ? (
                <label className="field">
                  <span>Protein (g per {wu})</span>
                  <NumberField
                    label="Protein per bodyweight"
                    value={round(proteinPerUnit, 2)}
                    onChange={(v) => v != null && set('protein_g_per_kg', imperial ? v / KG_PER_LB : v)}
                  />
                </label>
              ) : (
                <label className="field">
                  <span>Protein (g per day)</span>
                  <NumberField label="Protein grams" value={p.protein_fixed_g} onChange={(v) => v != null && set('protein_fixed_g', Math.round(v))} />
                </label>
              )}
              <label className="field">
                <span>Fat (% of calories)</span>
                <NumberField label="Fat percent" value={Math.round(p.fat_pct * 100)} onChange={(v) => v != null && set('fat_pct', v / 100)} />
              </label>
            </div>
            <p className="muted small">
              Common ranges: protein {imperial ? '0.7–1.0 g/lb' : '1.6–2.2 g/kg'}, fat 20–35%. Carbs fill the rest.
            </p>
          </section>

          {t && <Working t={t} p={p} units={units} />}

          <button className="primary" disabled={wKg == null} onClick={save}>
            Save targets
          </button>
          {profile && (
            <button className="link-btn" onClick={() => go('meal')}>
              Cancel
            </button>
          )}
        </>
      )}
    </main>
  );
}

function Working({ t, p, units }: { t: ReturnType<typeof computeTargets>; p: Profile; units: 'metric' | 'imperial' }) {
  const w = t.working;
  const wu = weightUnit(units);
  const proteinLine =
    p.protein_mode === 'fixed'
      ? `${p.protein_fixed_g} g (fixed)`
      : `${round(units === 'imperial' ? p.protein_g_per_kg * KG_PER_LB : p.protein_g_per_kg, 2)} g × ${kgToDisplay(w.weightKg, units)} ${wu} = ${t.day.protein} g`;
  return (
    <section className="card working">
      <h2>Your daily targets</h2>
      <div className="target-grid">
        <div>
          <strong>{fmt(t.day.kcal)}</strong>
          <span>kcal</span>
        </div>
        <div>
          <strong>{t.day.protein}g</strong>
          <span>protein</span>
        </div>
        <div>
          <strong>{t.day.carbs}g</strong>
          <span>carbs</span>
        </div>
        <div>
          <strong>{t.day.fat}g</strong>
          <span>fat</span>
        </div>
      </div>
      {t.train && t.rest && (
        <p className="small">
          Training days: <strong>{fmt(t.train.kcal)} kcal</strong> ({t.train.carbs}g carbs) · Rest days:{' '}
          <strong>{fmt(t.rest.kcal)} kcal</strong> ({t.rest.carbs}g carbs). Same weekly total.
        </p>
      )}
      <details className="how">
        <summary>How this is worked out</summary>
        <ol>
          <li>
            Resting energy (Mifflin-St Jeor): 10 × {round(w.weightKg, 1)} kg + 6.25 × {round(p.height_cm, 0)} cm − 5 × {w.age}{' '}
            {p.sex === 'male' ? '+ 5' : '− 161'} = <strong>{fmt(w.bmr)} kcal</strong>
          </li>
          <li>
            × {w.factor} for “{ACTIVITY[p.activity].label}” = <strong>{fmt(w.tdee)} kcal</strong> maintenance
          </li>
          {p.calorie_mode === 'manual' ? (
            <li>You set your own target: {fmt(p.manual_kcal)} kcal</li>
          ) : (
            <li>
              {GOALS[p.goal].label}, {p.rate_pct}% of bodyweight a week: {p.rate_pct}% × {round(w.weightKg, 1)} kg × {KCAL_PER_KG} kcal/kg ÷ 7 ={' '}
              {w.adjust > 0 ? '+' : ''}
              {fmt(w.adjust)} kcal/day → <strong>{fmt(t.day.kcal)} kcal</strong>
            </li>
          )}
          <li>Protein: {proteinLine}</li>
          <li>
            Fat: {Math.round(p.fat_pct * 100)}% of calories ÷ 9 = {t.day.fat} g. Carbs: what's left ÷ 4 = {t.day.carbs} g
          </li>
        </ol>
        <p className="muted small">
          These formulas are estimates. After a few weeks of logging, compare your weight trend with the goal and adjust.
        </p>
      </details>
      {t.warnings.map((m) => (
        <p key={m} className="warn small">
          {m}
        </p>
      ))}
    </section>
  );
}
