import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { Header } from '../components/Header';
import { BackIcon, TrashIcon } from '../components/Icons';
import { addDays, formatHours, localDate, prettyDate } from '../lib/dates';
import { db, type SleepLog } from '../lib/db';
import { deleteRecord, newId, saveRecord } from '../lib/records';
import { go } from '../lib/router';

export const RESTED_LABELS = ['Wrecked', 'Tired', 'OK', 'Good', 'Great'];

const clampHours = (h: number) => Math.min(16, Math.max(0, Math.round(h * 4) / 4));

export function Sleep() {
  const today = localDate();
  const [date, setDate] = useState(today);
  const [hours, setHours] = useState<number | null>(null);
  const [rested, setRested] = useState<number | null>(null);

  const q = useLiveQuery(async () => {
    const rec = await db.sleep.where('date').equals(date).filter((r) => !r.deleted).first();
    return { date, rec };
  }, [date]);
  const recent = useLiveQuery(
    () => db.sleep.orderBy('date').reverse().filter((r) => !r.deleted).limit(14).toArray(),
    [],
  );
  const existing = q?.date === date ? q.rec : undefined;

  // Prefill once per date: from that date's log if there is one, else from the latest log.
  const prefilled = useRef<string | null>(null);
  useEffect(() => {
    if (!q || q.date !== date || recent === undefined || prefilled.current === date) return;
    prefilled.current = date;
    setHours(q.rec?.hours ?? recent[0]?.hours ?? 8);
    setRested(q.rec?.rested ?? null);
  }, [q, date, recent]);

  async function save() {
    if (hours == null || rested == null) return;
    await saveRecord<SleepLog>('sleep', { id: existing?.id ?? newId(), date, hours, rested });
    go('home');
  }

  return (
    <main className="screen">
      <Header title="Sleep" />

      <div className="date-nav">
        <button className="icon-btn" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">
          <BackIcon />
        </button>
        <span>Woke up: {prettyDate(date)}</span>
        <button
          className="icon-btn flip"
          onClick={() => setDate(addDays(date, 1))}
          disabled={date >= today}
          aria-label="Next day"
        >
          <BackIcon />
        </button>
      </div>

      <section className="card">
        <h2>How long did you sleep?</h2>
        <div className="stepper">
          <button onClick={() => setHours(clampHours((hours ?? 8) - 0.25))} aria-label="Less">
            −
          </button>
          <div className="stepper-value">{hours == null ? '–' : formatHours(hours)}</div>
          <button onClick={() => setHours(clampHours((hours ?? 8) + 0.25))} aria-label="More">
            +
          </button>
        </div>
        <div className="chips">
          {[5, 6, 7, 8, 9].map((h) => (
            <button key={h} className={`chip ${hours === h ? 'on' : ''}`} onClick={() => setHours(h)}>
              {h}h
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>How rested do you feel?</h2>
        <div className="rating">
          {RESTED_LABELS.map((label, i) => (
            <button
              key={label}
              className={`rate rate-${i + 1} ${rested === i + 1 ? 'on' : ''}`}
              onClick={() => setRested(i + 1)}
            >
              <span className="rate-num">{i + 1}</span>
              <span className="rate-label">{label}</span>
            </button>
          ))}
        </div>
      </section>

      <button className="primary" disabled={hours == null || rested == null} onClick={save}>
        {existing ? 'Update' : 'Save'}
      </button>

      {recent && recent.length > 0 && (
        <section className="history">
          <h2>Recent</h2>
          <ul>
            {recent.map((r) => (
              <li key={r.id}>
                <button className="row-main" onClick={() => setDate(r.date)}>
                  <span>{prettyDate(r.date)}</span>
                  <span className="muted">
                    {formatHours(r.hours)} · {RESTED_LABELS[r.rested - 1]}
                  </span>
                </button>
                <button className="icon-btn small" onClick={() => deleteRecord('sleep', r.id)} aria-label="Delete">
                  <TrashIcon size={18} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
