import { useLiveQuery } from 'dexie-react-hooks';
import { BodyIcon, ChartIcon, MealIcon, SettingsIcon, SleepIcon, WorkoutIcon } from '../components/Icons';
import { useSyncExternalStore } from 'react';
import { bodyweightLookup, liftHistory, personalRecords } from '../lib/progress';
import { ProgressBody } from './Progress';
import { SyncBadge } from '../components/SyncBadge';
import { db } from '../lib/db';
import { addDays, formatHours, localDate } from '../lib/dates';
import { go } from '../lib/router';
import { useSettings } from '../lib/settings';
import { kgToDisplay, weightUnit } from '../lib/units';
import { plannedDay } from '../lib/workout';
import { useDayTarget, useFoodLogs } from '../lib/foodData';
import { add, fmt, ZERO } from '../lib/nutrition';
import { inProgress, useActiveProgram, useWorkouts } from '../lib/workoutData';

export function Home() {
  const today = localDate();
  const { units } = useSettings();
  const sleep = useLiveQuery(
    () =>
      db.sleep
        .where('date')
        .equals(today)
        .filter((r) => !r.deleted)
        .first(),
    [today],
  );
  const lastWeight = useLiveQuery(async () => {
    const all = await db.body
      .orderBy('date')
      .reverse()
      .filter((r) => !r.deleted && r.weight_kg != null)
      .first();
    return all;
  }, []);

  const program = useActiveProgram();
  const workouts = useWorkouts();
  let workoutSub = '';
  if (program && workouts) {
    const active = inProgress(workouts);
    const planned = plannedDay(program, workouts);
    const doneToday = workouts.some((w) => w.date === today && w.finished_at);
    workoutSub = active ? `Resume ${active.day_name}` : doneToday ? 'Done today ✓' : planned ? `Today: ${planned.name}` : 'Rest day';
  } else if (program === null) {
    workoutSub = 'Set up your program';
  }

  const target = useDayTarget(today);
  const logs = useFoodLogs(today);
  const eaten = (logs ?? []).reduce((acc, l) => add(acc, l.total), ZERO);
  let mealSub = '';
  if (target) {
    const kcal = target.today.kcal - eaten.kcal;
    const protein = Math.round(target.today.protein - eaten.protein);
    mealSub = `${fmt(Math.abs(kcal))} kcal ${kcal >= 0 ? 'left' : 'over'} · ${protein > 0 ? `${protein}g protein to go` : 'protein hit ✓'}`;
  } else if (target === null) {
    mealSub = logs?.length ? `${fmt(eaten.kcal)} kcal today` : 'Set your targets';
  }

  const wide = useWide();
  const bodyLogs = useLiveQuery(() => db.body.filter((b) => !b.deleted).toArray(), []);
  const weekPrs = workouts && bodyLogs ? personalRecords(liftHistory(workouts, bodyweightLookup(bodyLogs)), addDays(today, -6)).length : 0;

  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <main className={`screen home ${wide ? 'desk' : ''}`}>
      <div className="home-col">
        <header className="home-top">
          <div>
            <div className="eyebrow">{dateLabel}</div>
            <h1 className="brand">MyFatnessPal</h1>
          </div>
          <button className="icon-btn" onClick={() => go('settings')} aria-label="Settings">
            <SettingsIcon size={26} />
          </button>
        </header>

        <nav className="big-buttons">
          <button className="big-btn meal" onClick={() => go('meal')}>
            <MealIcon size={44} />
            <span className="big-text">
              <span className="big-label">Meal</span>
              {mealSub && <span className="big-sub">{mealSub}</span>}
            </span>
          </button>
          <button className="big-btn workout" onClick={() => go('workout')}>
            <WorkoutIcon size={44} />
            <span className="big-text">
              <span className="big-label">Workout</span>
              {workoutSub && <span className="big-sub">{workoutSub}</span>}
            </span>
          </button>
          <button className="big-btn sleep" onClick={() => go('sleep')}>
            <SleepIcon size={44} />
            <span className="big-text">
              <span className="big-label">Sleep</span>
              <span className="big-sub">{sleep ? `${formatHours(sleep.hours)} · ${sleep.rested}/5 rested` : 'Log last night'}</span>
            </span>
          </button>
        </nav>

        <button className="wide-btn" onClick={() => go('body')}>
          <BodyIcon size={24} />
          <span>Body</span>
          <span className="wide-sub">
            {lastWeight?.weight_kg != null ? `${kgToDisplay(lastWeight.weight_kg, units)} ${weightUnit(units)}` : 'Log weight'}
          </span>
        </button>

        {!wide && (
          <button className="wide-btn progress-btn" onClick={() => go('progress')}>
            <ChartIcon size={24} />
            <span>Progress</span>
            <span className="wide-sub">{weekPrs ? `${weekPrs} PR${weekPrs === 1 ? '' : 's'} this week` : 'Trends and records'}</span>
          </button>
        )}

        <footer className="home-foot">
          <SyncBadge />
        </footer>
      </div>
      {wide && (
        <div className="home-dash">
          <h2 className="dash-title">Progress</h2>
          <ProgressBody />
        </div>
      )}
    </main>
  );
}

const WIDE = '(min-width: 1000px)';
/** True on a computer-sized screen. */
export function useWide(): boolean {
  return useSyncExternalStore(
    (l) => {
      const m = matchMedia(WIDE);
      m.addEventListener('change', l);
      return () => m.removeEventListener('change', l);
    },
    () => matchMedia(WIDE).matches,
  );
}
