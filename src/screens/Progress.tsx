import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { BarChart, LineChart, SERIES_COLORS, type Series } from '../components/Chart';
import { Header } from '../components/Header';
import { addDays, formatHours, localDate, prettyDate } from '../lib/dates';
import { db, type Goal, type Macros, type Profile } from '../lib/db';
import { isTrainingDay, useTraining } from '../lib/foodData';
import { useActiveProgram } from '../lib/workoutData';
import { computeTargets, fmt, goalRateKg, isCurrentProfile, targetFor } from '../lib/nutrition';
import {
  caloriesByDay,
  calorieCheck,
  CHECK_DAYS,
  dayMs,
  liftChange,
  liftHistory,
  bodyweightLookup,
  personalRecords,
  rangeStart,
  RANGES,
  sleepInRange,
  weekStart,
  weightTrend,
  workoutsPerWeek,
  type Lift,
  type RangeKey,
} from '../lib/progress';
import { go } from '../lib/router';
import { profileOn, updateSettings, useSettings } from '../lib/settings';
import { cmToDisplay, kgToDisplay, lengthUnit, round, weightUnit, type UnitSystem } from '../lib/units';
import { useWorkouts } from '../lib/workoutData';

const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private mode */
    }
  },
};

export function Progress() {
  return (
    <main className="screen wide">
      <Header title="Progress" />
      <ProgressBody />
    </main>
  );
}

/** Which chart sits on top for each goal. */
export function mainChart(goal: Goal | undefined, hasLifts: boolean): 'strength' | 'weight' | 'recomp' {
  if (goal === 'strength') return 'strength';
  if (goal === 'recomp') return 'recomp';
  if (goal) return 'weight';
  return hasLifts ? 'strength' : 'weight';
}

