import { Header } from '../components/Header';
import { localDate, prettyDate } from '../lib/dates';
import type { Workout } from '../lib/db';
import { deleteRecord } from '../lib/records';
import { go, useParam } from '../lib/router';
import { useSettings } from '../lib/settings';
import { elapsed, hms } from '../lib/workout';
import { saveWorkout, useWorkouts } from '../lib/workoutData';
import { BlockView } from './Session';

const DAY = 86400_000;

/** View and edit a finished workout. */
export function PastWorkout() {
  const id = useParam('id');
  const workouts = useWorkouts();
  const { units } = useSettings();
  if (!workouts) return <main className="screen" />;
  const w = workouts.find((x) => x.id === id);
  if (!w) {
    return (
      <main className="screen">
        <Header title="Workout" back="workout" />
        <p className="muted">This workout was deleted.</p>
      </main>
    );
  }
  // "Last time" lines should look at workouts before this one.
  const before = workouts.filter((x) => x.started_at < w.started_at);

  function update(fn: (d: Workout) => void) {
    const d = structuredClone(w!);
    fn(d);
    void saveWorkout(d);
  }

  function moveTo(date: string) {
    if (!date || date === w!.date) return;
    const shift = new Date(`${date}T00:00`).getTime() - new Date(`${w!.date}T00:00`).getTime();
    const by = (iso: string) => new Date(new Date(iso).getTime() + Math.round(shift / DAY) * DAY).toISOString();
    update((d) => {
      d.date = date;
      d.started_at = by(d.started_at);
      if (d.finished_at) d.finished_at = by(d.finished_at);
    });
  }

  return (
    <main className="screen wide-ish">
      <Header title={w.day_name} back="workout" />
      <section className="card past-head">
        <label className="field">
          <span>Date</span>
          <input type="date" value={w.date} max={localDate()} onChange={(e) => moveTo(e.target.value)} />
        </label>
        <div className="muted small">
          {prettyDate(w.date)} · {w.finished_at ? hms(elapsed(w.started_at, w.finished_at)) : 'in progress'}. Changes save as you type.
        </div>
      </section>

      {w.blocks.map((b, i) => (
        <section key={b.blockId + i} className="card past-block">
          <BlockView block={b} units={units} history={before} workoutId={w.id} date={w.date} update={(fn) => update((d) => fn(d.blocks[i]))} />
          {b.optional && (
            <button className="link-btn small" onClick={() => update((d) => void (d.blocks[i].skipped = !d.blocks[i].skipped))}>
              {b.skipped ? 'Mark as done' : 'Mark as skipped'}
            </button>
          )}
        </section>
      ))}

      <button
        className="danger-btn"
        onClick={async () => {
          if (!confirm('Delete this workout?')) return;
          await deleteRecord('workouts', w.id);
          go('workout');
        }}
      >
        Delete workout
      </button>
    </main>
  );
}
