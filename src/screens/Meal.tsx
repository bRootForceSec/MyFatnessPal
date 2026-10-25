import { useState } from 'react';
import { AddFood } from '../components/food/AddFood';
import { AmountSheet } from '../components/food/AmountSheet';
import { Header } from '../components/Header';
import { BackIcon } from '../components/Icons';
import { addDays, localDate, prettyDate } from '../lib/dates';
import type { FoodLog, Macros } from '../lib/db';
import { logFood, useDayTarget, useFoodLogs } from '../lib/foodData';
import { add, amountText, fmt, ZERO } from '../lib/nutrition';
import { deleteRecord } from '../lib/records';
import { go } from '../lib/router';

export function Meal() {
  const today = localDate();
  const [date, setDate] = useState(today);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<FoodLog | null>(null);
  const logs = useFoodLogs(date);
  const target = useDayTarget(date);
  const eaten = (logs ?? []).reduce((acc, l) => add(acc, l.total), ZERO);

  return (
    <main className="screen meal">
      <Header
        title="Food"
        right={
          <button className="link-btn" onClick={() => go('targets')}>
            Targets
          </button>
        }
      />

      <div className="date-nav">
        <button className="icon-btn" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">
          <BackIcon />
        </button>
        <span>
          {prettyDate(date)}
          {target && (target.targets.train ? (target.training ? ' · training day' : ' · rest day') : '')}
        </span>
        <button className="icon-btn flip" onClick={() => setDate(addDays(date, 1))} disabled={date >= today} aria-label="Next day">
          <BackIcon />
        </button>
      </div>

      {target === null ? (
        <button className="card setup-card" onClick={() => go('targets')}>
          <strong>Set your calorie and macro targets</strong>
          <span className="muted">A few quick questions, then you'll see what's left each day.</span>
        </button>
      ) : target ? (
        <Remaining eaten={eaten} goal={target.today} />
      ) : null}

      <section className="entries">
        {logs && logs.length === 0 && <p className="muted center">Nothing logged yet.</p>}
        {logs?.map((l) => (
          <button key={l.id} className="food-row" onClick={() => setEditing(l)}>
            <span className="food-main">
              <span className="food-name">{l.food.name}</span>
              <span className="muted small">
                {[l.food.brand, l.food.source === 'quick' ? null : amountText(l.qty, l.unit)].filter(Boolean).join(' · ')}
              </span>
            </span>
            <span className="food-kcal">
              <strong>{fmt(l.total.kcal)}</strong>
              <span className="muted small">
                P{Math.round(l.total.protein)} C{Math.round(l.total.carbs)} F{Math.round(l.total.fat)}
              </span>
            </span>
          </button>
        ))}
        {logs && logs.length > 0 && (
          <div className="entries-total muted small">
            Total {fmt(eaten.kcal)} kcal · P{Math.round(eaten.protein)} C{Math.round(eaten.carbs)} F{Math.round(eaten.fat)}
          </div>
        )}
      </section>

      <div className="sticky-save">
        <button className="primary add-food-btn" onClick={() => setAdding(true)}>
          + Add food
        </button>
      </div>

      {adding && <AddFood date={date} onClose={() => setAdding(false)} />}
      {editing && (
        <AmountSheet
          food={editing.food}
          initialQty={editing.qty}
          initialUnit={editing.unit}
          actionLabel="Update"
          onClose={() => setEditing(null)}
          onSubmit={async (qty, unit) => {
            await logFood(editing.date, editing.food, qty, unit, editing.food_id, editing.id);
            setEditing(null);
          }}
          onDelete={async () => {
            await deleteRecord('food_logs', editing.id);
            setEditing(null);
          }}
        />
      )}
    </main>
  );
}

/** Big "calories left" number with protein / carbs / fat bars. */
export function Remaining({ eaten, goal, compact }: { eaten: Macros; goal: Macros; compact?: boolean }) {
  const left = goal.kcal - eaten.kcal;
  const pct = Math.min(1, eaten.kcal / Math.max(goal.kcal, 1));
  const bar = (label: string, k: 'protein' | 'carbs' | 'fat') => {
    const g = goal[k];
    const e = eaten[k];
    const rem = Math.round(g - e);
    return (
      <div className={`macro macro-${k}`}>
        <div className="macro-top">
          <span>{label}</span>
          <span className={rem < 0 ? 'over' : ''}>{rem >= 0 ? `${rem}g left` : `${-rem}g over`}</span>
        </div>
        <div className="macro-bar">
          <div style={{ width: `${Math.min(100, (e / Math.max(g, 1)) * 100)}%` }} />
        </div>
        {!compact && (
          <div className="muted small">
            {Math.round(e)} / {g}g
          </div>
        )}
      </div>
    );
  };
  return (
    <section className={`card remaining ${compact ? 'compact' : ''}`}>
      <div className="kcal-left">
        <div>
          <div className={`kcal-num ${left < 0 ? 'over' : ''}`}>{fmt(Math.abs(left))}</div>
          <div className="muted">{left >= 0 ? 'calories left' : 'calories over'}</div>
        </div>
        <div className="kcal-ring" style={{ ['--p' as string]: `${pct * 360}deg` }}>
          <span>
            {fmt(eaten.kcal)}
            <small>/ {fmt(goal.kcal)}</small>
          </span>
        </div>
      </div>
      <div className="macros">
        {bar('Protein', 'protein')}
        {bar('Carbs', 'carbs')}
        {bar('Fat', 'fat')}
      </div>
    </section>
  );
}
