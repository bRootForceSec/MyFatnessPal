import { useEffect, useState } from 'react';
import { Header } from '../components/Header';
import { NumberField } from '../components/NumberField';
import { localDate } from '../lib/dates';
import { db, type BodyLog, type Goal, type Lifestyle, type Profile } from '../lib/db';
import { useTraining, useWeightOn } from '../lib/foodData';
import {
  computeTargets,
  fmt,
  GOALS,
  isCurrentProfile,
  KCAL_PER_KG,
  LIFESTYLE,
  LIFT_KCAL_PER_KG_HOUR,
  RECOMP_RATE_KG,
  rateChoices,
  upgradeProfile,
  type Targets as TargetsT,
  type Training,
} from '../lib/nutrition';
import { newId, saveRecord } from '../lib/records';
import { go } from '../lib/router';
import { updateSettings, useSettings } from '../lib/settings';
import { CM_PER_IN, displayToKg, KG_PER_LB, kgToDisplay, round, weightUnit, type UnitSystem } from '../lib/units';

/** g/kg <-> g per display unit of bodyweight. */
const perUnit = (gPerKg: number, imperial: boolean) => (imperial ? gPerKg * KG_PER_LB : gPerKg);
const fromPerUnit = (v: number, imperial: boolean) => (imperial ? v / KG_PER_LB : v);