export function ProgressBody() {
  const today = localDate();
  const { units, profile } = useSettings();
  const [range, setRangeState] = useState<RangeKey>(() => (store.get('mfp.range') as RangeKey) || 'month');
  const setRange = (r: RangeKey) => {
    setRangeState(r);
    store.set('mfp.range', r);
  };

  const workouts = useWorkouts();
  const body = useLiveQuery(() => db.body.filter((b) => !b.deleted).toArray(), []);
  const food = useLiveQuery(() => db.food_logs.filter((f) => !f.deleted).toArray(), []);
  const sleep = useLiveQuery(() => db.sleep.filter((s) => !s.deleted).toArray(), []);
  const prefs = useSettings();
  const program = useActiveProgram();
  const training = useTraining();
  const bodyOn = useMemo(() => bodyweightLookup(body ?? []), [body]);
  /** The target in effect on a date: that day's answers, weight, and training or rest day. */
  const targetOn = (date: string): Macros | null => {
    const p = profileOn(prefs, date);
    const kg = bodyOn(date);
    if (!isCurrentProfile(p) || kg == null || !training || !workouts) return null;
    const t = computeTargets(p, kg, training, Number(date.slice(0, 4)));
    return targetFor(t, isTrainingDay(date, program, workouts));
  };

  const lifts = useMemo(() => liftHistory(workouts ?? [], bodyOn), [workouts, bodyOn]);
  const trend = useMemo(() => weightTrend(body ?? []), [body]);
  const daily = useMemo(() => caloriesByDay(food ?? []), [food]);

  if (!workouts || !body || !food || !sleep) return null;

  const dates = [...body, ...workouts, ...sleep].map((r) => r.date).concat([...daily.keys()]);
  const earliest = dates.length ? dates.reduce((a, b) => (b < a ? b : a)) : null;
  const from = rangeStart(range, today, earliest);
  const xDomain: [number, number] = [dayMs(from), dayMs(today)];
  const main = mainChart(profile?.goal, lifts.length > 0);

  const prs = personalRecords(lifts, from);
  const inRange = trend.filter((p) => p.date >= from);
  const done = workouts.filter((w) => w.finished_at && w.date >= from && w.date <= today);
  const loggedDays = [...daily.entries()].filter(([d, v]) => d >= from && d < today && v.kcal > 0);
  const proteinHit = loggedDays.filter(([d, v]) => {
    const t = targetOn(d);
    return t != null && v.protein >= t.protein * 0.95;
  }).length;
  // Average target over the calorie check's window, for comparing with what was eaten.
  const checkTargets = [...daily.keys()]
    .filter((d) => d >= addDays(today, -(CHECK_DAYS - 1)) && d < today)
    .map((d) => targetOn(d)?.kcal)
    .filter((k): k is number => k != null);
  const checkTarget = checkTargets.length ? checkTargets.reduce((a, b) => a + b, 0) / checkTargets.length : targetOn(today)?.kcal;
  const sleeps = sleepInRange(sleep, from, today);
  const wu = weightUnit(units);

  const strength = <StrengthChart lifts={lifts} from={from} xDomain={xDomain} units={units} />;
  const weight = <WeightChart points={inRange} profile={profile} units={units} xDomain={xDomain} />;
  const waist = <WaistChart body={body} from={from} units={units} xDomain={xDomain} />;

  return (
    <div className="progress-body">
      <div className="segmented ranges" role="tablist">
        {RANGES.map((r) => (
          <button key={r.key} className={range === r.key ? 'on' : ''} onClick={() => setRange(r.key)}>
            {r.label}
          </button>
        ))}
      </div>

      <section className="card main-chart">
        {main === 'strength' && (
          <>
            <h2>Strength</h2>
            {strength}
          </>
        )}
        {main === 'weight' && (
          <>
            <h2>Bodyweight</h2>
            {weight}
          </>
        )}
        {main === 'recomp' && (
          <>
            <h2>Bodyweight</h2>
            {weight}
            <h2 className="sub-h">Waist</h2>
            {waist}
          </>
        )}
      </section>

      <div className="tiles">
        <Tile value={String(prs.length)} label={prs.length === 1 ? 'personal record' : 'personal records'} />
        <Tile
          value={inRange.length >= 2 ? signed(kgToDisplay(inRange[inRange.length - 1].trend - inRange[0].trend, units)) + ' ' + wu : '–'}
          label="weight trend"
        />
        <Tile
          value={String(done.length)}
          label={
            training && training.sessionsPerWeek > 0 && range !== 'all'
              ? `workouts (plan ≈ ${Math.round((training.sessionsPerWeek * Math.min(RANGES.find((r) => r.key === range)!.days, 3650)) / 7)})`
              : 'workouts'
          }
        />
        <Tile value={loggedDays.length ? `${proteinHit}/${loggedDays.length}` : '–'} label="days protein hit" />
        <Tile
          value={loggedDays.length ? fmt(loggedDays.reduce((a, [, v]) => a + v.kcal, 0) / loggedDays.length) : '–'}
          label="avg kcal (logged days)"
        />
        <Tile
          value={sleeps.length ? formatHours(Math.round((sleeps.reduce((a, s) => a + s.hours, 0) / sleeps.length) * 4) / 4) : '–'}
          label="avg sleep"
        />
      </div>

      {isCurrentProfile(profile) && checkTarget != null && (
        <CheckCard profile={profile} body={body} daily={daily} targetKcal={checkTarget} units={units} />
      )}

      <div className="chart-grid">
        {main !== 'strength' && lifts.length > 0 && (
          <section className="card">
            <h2>Strength</h2>
            {strength}
          </section>
        )}
        {main === 'strength' && (
          <section className="card">
            <h2>Bodyweight</h2>
            {weight}
          </section>
        )}

        <section className="card">
          <h2>Personal records</h2>
          <PRList prs={prs} units={units} />
        </section>

        <section className="card">
          <h2>Workouts per week</h2>
          <BarChart
            bars={workoutsPerWeek(workouts, from, today).map((r) => ({
              x: dayMs(r.week),
              y: r.count,
              label: `Week of ${prettyDate(r.week)}`,
            }))}
            yFormat={(v) => String(Math.round(v * 10) / 10)}
            refLine={training && training.sessionsPerWeek > 0 ? { y: training.sessionsPerWeek, label: 'plan' } : undefined}
            color={SERIES_COLORS[0]}
          />
        </section>

        <NutritionCharts daily={daily} from={from} today={today} targetOn={targetOn} />

        <section className="card">
          <h2>Sleep</h2>
          <BarChart
            bars={sleeps.map((s) => ({ x: dayMs(s.date), y: s.hours, label: `${prettyDate(s.date)} · rested ${s.rested}/5` }))}
            yFormat={(v) => `${round(v, 1)}h`}
            refLine={{ y: 8, label: '8h' }}
            color={SERIES_COLORS[6]}
            xDomain={xDomain}
          />
        </section>

        {main !== 'recomp' && body.some((b) => b.measurements_cm?.waist != null) && (
          <section className="card">
            <h2>Waist</h2>
            {waist}
          </section>
        )}
      </div>
    </div>
  );
}

