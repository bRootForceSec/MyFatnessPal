import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { addDays, prettyDate } from '../../lib/dates';
import { db, type FoodLog } from '../../lib/db';
import { logFood } from '../../lib/foodData';
import { amountText, fmt } from '../../lib/nutrition';

/** Copy all or some of another day's food into `date`. */
export function CopyDay({ date, onClose }: { date: string; onClose: () => void }) {
  const [from, setFrom] = useState<string | null>(null);
  const [off, setOff] = useState<Set<string>>(new Set());
  const days = useLiveQuery(async () => {
    const since = addDays(date, -30);
    const logs = await db.food_logs
      .where('date')
      .between(since, addDays(date, 30), true, true)
      .filter((l) => !l.deleted && l.date !== date)
      .toArray();
    const by = new Map<string, FoodLog[]>();
    for (const l of logs) by.set(l.date, [...(by.get(l.date) ?? []), l]);
    return [...by.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 14)
      .map(([d, ls]) => ({ date: d, logs: ls.sort((a, b) => a.logged_at.localeCompare(b.logged_at)) }));
  }, [date]);

  const picked = days?.find((d) => d.date === from);
  const chosen = picked?.logs.filter((l) => !off.has(l.id)) ?? [];

  async function copy() {
    for (const l of chosen) await logFood(date, l.food, l.qty, l.unit, l.food_id);
    onClose();
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet copy-sheet" onClick={(e) => e.stopPropagation()}>
        {!picked ? (
          <>
            <h2>Copy food from another day</h2>
            {days && days.length === 0 && <p className="muted">No other days logged in the last month.</p>}
            <div className="jump-list">
              {days?.map((d) => (
                <button
                  key={d.date}
                  className="jump"
                  onClick={() => {
                    setFrom(d.date);
                    setOff(new Set());
                  }}
                >
                  <span>{prettyDate(d.date)}</span>
                  <span className="muted">
                    {d.logs.length} item{d.logs.length === 1 ? '' : 's'} · {fmt(d.logs.reduce((a, l) => a + l.total.kcal, 0))} kcal
                  </span>
                </button>
              ))}
            </div>
            <button className="secondary" onClick={onClose}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <h2>From {prettyDate(picked.date)}</h2>
            <p className="muted small">Untick anything you didn't eat again.</p>
            <div className="copy-list">
              {picked.logs.map((l) => (
                <label key={l.id} className="copy-row">
                  <input
                    type="checkbox"
                    checked={!off.has(l.id)}
                    onChange={() =>
                      setOff((s) => {
                        const n = new Set(s);
                        if (n.has(l.id)) n.delete(l.id);
                        else n.add(l.id);
                        return n;
                      })
                    }
                  />
                  <span className="food-main">
                    <span className="food-name">{l.food.name}</span>
                    <span className="muted small">{l.food.source === 'quick' ? 'Quick add' : amountText(l.qty, l.unit)}</span>
                  </span>
                  <span className="muted small">{fmt(l.total.kcal)}</span>
                </label>
              ))}
            </div>
            <button className="primary" disabled={chosen.length === 0} onClick={copy}>
              Add {chosen.length} item{chosen.length === 1 ? '' : 's'} · {fmt(chosen.reduce((a, l) => a + l.total.kcal, 0))} kcal
            </button>
            <button className="secondary" onClick={() => setFrom(null)}>
              Back
            </button>
          </>
        )}
      </div>
    </div>
  );
}