export function Targets() {
  const { units, profile, loaded } = useSettings();
  const today = localDate();
  const weightKg = useWeightOn(today);
  const training = useTraining();
  const [p, setP] = useState<Profile | null>(null);
  const [weight, setWeight] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!loaded || weightKg === undefined || p) return;
    setP(upgradeProfile(profile));
    setWeight(weightKg == null ? null : kgToDisplay(weightKg, units));
    if (!isCurrentProfile(profile)) setEditing(true);
  }, [loaded, weightKg, profile, units, p]);

  if (!p || !training) return <main className="screen" />;

  const imperial = units === 'imperial';
  const wu = weightUnit(units);
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setP({ ...p, [k]: v });
  const wKg = weight == null ? null : displayToKg(weight, units);
  const t = wKg ? computeTargets(p, wKg, training) : null;

  async function save() {
    if (!p || wKg == null) return;
    if (weightKg == null || Math.abs(weightKg - wKg) > 0.05) {
      // Record the weight entered here as today's weigh-in.
      const existing = await db.body.where('date').equals(today).filter((b) => !b.deleted).first();
      await saveRecord<BodyLog>('body', { ...(existing ?? { id: newId(), date: today }), weight_kg: round(wKg, 3) });
    }
    await updateSettings({ profile: p });
    setEditing(false);
  }

  const totalIn = Math.round(p.height_cm / CM_PER_IN);
  const ft = Math.floor(totalIn / 12);
  const inch = totalIn % 12;
  const rateLabel = (kg: number) => (imperial ? `${round(kg / KG_PER_LB, 1)} lb` : `${round(kg, 2)} kg`) + ' a week';
  const sameRate = (a: number, b: number) => Math.abs(a - b) < 0.01;

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
                    <NumberField label="Height feet" value={ft} onChange={(v) => v != null && set('height_cm', (Math.round(v) * 12 + inch) * CM_PER_IN)} />
                  </label>
                  <label className="field">
                    <span>(in)</span>
                    <NumberField label="Height inches" value={inch} onChange={(v) => v != null && set('height_cm', (ft * 12 + v) * CM_PER_IN)} />
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
            <h2>Outside of workouts, how active is your lifestyle?</h2>
            <div className="choice-list">
              {(Object.keys(LIFESTYLE) as Lifestyle[]).map((a) => (
                <button key={a} className={`choice ${p.lifestyle === a ? 'on' : ''}`} onClick={() => set('lifestyle', a)}>
                  <strong>{LIFESTYLE[a].label}</strong>
                  <span>{LIFESTYLE[a].desc}</span>
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
                  onClick={() => {
                    const rates = rateChoices(g, imperial);
                    setP({ ...p, goal: g, rate_kg: rates.length ? rates[Math.min(1, rates.length - 1)] : p.rate_kg });
                  }}
                >
                  <strong>{GOALS[g].label}</strong>
                  <span>{GOALS[g].desc}</span>
                </button>
              ))}
            </div>
            {rateChoices(p.goal, imperial).length > 0 && (
              <div className="chips wrap">
                {rateChoices(p.goal, imperial).map((r) => (
                  <button key={r} className={`chip ${sameRate(p.rate_kg, r) ? 'on' : ''}`} onClick={() => set('rate_kg', r)}>
                    {p.goal === 'lose' ? 'Lose' : 'Gain'} {rateLabel(r)}
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="card form-card">
            <h2>Workouts</h2>
            <p className="muted small">{trainingText(training)}</p>
            <div className="segmented">
              <button className={p.workout_mode === 'spread' ? 'on' : ''} onClick={() => set('workout_mode', 'spread')}>
                Same target every day
              </button>
              <button className={p.workout_mode === 'training_days' ? 'on' : ''} onClick={() => set('workout_mode', 'training_days')}>
                Eat more on training days
              </button>
            </div>
            <label className="field">
              <span>Calories burned per workout (leave blank to estimate)</span>
              <NumberField label="Calories per workout" value={p.workout_kcal} placeholder={t ? String(t.working.perWorkout) : ''} onChange={(v) => set('workout_kcal', v == null ? null : Math.round(v))} />
            </label>
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
          </section>

          <section className="card form-card">
            <h2>Macros</h2>
            <div className="segmented">
              <button className={p.protein_mode === 'per_weight' ? 'on' : ''} onClick={() => set('protein_mode', 'per_weight')}>
                Protein per {wu}
              </button>
              <button className={p.protein_mode === 'fixed' ? 'on' : ''} onClick={() => set('protein_mode', 'fixed')}>
                Fixed grams
              </button>
            </div>
            <div className="field-row">
              {p.protein_mode === 'per_weight' ? (
                <label className="field">
                  <span>Protein (g per {wu})</span>
                  <NumberField label="Protein per bodyweight" value={round(perUnit(p.protein_g_per_kg, imperial), 2)} onChange={(v) => v != null && set('protein_g_per_kg', fromPerUnit(v, imperial))} />
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
            <div className="field-row">
              <label className="field">
                <span>Fat minimum (g per {wu})</span>
                <NumberField label="Fat minimum" value={round(perUnit(p.fat_min_g_per_kg, imperial), 2)} onChange={(v) => v != null && set('fat_min_g_per_kg', fromPerUnit(v, imperial))} />
              </label>
              <label className="field">
                <span>Carb minimum (g per {wu})</span>
                <NumberField label="Carb minimum" value={round(perUnit(p.carb_min_g_per_kg, imperial), 2)} onChange={(v) => v != null && set('carb_min_g_per_kg', fromPerUnit(v, imperial))} />
              </label>
            </div>
            <p className="muted small">
              Protein and calories matter most. Fat has a floor for hormone health (about {imperial ? '0.3 g/lb' : '0.66 g/kg'}), and
              carbs fuel hard training (the {imperial ? '0.5 g/lb' : '1.1 g/kg'} default floor is deliberately low). Carbs fill whatever
              is left after protein and fat. Typical protein for lifting: {imperial ? '0.7–1.0 g/lb' : '1.6–2.2 g/kg'}.
            </p>
          </section>

          {t && <Working t={t} p={p} units={units} />}

          <button className="primary" disabled={wKg == null} onClick={save}>
            Save targets
          </button>
          {isCurrentProfile(profile) && (
            <button className="link-btn" onClick={() => go('meal')}>
              Cancel
            </button>
          )}
        </>
      )}
    </main>
  );
}

function trainingText(t: Training): string {
  if (t.sessionsPerWeek === 0) return 'No workout program yet. Workout calories start counting once you set one up.';
  const mins = Math.round(t.hours * 60);
  return `From your program: ${t.sessionsPerWeek} workouts a week, about ${mins} minutes each (updates as you log workouts).`;
}

function Working({ t, p, units }: { t: TargetsT; p: Profile; units: UnitSystem }) {
  const w = t.working;
  const imperial = units === 'imperial';
  const wu = weightUnit(units);
  const wDisp = kgToDisplay(w.weightKg, units);
  const kgWeek = p.goal === 'lose' ? -p.rate_kg : p.goal === 'gain' ? p.rate_kg : p.goal === 'recomp' ? -RECOMP_RATE_KG : 0;
  const box = (m: TargetsT['day']) => (
    <div className="target-grid">
      <div>
        <strong>{fmt(m.kcal)}</strong>
        <span>kcal</span>
      </div>
      <div>
        <strong>{m.protein}g</strong>
        <span>protein</span>
      </div>
      <div>
        <strong>{m.carbs}g</strong>
        <span>carbs</span>
      </div>
      <div>
        <strong>{m.fat}g</strong>
        <span>fat</span>
      </div>
    </div>
  );
  return (
    <section className="card working">
      <h2>{t.train ? 'Average day' : 'Your daily targets'}</h2>
      {box(t.day)}
      {t.train && t.rest && (
        <p className="small">
          Training days: <strong>{fmt(t.train.kcal)} kcal</strong> ({t.train.carbs}g carbs) · Rest days:{' '}
          <strong>{fmt(t.rest.kcal)} kcal</strong> ({t.rest.carbs}g carbs)
        </p>
      )}
      <p className="muted small">
        Minimums: fat {t.min.fat}g, carbs {t.min.carbs}g
      </p>
      <details className="how">
        <summary>How this is worked out</summary>
        <ol>
          <li>
            Resting energy (Mifflin-St Jeor): 10 × {round(w.weightKg, 1)} kg + 6.25 × {round(p.height_cm, 0)} cm − 5 × {w.age}{' '}
            {p.sex === 'male' ? '+ 5' : '− 161'} = <strong>{fmt(w.bmr)} kcal</strong>
          </li>
          <li>
            × {w.factor} for a “{LIFESTYLE[p.lifestyle].label.toLowerCase()}” lifestyle = <strong>{fmt(w.lifestyleKcal)} kcal</strong>{' '}
            before workouts
          </li>
          <li>
            Workouts: {w.workoutEstimated ? `${LIFT_KCAL_PER_KG_HOUR} kcal × ${round(w.weightKg, 1)} kg × ${round(w.hours, 2)} h = ` : ''}
            {fmt(w.perWorkout)} kcal each × {w.sessions} a week ÷ 7 = <strong>+{fmt(w.workoutDaily)} kcal/day</strong>
            {p.workout_mode === 'training_days' && t.train ? ' on average (all of it on training days)' : ''}
          </li>
          {p.calorie_mode === 'manual' ? (
            <li>You set your own target: {fmt(p.manual_kcal)} kcal</li>
          ) : (
            <li>
              {GOALS[p.goal].label}
              {kgWeek !== 0 && (
                <>
                  : {imperial ? `${round(kgWeek / KG_PER_LB, 2)} lb` : `${round(kgWeek, 2)} kg`} a week × {imperial ? '3,500 kcal/lb' : `${KCAL_PER_KG} kcal/kg`} ÷ 7 ={' '}
                  {w.adjust > 0 ? '+' : ''}
                  {fmt(w.adjust)} kcal/day
                </>
              )}{' '}
              → <strong>{fmt(t.day.kcal)} kcal</strong>
              {w.floored ? ` (raised to the ${fmt(w.floor)} kcal minimum)` : ''}
            </li>
          )}
          <li>
            Protein:{' '}
            {p.protein_mode === 'fixed'
              ? `${p.protein_fixed_g} g (fixed)`
              : `${round(perUnit(p.protein_g_per_kg, imperial), 2)} g × ${wDisp} ${wu} = ${t.day.protein} g`}
          </li>
          <li>
            Fat: {Math.round(p.fat_pct * 100)}% of calories ÷ 9 (at least {t.min.fat} g) = {t.day.fat} g. Carbs: what's left ÷ 4 ={' '}
            {t.day.carbs} g
          </li>
        </ol>
        <p className="muted small">
          These are estimates. After 2–3 weeks of logging, compare your weight trend with your goal and adjust.
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
