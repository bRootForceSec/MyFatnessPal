import { useEffect, useState } from 'react';
import { Header } from '../components/Header';
import { TrashIcon } from '../components/Icons';
import { prettyDate } from '../lib/dates';
import type { ProgramDay, Workout } from '../lib/db';
import { deleteRecord, newId, saveRecord } from '../lib/records';
import { go } from '../lib/router';
import { blankProgram, pplTemplate } from '../lib/templates';
import { buildWorkout, elapsed, hms, plannedDay } from '../lib/workout';
import { inProgress, saveProgram, useActiveProgram, useWorkouts } from '../lib/workoutData';

export function WorkoutHub() {
  const program = useActiveProgram();
  const workouts = useWorkouts();
  const [, tick] = useState(0);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  if (program === undefined || workouts === undefined) return <main className="screen" />;

  const active = inProgress(workouts);
  const history = workouts
    .filter((w) => w.finished_at)
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .slice(0, showAll ? undefined : 20);

  async function start(day: ProgramDay) {
    if (!program) return;
    await saveRecord<Workout>('workouts', buildWorkout(program, day, workouts ?? [], newId()));
    go('session');
  }

  if (!program) {
    return (
      <main className="screen">
        <Header title="Workout" />
        <section className="card">
          <h2>Set up your program</h2>
          <p className="muted">
            Start from the push / pull / legs 6-day starter (two hard sets per exercise, with optional
            injury-prevention finishers), or build your own. You can edit either one.
          </p>
          <div className="stack">
            <button className="primary" onClick={() => saveProgram(pplTemplate())}>
              Use push / pull / legs 6x
            </button>
            <button
              className="secondary"
              onClick={async () => {
                await saveProgram(blankProgram());
                go('program');
              }}
            >
              Start from blank
            </button>
          </div>
        </section>
      </main>
    );
  }

  const today = plannedDay(program, workouts);
  const others = program.days.filter((d) => d.id !== today?.id);

  return (
    <main className="screen">
      <Header
        title="Workout"
        right={
          <button className="link-btn" onClick={() => go('program')}>
            Edit
          </button>
        }
      />

      {active ? (
        <button className="big-btn workout start-btn" onClick={() => go('session')}>
          <span className="big-text">
            <span className="big-label">Resume {active.day_name}</span>
            <span className="big-sub">{hms(elapsed(active.started_at, null))} in</span>
          </span>
        </button>
      ) : today ? (
        <button className="big-btn workout start-btn" onClick={() => start(today)}>
          <span className="big-text">
            <span className="big-sub">{program.schedule === 'weekly' ? 'Today' : 'Next up'}</span>
            <span className="big-label">Start {today.name}</span>
            <span className="big-sub">{today.blocks.length} exercises</span>
          </span>
        </button>
      ) : (
        <section className="card">
          <h2>Rest day</h2>
          <p className="muted">Nothing planned today. You can still start any session below.</p>
        </section>
      )}

      {!active && others.length > 0 && (
        <section>
          <h2 className="section-title">{today ? 'Other sessions' : 'Sessions'}</h2>
          <div className="day-grid">
            {others.map((d) => (
              <button key={d.id} className="secondary" onClick={() => start(d)}>
                {d.name}
              </button>
            ))}
          </div>
        </section>
      )}

      <p className="muted small">Program: {program.name}</p>

      {history.length > 0 && (
        <section className="history">
          <h2>History</h2>
          <p className="muted small">Tap a workout to view or edit it.</p>
          <ul>
            {history.map((w) => {
              const sets = w.blocks.reduce(
                (n, b) => n + (b.skipped ? 0 : b.exercises.reduce((m, e) => m + e.sets.filter((s) => s.kind === 'work' && s.reps != null).length, 0)),
                0,
              );
              return (
                <li key={w.id}>
                  <button className="row-main" onClick={() => go('past', { id: w.id })}>
                    <span>
                      {prettyDate(w.date)} · {w.day_name}
                    </span>
                    <span className="muted">
                      {hms(elapsed(w.started_at, w.finished_at))} · {sets} sets
                    </span>
                  </button>
                  <button
                    className="icon-btn small"
                    onClick={() => confirm('Delete this workout?') && deleteRecord('workouts', w.id)}
                    aria-label="Delete"
                  >
                    <TrashIcon size={18} />
                  </button>
                </li>
              );
            })}
          </ul>
          {!showAll && workouts.filter((w) => w.finished_at).length > 20 && (
            <button className="link-btn" onClick={() => setShowAll(true)}>
              Show all
            </button>
          )}
        </section>
      )}
    </main>
  );
}
