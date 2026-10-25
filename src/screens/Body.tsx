import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { Header } from '../components/Header';
import { BackIcon, TrashIcon } from '../components/Icons';
import { addDays, localDate, prettyDate } from '../lib/dates';
import { db, MEASUREMENTS, type BodyLog, type MeasurementKey } from '../lib/db';
import { deleteRecord, newId, saveRecord } from '../lib/records';
import { go } from '../lib/router';
import { useSettings } from '../lib/settings';
import {
  cmToDisplay,
  displayToCm,
  displayToKg,
  kgToDisplay,
  lengthUnit,
  parseNumber,
  round,
  weightUnit,
} from '../lib/units';

type Form = { weight: string; bodyFat: string } & Record<MeasurementKey, string>;
const EMPTY: Form = { weight: '', bodyFat: '', waist: '', chest: '', hips: '', neck: '', arm: '', thigh: '' };

export function Body() {
  const today = localDate();
  const { units } = useSettings();
  const [date, setDate] = useState(today);
  const [form, setForm] = useState<Form>(EMPTY);
  const [showMore, setShowMore] = useState(false);

  const q = useLiveQuery(async () => {
    const rec = await db.body.where('date').equals(date).filter((r) => !r.deleted).first();
    return { date, rec };
  }, [date]);
  const recent = useLiveQuery(
    () => db.body.orderBy('date').reverse().filter((r) => !r.deleted).limit(30).toArray(),
    [],
  );
  const existing = q?.date === date ? q.rec : undefined;

  const prefilled = useRef<string | null>(null);
  useEffect(() => {
    if (!q || q.date !== date || prefilled.current === date + units) return;
    prefilled.current = date + units;
    const r = q.rec;
    const f: Form = { ...EMPTY };
    if (r?.weight_kg != null) f.weight = String(kgToDisplay(r.weight_kg, units));
    if (r?.body_fat_pct != null) f.bodyFat = String(r.body_fat_pct);
    for (const m of MEASUREMENTS) {
      const v = r?.measurements_cm?.[m.key];
      if (v != null) f[m.key] = String(cmToDisplay(v, units));
    }
    setForm(f);
    if (r?.measurements_cm && Object.keys(r.measurements_cm).length > 0) setShowMore(true);
  }, [q, date, units]);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const weight = parseNumber(form.weight);
  const canSave = weight != null || parseNumber(form.bodyFat) != null || MEASUREMENTS.some((m) => parseNumber(form[m.key]) != null);

  async function save() {
    const measurements_cm: BodyLog['measurements_cm'] = {};
    for (const m of MEASUREMENTS) {
      const v = parseNumber(form[m.key]);
      if (v != null) measurements_cm[m.key] = round(displayToCm(v, units), 2);
    }
    const bf = parseNumber(form.bodyFat);
    await saveRecord<BodyLog>('body', {
      id: existing?.id ?? newId(),
      date,
      weight_kg: weight != null ? round(displayToKg(weight, units), 3) : undefined,
      body_fat_pct: bf ?? undefined,
      measurements_cm,
    });
    go('home');
  }

  const wu = weightUnit(units);
  const lu = lengthUnit(units);
  const weights = (recent ?? []).filter((r) => r.weight_kg != null);

  return (
    <main className="screen">
      <Header title="Body" />

      <div className="date-nav">
        <button className="icon-btn" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">
          <BackIcon />
        </button>
        <span>{prettyDate(date)}</span>
        <button className="icon-btn flip" onClick={() => setDate(addDays(date, 1))} disabled={date >= today} aria-label="Next day">
          <BackIcon />
        </button>
      </div>

      <section className="card">
        <label className="big-input">
          <span>Weight</span>
          <div>
            <input inputMode="decimal" placeholder="0.0" value={form.weight} onChange={set('weight')} />
            <span className="unit">{wu}</span>
          </div>
        </label>
      </section>

      {!showMore ? (
        <button className="link-btn" onClick={() => setShowMore(true)}>
          + Body fat and measurements
        </button>
      ) : (
        <section className="card grid-inputs">
          <label>
            <span>Body fat</span>
            <div>
              <input inputMode="decimal" value={form.bodyFat} onChange={set('bodyFat')} />
              <span className="unit">%</span>
            </div>
          </label>
          {MEASUREMENTS.map((m) => (
            <label key={m.key}>
              <span>{m.label}</span>
              <div>
                <input inputMode="decimal" value={form[m.key]} onChange={set(m.key)} />
                <span className="unit">{lu}</span>
              </div>
            </label>
          ))}
        </section>
      )}

      <button className="primary" disabled={!canSave} onClick={save}>
        {existing ? 'Update' : 'Save'}
      </button>

      {weights.length > 0 && (
        <section className="history">
          <h2>Recent weigh-ins</h2>
          <ul>
            {weights.map((r, i) => {
              const prev = weights[i + 1];
              const diff = prev ? kgToDisplay(r.weight_kg!, units) - kgToDisplay(prev.weight_kg!, units) : null;
              return (
                <li key={r.id}>
                  <button className="row-main" onClick={() => setDate(r.date)}>
                    <span>{prettyDate(r.date)}</span>
                    <span className="muted">
                      {kgToDisplay(r.weight_kg!, units)} {wu}
                      {diff != null && diff !== 0 && (
                        <span className={diff > 0 ? 'up' : 'down'}>
                          {' '}
                          {diff > 0 ? '+' : ''}
                          {round(diff, 1)}
                        </span>
                      )}
                    </span>
                  </button>
                  <button className="icon-btn small" onClick={() => deleteRecord('body', r.id)} aria-label="Delete">
                    <TrashIcon size={18} />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
