import { useEffect, useMemo, useState } from 'react';
import { NumberField } from '../components/NumberField';
import { SevenSeg } from '../components/SevenSeg';
import { prettyDate } from '../lib/dates';
import type { Workout, WorkoutBlock, WorkoutExercise, WorkoutSet } from '../lib/db';
import { deleteRecord } from '../lib/records';
import { go } from '../lib/router';
import { useSettings } from '../lib/settings';
import { displayToKg, kgToDisplay, round, weightUnit, type UnitSystem } from '../lib/units';
import {
  elapsed,
  formatReps,
  formatRest,
  hms,
  isBodyweight,
  lastPerformance,
  nextWeight,
  plannedSets,
  progress,
  type LastPerformance,
} from '../lib/workout';
import { inProgress, saveWorkout, useWorkouts } from '../lib/workoutData';
import { useWeightOn } from '../lib/foodData';

/** Keep the phone screen on during a workout, where supported. */
function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const get = () => {
      navigator.wakeLock
        ?.request('screen')
        .then((l) => (lock = l))
        .catch(() => {});
    };
    get();
    const onVis = () => document.visibilityState === 'visible' && get();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      void lock?.release();
    };
  }, []);
}

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function Session() {
  const workouts = useWorkouts();
  const [finishedId, setFinishedId] = useState<string | null>(null);
  useWakeLock();
  const w = workouts ? inProgress(workouts) : undefined;
  const nothingToShow = workouts !== undefined && !w && !finishedId;
  useEffect(() => {
    if (nothingToShow) go('workout');
  }, [nothingToShow]);

  if (workouts === undefined) return <main className="session" />;

  if (finishedId) {
    const w = workouts.find((x) => x.id === finishedId);
    if (w) return <Summary w={w} />;
  }

  if (!w) return null;
  return <Card w={w} history={workouts} onFinish={() => setFinishedId(w.id)} />;
}