const signed = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(round(n, 1));

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div className="tile">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

/* ---------- Strength ---------- */

function StrengthChart({ lifts, from, xDomain, units }: { lifts: Lift[]; from: string; xDomain: [number, number]; units: UnitSystem }) {
  const rows = lifts
    .map((l) => ({ l, ch: liftChange(l, from) }))
    .filter((r) => r.ch != null)
    .sort((a, b) => b.ch!.points.length - a.ch!.points.length || a.l.name.localeCompare(b.l.name)) as {
    l: Lift;
    ch: NonNullable<ReturnType<typeof liftChange>>;
  }[];

  // Colors stick to an exercise while it's selected; a new pick takes the first free color.
  const [picked, setPicked] = useState<Record<string, string> | null>(null);
  const defaults = useMemo(() => {
    const out: Record<string, string> = {};
    rows.slice(0, 5).forEach((r, i) => (out[r.l.key] = SERIES_COLORS[i]));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.map((r) => r.l.key).join('|')]);
  const sel = picked ?? defaults;
  const keys = Object.keys(sel).filter((k) => rows.some((r) => r.l.key === k));

  const toggle = (key: string) => {
    const next = { ...sel };
    if (next[key]) delete next[key];
    else {
      const used = new Set(Object.values(next));
      const free = SERIES_COLORS.find((c) => !used.has(c));
      if (!free) return;
      next[key] = free;
    }
    setPicked(next);
  };

  if (rows.length === 0) {
    return <div className="chart-empty muted small">Finish a workout with weights logged to see strength here.</div>;
  }

  const single = keys.length === 1 ? rows.find((r) => r.l.key === keys[0])! : null;
  const wu = weightUnit(units);
  const series: Series[] = single
    ? [
        {
          id: single.l.key,
          label: `${single.l.name} (est. max)`,
          color: sel[single.l.key],
          points: single.l.points.filter((p) => p.date >= from).map((p) => ({ x: dayMs(p.date), y: kgToDisplay(p.e1rm, units) })),
        },
      ]
    : rows
        .filter((r) => sel[r.l.key])
        .map((r) => ({
          id: r.l.key,
          label: r.l.name,
          color: sel[r.l.key],
          points: r.ch.points.map((p) => ({ x: dayMs(p.date), y: p.pct })),
        }));

  return (
    <>
      <p className="muted small chart-note">
        {single
          ? `Estimated 1-rep max in ${wu}, from your best working set each session.`
          : 'Change in estimated 1-rep max since the start of this range. Tap one exercise to see its numbers.'}
      </p>
      <LineChart
        series={series}
        yFormat={single ? (v) => `${Math.round(v)}` : (v) => `${v > 0 ? '+' : ''}${round(v, 1)}%`}
        yInclude={single ? [] : [0]}
        legend={false}
        xDomain={xDomain}
        empty="Pick an exercise below."
      />
      <div className="lift-chips">
        {rows.map((r) => {
          const on = !!sel[r.l.key];
          return (
            <button key={r.l.key} className={`lift-chip ${on ? 'on' : ''}`} onClick={() => toggle(r.l.key)} aria-pressed={on}>
              <span className="swatch" style={{ background: on ? sel[r.l.key] : 'transparent' }} />
              <span className="lift-name">{r.l.name}</span>
              <span className={r.ch.pct > 0.05 ? 'gain' : 'muted'}>
                {r.ch.points.length > 1 ? `${r.ch.pct > 0 ? '+' : ''}${round(r.ch.pct, 1)}%` : 'new'}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function PRList({ prs, units }: { prs: ReturnType<typeof personalRecords>; units: UnitSystem }) {
  if (prs.length === 0) return <div className="chart-empty muted small">No new records in this range yet. Keep pushing.</div>;
  const wu = weightUnit(units);
  return (
    <ul className="pr-list">
      {prs.slice(0, 8).map((p) => (
        <li key={p.name + p.date}>
          <span>
            <strong>{p.name}</strong>
            <span className="muted small"> · {prettyDate(p.date)}</span>
          </span>
          <span>
            {p.point.addedKg != null
              ? `BW${p.point.addedKg ? (p.point.addedKg > 0 ? ' + ' : ' − ') + Math.abs(kgToDisplay(p.point.addedKg, units)) : ''}`
              : kgToDisplay(p.point.weightKg, units)}{' '}
            {p.point.addedKg != null && !p.point.addedKg ? '' : wu} × {p.point.reps}
            <span className="gain small"> +{round((p.point.e1rm / p.previous - 1) * 100, 1)}%</span>
          </span>
        </li>
      ))}
      {prs.length > 8 && <li className="muted small">and {prs.length - 8} more</li>}
    </ul>
  );
}

/* ---------- Bodyweight ---------- */

function WeightChart({
  points,
  profile,
  units,
  xDomain,
}: {
  points: ReturnType<typeof weightTrend>;
  profile: Profile | undefined;
  units: UnitSystem;
  xDomain: [number, number];
}) {
  const wu = weightUnit(units);
  const series: Series[] = [
    {
      id: 'raw',
      label: 'Weigh-ins',
      color: SERIES_COLORS[0],
      faint: true,
      points: points.map((p) => ({ x: dayMs(p.date), y: kgToDisplay(p.kg, units) })),
    },
    {
      id: 'trend',
      label: 'Trend',
      color: SERIES_COLORS[0],
      dots: false,
      points: points.map((p) => ({ x: dayMs(p.date), y: kgToDisplay(p.trend, units) })),
    },
  ];
  if (profile && points.length >= 2) {
    // Where the goal pace would have taken you from the first trend point in range.
    const first = points[0];
    const weeks = (xDomain[1] - dayMs(first.date)) / (7 * 86400_000);
    series.push({
      id: 'goal',
      label: 'Goal pace',
      color: SERIES_COLORS[2],
      dashed: true,
      dots: false,
      points: [
        { x: dayMs(first.date), y: kgToDisplay(first.trend, units) },
        { x: xDomain[1], y: kgToDisplay(first.trend + goalRateKg(profile) * weeks, units) },
      ],
    });
  }
  return (
    <>
      <p className="muted small chart-note">
        The trend line smooths out day-to-day water swings{points.length < 7 ? '. Weigh in most mornings for a clearer trend' : ''}.
      </p>
      <LineChart series={series} yFormat={(v) => `${round(v, 1)}`}
        minSpan={units === 'metric' ? 2 : 4}
        xDomain={xDomain}
        empty={`Log your weight to see it here (${wu}).`} />
    </>
  );
}

function WaistChart({
  body,
  from,
  units,
  xDomain,
}: {
  body: { date: string; measurements_cm?: { waist?: number } }[];
  from: string;
  units: UnitSystem;
  xDomain: [number, number];
}) {
  const pts = body
    .filter((b) => b.date >= from && b.measurements_cm?.waist != null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((b) => ({ x: dayMs(b.date), y: cmToDisplay(b.measurements_cm!.waist!, units) }));
  return (
    <LineChart
      series={[{ id: 'waist', label: 'Waist', color: SERIES_COLORS[1], points: pts }]}
      yFormat={(v) => `${round(v, 1)}`}
      xDomain={xDomain}
      height={160}
      minSpan={units === 'metric' ? 4 : 2}
      empty={`Add a waist measurement under Body (${lengthUnit(units)}).`}
    />
  );
}

/* ---------- Nutrition ---------- */

function NutritionCharts({
  daily,
  from,
  today,
  targetOn,
}: {
  daily: Map<string, { kcal: number; protein: number }>;
  from: string;
  today: string;
  targetOn: (date: string) => Macros | null;
}) {
  const days: string[] = [];
  for (let d = from; d <= today; d = addDays(d, 1)) days.push(d);
  // Long ranges show weekly averages of logged days.
  const weekly = days.length > 92;
  type Row = { x: number; kcal: number; protein: number; tKcal?: number; tProtein?: number; label: string };
  const rows: Row[] = [];
  const groups = new Map<string, string[]>();
  for (const d of days) {
    const v = daily.get(d);
    if (!v || v.kcal <= 0) continue;
    const key = weekly ? weekStart(d) : d;
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }
  for (const [key, ds] of [...groups.entries()].sort()) {
    const avg = (f: (d: string) => number | undefined) => {
      const vals = ds.map(f).filter((v): v is number => v != null);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : undefined;
    };
    rows.push({
      x: dayMs(key),
      kcal: avg((d) => daily.get(d)!.kcal)!,
      protein: avg((d) => daily.get(d)!.protein)!,
      tKcal: avg((d) => targetOn(d)?.kcal),
      tProtein: avg((d) => targetOn(d)?.protein),
      label: weekly ? `Week of ${prettyDate(key)} (avg of ${ds.length} days)` : prettyDate(key),
    });
  }
  const xDomain: [number, number] = [dayMs(weekly ? weekStart(from) : from), dayMs(weekly ? weekStart(today) : today)];
  return (
    <>
      <section className="card">
        <h2>Calories{weekly ? ' (weekly average)' : ''}</h2>
        <BarChart
          bars={rows.map((r) => ({ x: r.x, y: r.kcal, label: r.label, target: r.tKcal }))}
          yFormat={(v) => fmt(v)}
          color={SERIES_COLORS[3]}
          xDomain={xDomain}
        />
      </section>
      <section className="card">
        <h2>Protein{weekly ? ' (weekly average)' : ''}</h2>
        <BarChart
          bars={rows.map((r) => ({ x: r.x, y: r.protein, label: r.label, target: r.tProtein }))}
          yFormat={(v) => `${Math.round(v)}g`}
          color={SERIES_COLORS[4]}
          xDomain={xDomain}
        />
      </section>
    </>
  );
}

/* ---------- Calorie check ---------- */

function CheckCard({
  profile,
  body,
  daily,
  targetKcal,
  units,
}: {
  profile: Profile;
  body: Parameters<typeof calorieCheck>[1];
  daily: Map<string, { kcal: number; protein: number }>;
  targetKcal: number;
  units: UnitSystem;
}) {
  const today = localDate();
  const [hiddenUntil, setHiddenUntil] = useState(() => store.get('mfp.checkHidden') ?? '');
  const kcalByDay = new Map([...daily.entries()].map(([d, v]) => [d, v.kcal]));
  const c = calorieCheck(profile, body, kcalByDay, targetKcal, today);
  if (hiddenUntil > today) return null;

  const wu = weightUnit(units);
  const rate = (kg: number) => `${signed(kgToDisplay(kg, units))} ${wu}/week`;
  const hide = () => {
    const until = addDays(today, 7);
    store.set('mfp.checkHidden', until);
    setHiddenUntil(until);
  };

  if (c.kind === 'not_enough') {
    return (
      <section className="card check muted small">
        <strong>Calorie check:</strong> after {CHECK_DAYS / 7} weeks of weigh-ins (8+) and food logs (10+ days), this compares your weight
        trend with your goal. So far: {c.weighIns} weigh-ins, {c.loggedDays} days logged.
      </section>
    );
  }
  if (c.kind === 'on_pace') {
    return (
      <section className="card check good">
        <strong>On pace.</strong> Over the last 3 weeks your weight changed {rate(c.actualKg)}, against a goal of {rate(c.goalKg)}.
      </section>
    );
  }
  if (c.kind === 'intake_gap') {
    return (
      <section className="card check">
        <strong>Off pace, but check your intake first.</strong> Weight changed {rate(c.actualKg)} against a goal of {rate(c.goalKg)}, and
        you averaged {fmt(c.avgIntake)} kcal on logged days against a {fmt(c.avgTarget)} kcal target. Try hitting the target for a couple of
        weeks before changing it.
        <div className="row-btns">
          <button className="link-btn" onClick={hide}>
            Hide for a week
          </button>
        </div>
      </section>
    );
  }
  async function apply(kcal: number) {
    const next: Profile =
      profile.calorie_mode === 'manual'
        ? { ...profile, manual_kcal: profile.manual_kcal + kcal }
        : { ...profile, kcal_adjust: (profile.kcal_adjust ?? 0) + kcal };
    await updateSettings({ profile: next });
    hide();
  }
  return (
    <section className="card check warn-card">
      <strong>
        Suggestion: {c.kcal > 0 ? 'eat' : 'cut'} {fmt(Math.abs(c.kcal))} kcal a day {c.kcal > 0 ? 'more' : 'less'}.
      </strong>{' '}
      Over the last 3 weeks your weight changed {rate(c.actualKg)}, against a goal of {rate(c.goalKg)}, while you ate close to your target.
      Your body may burn more or less than the estimate.
      <div className="row-btns">
        <button className="primary small-btn" onClick={() => apply(c.kcal)}>
          Apply ({c.kcal > 0 ? '+' : '−'}
          {fmt(Math.abs(c.kcal))} kcal)
        </button>
        <button className="link-btn" onClick={hide}>
          Not now
        </button>
        <button className="link-btn" onClick={() => go('targets')}>
          See targets
        </button>
      </div>
    </section>
  );
}