function Card({ w, history, onFinish }: { w: Workout; history: Workout[]; onFinish: () => void }) {
  const { units } = useSettings();
  const now = useNow();
  const [menu, setMenu] = useState(false);
  const idx = Math.min(w.current, w.blocks.length - 1);
  const block = w.blocks[idx];
  const frac = progress(w);
  const isLast = idx === w.blocks.length - 1;

  function update(fn: (draft: Workout) => void) {
    const draft = structuredClone(w);
    fn(draft);
    void saveWorkout(draft);
  }

  const goTo = (i: number) =>
    update((d) => {
      d.current = Math.max(0, Math.min(d.blocks.length - 1, i));
    });

  async function finish() {
    const draft = structuredClone(w);
    draft.finished_at = new Date().toISOString();
    await saveWorkout(draft);
    onFinish();
  }

  const hue = Math.round(frac * 120);

  return (
    <main className="session">
      <div className="progress" aria-label={`${Math.round(frac * 100)}% done`}>
        <div style={{ width: `${Math.max(frac * 100, 2)}%`, background: `hsl(${hue} 80% 48%)` }} />
      </div>

      <div className="session-top">
        <button className="icon-btn" onClick={() => setMenu(true)} aria-label="Workout menu">
          ⋯
        </button>
        <SevenSeg text={hms(elapsed(w.started_at, null, now))} className="stopwatch" />
        <span className="card-count">
          {idx + 1}/{w.blocks.length}
        </span>
      </div>

      <div className="session-body" key={idx}>
        <BlockView block={block} units={units} history={history} workoutId={w.id} date={w.date} update={(fn) => update((d) => fn(d.blocks[idx]))} />
      </div>

      <div className="session-nav">
        <button className="secondary" disabled={idx === 0} onClick={() => goTo(idx - 1)}>
          ← Back
        </button>
        {block.optional && (
          <button
            className="secondary"
            onClick={() =>
              update((d) => {
                d.blocks[idx].skipped = !d.blocks[idx].skipped;
                if (d.blocks[idx].skipped && idx < d.blocks.length - 1) d.current = idx + 1;
              })
            }
          >
            {block.skipped ? 'Unskip' : 'Skip'}
          </button>
        )}
        {isLast ? (
          <button className="primary" onClick={finish}>
            Finish
          </button>
        ) : (
          <button className="primary" onClick={() => goTo(idx + 1)}>
            Next →
          </button>
        )}
      </div>

      {menu && (
        <div className="sheet-backdrop" onClick={() => setMenu(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2>{w.day_name}</h2>
            <div className="jump-list">
              {w.blocks.map((b, i) => (
                <button
                  key={b.blockId}
                  className={`jump ${i === idx ? 'on' : ''}`}
                  onClick={() => {
                    goTo(i);
                    setMenu(false);
                  }}
                >
                  <span>{b.exercises.map((e) => e.name).join(' + ')}</span>
                  <span className="muted">{b.skipped ? 'skipped' : blockDone(b) ? '✓' : ''}</span>
                </button>
              ))}
            </div>
            <button className="primary" onClick={finish}>
              Finish workout now
            </button>
            <button className="secondary" onClick={() => go('workout')}>
              Leave (keeps running)
            </button>
            <button
              className="danger-btn"
              onClick={async () => {
                if (!confirm('Discard this workout? Nothing from it will be saved.')) return;
                await deleteRecord('workouts', w.id);
                go('workout');
              }}
            >
              Discard workout
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

const blockDone = (b: WorkoutBlock) => b.exercises.every((e) => e.sets.every((s) => s.reps != null));

export function BlockView({
  block,
  units,
  history,
  workoutId,
  date,
  update,
}: {
  block: WorkoutBlock;
  units: UnitSystem;
  history: Workout[];
  workoutId: string;
  /** The workout's date, for that day's bodyweight. */
  date: string;
  update: (fn: (b: WorkoutBlock) => void) => void;
}) {
  const superset = block.exercises.length > 1;
  const bodyKg = useWeightOn(date);
  return (
    <div className={block.skipped ? 'skipped' : ''}>
      <div className="block-tags">
        {superset && <span className="tag">Superset</span>}
        {block.optional && <span className="tag tag-opt">Optional finisher</span>}
        <span className="tag tag-rest">
          Rest {formatRest(block.restSec)}
          {superset ? ' after each round' : ''}
        </span>
      </div>

      {block.exercises.map((ex, ei) => (
        <ExerciseView
          key={ex.slotId + ei}
          ex={ex}
          letter={superset ? String.fromCharCode(65 + ei) : null}
          restSec={superset ? null : block.restSec}
          units={units}
          history={history}
          workoutId={workoutId}
          bodyKg={bodyKg ?? null}
          update={(fn) => update((b) => fn(b.exercises[ei]))}
        />
      ))}

      <textarea
        className="block-note"
        placeholder="Notes: changes from the plan, how it felt…"
        defaultValue={block.note ?? ''}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v !== (block.note ?? '')) update((b) => void (b.note = v || undefined));
        }}
      />
    </div>
  );
}

function ExerciseView({
  ex,
  letter,
  restSec,
  units,
  history,
  workoutId,
  bodyKg,
  update,
}: {
  ex: WorkoutExercise;
  letter: string | null;
  restSec: number | null;
  units: UnitSystem;
  history: Workout[];
  workoutId: string;
  bodyKg: number | null;
  update: (fn: (e: WorkoutExercise) => void) => void;
}) {
  const last = useMemo(() => lastPerformance(ex.name, history, workoutId), [ex.name, history, workoutId]);
  const wu = weightUnit(units);
  const imperial = units === 'imperial';
  const next = nextWeight(last, ex.repsMax, imperial, !!ex.bodyweight);
  let workNo = 0;
  let warmNo = 0;

  function swap() {
    const i = ex.options.indexOf(ex.name);
    const next = ex.options[(i + 1) % ex.options.length];
    const lastNext = lastPerformance(next, history, workoutId);
    update((e) => {
      e.name = next;
      // Refill weights from the new exercise's history for sets not yet done.
      const warm = e.sets.filter((s) => s.kind === 'warmup').length;
      const work = e.sets.filter((s) => s.kind === 'work').length;
      e.bodyweight = isBodyweight(next, lastNext);
      const fresh = plannedSets(warm, work, e.rir, lastNext, nextWeight(lastNext, e.repsMax, imperial, e.bodyweight));
      e.sets = e.sets.map((s, i) => (s.reps == null ? { ...s, weight_kg: fresh[i]?.weight_kg ?? null } : s));
    });
  }

  return (
    <section className="exercise">
      <div className="ex-head">
        <h2>
          {letter && <span className="ex-letter">{letter}</span>}
          {ex.name}
        </h2>
        <div className="ex-head-btns">
          <button
            className={`bw-toggle ${ex.bodyweight ? 'on' : ''}`}
            onClick={() => update((e) => void (e.bodyweight = !e.bodyweight))}
            aria-pressed={!!ex.bodyweight}
            title="Count your bodyweight in this exercise"
          >
            BW
          </button>
          {ex.options.length > 1 && (
            <button className="link-btn" onClick={swap}>
              Swap
            </button>
          )}
        </div>
      </div>
      <div className="ex-target">
        {ex.sets.filter((s) => s.kind === 'work').length} × {formatReps(ex.repsMin, ex.repsMax)}
        {ex.rir != null && ` · RIR ${ex.rir}`}
        {ex.notes && <span className="muted"> · {ex.notes}</span>}
      </div>
      <LastLine last={last} units={units} />
      {ex.bodyweight && (
        <div className="ex-bw muted small">
          Bodyweight exercise: {bodyKg != null ? `${kgToDisplay(bodyKg, units)} ${wu}` : 'log your weight under Body'} + any added weight
          (belt, backpack). Use a negative number for assisted.
        </div>
      )}
      {next && (
        <div className="ex-next">
          ↑ You hit {ex.repsMax}+ reps on every set last time. Try {ex.bodyweight ? '+' : ''}
          {kgToDisplay(next.weightKg, units)} {wu}
          {ex.bodyweight ? ' added' : ''} (+{kgToDisplay(next.stepKg, units)}).
        </div>
      )}
      {!next && last && last.sets.some((s) => s.kind === 'work') && (
        <div className="ex-next muted">Goal: beat last time's reps. At {ex.repsMax} on every set, add weight.</div>
      )}

      <div className="set-table">
        <div className="set-row set-head">
          <span>Set</span>
          <span>{ex.bodyweight ? `+${wu}` : wu}</span>
          <span>Reps</span>
          <span>RIR</span>
          <span />
        </div>
        {ex.sets.map((s, si) => {
          const label = s.kind === 'warmup' ? `W${++warmNo}` : String(++workNo);
          const showRest = restSec != null && si < ex.sets.length - 1;
          return (
            <div key={si}>
              <SetRow
                set={s}
                label={label}
                units={units}
                weightPlaceholder={ex.bodyweight ? 'BW' : ''}
                placeholder={s.kind === 'warmup' ? '' : formatReps(ex.repsMin, ex.repsMax)}
                onChange={(patch) => update((e) => Object.assign(e.sets[si], patch))}
                onRemove={() => update((e) => void e.sets.splice(si, 1))}
              />
              {showRest && <div className="rest-row">rest {formatRest(s.kind === 'warmup' ? Math.min(restSec, 90) : restSec)}</div>}
            </div>
          );
        })}
      </div>
      <div className="ex-actions">
        <button
          className="link-btn"
          onClick={() =>
            update((e) => {
              const at = e.sets.filter((s) => s.kind === 'warmup').length;
              const prev = e.sets[at - 1];
              e.sets.splice(at, 0, { kind: 'warmup', weight_kg: prev?.weight_kg ?? null, reps: null, rir: null });
            })
          }
        >
          + Warm-up set
        </button>
        <button
          className="link-btn"
          onClick={() =>
            update((e) => {
              const prev = [...e.sets].reverse().find((s) => s.kind === 'work');
              e.sets.push({ kind: 'work', weight_kg: prev?.weight_kg ?? null, reps: null, rir: e.rir });
            })
          }
        >
          + Working set
        </button>
      </div>
    </section>
  );
}

function LastLine({ last, units }: { last: LastPerformance | null; units: UnitSystem }) {
  if (!last) return <div className="ex-last muted">First time doing this one</div>;
  const work = last.sets.filter((s) => s.kind === 'work');
  return (
    <div className="ex-last muted">
      Last ({prettyDate(last.date)}):{' '}
      {work
        .map((s) => `${s.weight_kg != null ? kgToDisplay(s.weight_kg, units) : '–'} × ${s.reps}${s.rir != null ? ` @${s.rir}` : ''}`)
        .join(', ')}
    </div>
  );
}

function SetRow({
  set,
  label,
  units,
  placeholder,
  weightPlaceholder,
  onChange,
  onRemove,
}: {
  set: WorkoutSet;
  label: string;
  units: UnitSystem;
  placeholder: string;
  weightPlaceholder: string;
  onChange: (patch: Partial<WorkoutSet>) => void;
  onRemove: () => void;
}) {
  const done = set.reps != null;
  return (
    <div className={`set-row ${set.kind} ${done ? 'done' : ''}`}>
      <span className="set-label">{label}</span>
      <NumberField
        label={`Set ${label} weight`}
        placeholder={weightPlaceholder}
        value={set.weight_kg == null ? null : kgToDisplay(set.weight_kg, units)}
        onChange={(v) => onChange({ weight_kg: v == null ? null : round(displayToKg(v, units), 3) })}
      />
      <NumberField
        label={`Set ${label} reps`}
        value={set.reps}
        placeholder={placeholder}
        onChange={(v) => onChange({ reps: v == null ? null : Math.round(v) })}
      />
      {set.kind === 'work' ? (
        <NumberField label={`Set ${label} RIR`} value={set.rir} onChange={(v) => onChange({ rir: v == null ? null : Math.round(v) })} />
      ) : (
        <span />
      )}
      <button className="icon-btn small" onClick={onRemove} aria-label={`Remove set ${label}`}>
        ×
      </button>
    </div>
  );
}

function Summary({ w }: { w: Workout }) {
  const { units } = useSettings();
  let sets = 0;
  let volume = 0;
  for (const b of w.blocks) {
    if (b.skipped) continue;
    for (const e of b.exercises)
      for (const s of e.sets)
        if (s.kind === 'work' && s.reps != null) {
          sets++;
          volume += (s.weight_kg ?? 0) * s.reps;
        }
  }
  return (
    <main className="session summary">
      <h1>{w.day_name} done</h1>
      <SevenSeg text={hms(elapsed(w.started_at, w.finished_at))} className="stopwatch big" />
      <div className="summary-stats">
        <div>
          <strong>{sets}</strong>
          <span>working sets</span>
        </div>
        <div>
          <strong>{Math.round(kgToDisplay(volume, units)).toLocaleString()}</strong>
          <span>{weightUnit(units)} lifted</span>
        </div>
      </div>
      <button className="primary" onClick={() => go('home')}>
        Done
      </button>
    </main>
  );
}
