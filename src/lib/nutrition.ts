import type { FoodData, FoodUnit, Goal, Lifestyle, Macros, Profile, Sex } from './db';

/** Multipliers for daily life outside of workouts (workouts are added separately). */
export const LIFESTYLE: Record<Lifestyle, { factor: number; label: string; desc: string }> = {
  not_very: { factor: 1.2, label: 'Not very active', desc: 'Mostly sitting, e.g. desk job, student, driver' },
  light: { factor: 1.375, label: 'Lightly active', desc: 'A good part of the day on your feet, e.g. teacher, retail' },
  active: { factor: 1.55, label: 'Active', desc: 'A good part of the day doing physical work, e.g. server, mail carrier' },
  very: { factor: 1.725, label: 'Very active', desc: 'Heavy physical work most of the day, e.g. construction, carpenter' },
};

export const GOALS: Record<Goal, { label: string; desc: string }> = {
  lose: { label: 'Lose weight', desc: 'Pick how fast' },
  recomp: { label: 'Lose fat and build muscle', desc: 'A small deficit, about ½ lb (0.25 kg) a week, with hard training and high protein' },
  maintain: { label: 'Maintain weight', desc: 'Eat at maintenance' },
  gain: { label: 'Gain weight', desc: 'Pick how fast' },
};

/** Weekly rate choices in kg/week, matching MyFitnessPal (lb options for imperial). */
export function rateChoices(goal: Goal, imperial: boolean): number[] {
  const lb = KG_PER_LB_N;
  if (goal === 'lose') return imperial ? [0.5, 1, 1.5, 2].map((x) => x * lb) : [0.25, 0.5, 0.75, 1];
  if (goal === 'gain') return imperial ? [0.5, 1].map((x) => x * lb) : [0.25, 0.5];
  return [];
}
const KG_PER_LB_N = 0.45359237;
export const RECOMP_RATE_KG = 0.25;

/** Approximate energy in 1 kg of bodyweight change. */
export const KCAL_PER_KG = 7700;
/** Lowest calculated target, as in MyFitnessPal. */
export const KCAL_FLOOR = { male: 1500, female: 1200 } as const;
/** Net energy cost of hard lifting, in kcal per kg of bodyweight per hour (about 5 METs minus resting). */
export const LIFT_KCAL_PER_KG_HOUR = 4;

export function defaultProfile(): Profile {
  return {
    v: 2,
    sex: 'male',
    birth_year: new Date().getFullYear() - 30,
    height_cm: 178,
    lifestyle: 'not_very',
    goal: 'recomp',
    rate_kg: 0.5 * KG_PER_LB_N,
    workout_mode: 'spread',
    workout_kcal: null,
    protein_mode: 'per_weight',
    protein_g_per_kg: 2.0,
    protein_fixed_g: 180,
    fat_pct: 0.25,
    fat_min_g_per_kg: 0.3 / KG_PER_LB_N,
    carb_min_g_per_kg: 0.5 / KG_PER_LB_N,
    calorie_mode: 'calculated',
    manual_kcal: 2400,
  };
}

/** Older saved answers (before v2) are used to prefill, but the questions are asked again. */
export function upgradeProfile(old: Partial<Profile> | undefined): Profile {
  const d = defaultProfile();
  if (!old) return d;
  const keep = <K extends keyof Profile>(k: K) => (old[k] !== undefined ? old[k] : d[k]) as Profile[K];
  return {
    ...d,
    sex: keep('sex'),
    birth_year: keep('birth_year'),
    height_cm: keep('height_cm'),
    protein_mode: keep('protein_mode'),
    protein_g_per_kg: keep('protein_g_per_kg'),
    protein_fixed_g: keep('protein_fixed_g'),
    fat_pct: keep('fat_pct'),
    calorie_mode: keep('calorie_mode'),
    manual_kcal: keep('manual_kcal'),
    ...(old.v === 2 ? old : {}),
  } as Profile;
}

export const isCurrentProfile = (p: Partial<Profile> | undefined): p is Profile => p?.v === 2;

/** Mifflin-St Jeor resting energy, kcal/day. */
export function bmr(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
}

export interface Training {
  /** Workouts per week (from the program, or recent history). */
  sessionsPerWeek: number;
  /** Typical workout length in hours (from logged workouts). */
  hours: number;
}

export interface Targets {
  /** Average daily target. */
  day: Macros;
  /** Set when workout calories go only on training days. */
  train?: Macros;
  rest?: Macros;
  /** Minimum grams of fat and carbs. */
  min: { fat: number; carbs: number };
  working: {
    age: number;
    weightKg: number;
    bmr: number;
    factor: number;
    lifestyleKcal: number;
    adjust: number;
    perWorkout: number;
    workoutEstimated: boolean;
    sessions: number;
    hours: number;
    workoutDaily: number;
    floor: number;
    floored: boolean;
  };
  warnings: string[];
}

function macrosFor(kcal: number, protein: number, p: Profile, min: { fat: number; carbs: number }): Macros {
  const fat = Math.max(min.fat, (kcal * p.fat_pct) / 9);
  const carbs = Math.max(0, (kcal - protein * 4 - fat * 9) / 4);
  return { kcal: Math.round(kcal), protein: Math.round(protein), carbs: Math.round(carbs), fat: Math.round(fat) };
}

export function goalAdjust(p: Profile): number {
  const kgPerWeek =
    p.goal === 'lose' ? -p.rate_kg : p.goal === 'gain' ? p.rate_kg : p.goal === 'recomp' ? -RECOMP_RATE_KG : 0;
  return (kgPerWeek * KCAL_PER_KG) / 7;
}

export function computeTargets(p: Profile, weightKg: number, training: Training, year = new Date().getFullYear()): Targets {
  const age = year - p.birth_year;
  const rest = bmr(p.sex, weightKg, p.height_cm, age);
  const factor = LIFESTYLE[p.lifestyle].factor;
  const lifestyleKcal = rest * factor;
  const adjust = goalAdjust(p);
  const perWorkout = p.workout_kcal ?? LIFT_KCAL_PER_KG_HOUR * weightKg * training.hours;
  const workoutDaily = (perWorkout * training.sessionsPerWeek) / 7;
  const floor = KCAL_FLOOR[p.sex];

  const protein = p.protein_mode === 'fixed' ? p.protein_fixed_g : p.protein_g_per_kg * weightKg;
  const min = { fat: Math.round(p.fat_min_g_per_kg * weightKg), carbs: Math.round(p.carb_min_g_per_kg * weightKg) };

  let base = lifestyleKcal + adjust; // a rest day
  let floored = false;
  if (p.calorie_mode === 'calculated' && base + workoutDaily < floor) {
    floored = true;
    base = floor - workoutDaily;
  }
  const avg = p.calorie_mode === 'manual' ? p.manual_kcal : base + workoutDaily;

  const warnings: string[] = [];
  const t: Targets = {
    day: macrosFor(avg, protein, p, min),
    min,
    working: {
      age,
      weightKg,
      bmr: Math.round(rest),
      factor,
      lifestyleKcal: Math.round(lifestyleKcal),
      adjust: Math.round(adjust),
      perWorkout: Math.round(perWorkout),
      workoutEstimated: p.workout_kcal == null,
      sessions: training.sessionsPerWeek,
      hours: training.hours,
      workoutDaily: Math.round(workoutDaily),
      floor,
      floored,
    },
    warnings,
  };

  if (p.calorie_mode === 'calculated' && p.workout_mode === 'training_days' && training.sessionsPerWeek > 0 && training.sessionsPerWeek < 7) {
    t.train = macrosFor(base + perWorkout, protein, p, min);
    t.rest = macrosFor(Math.max(base, floor), protein, p, min);
  }

  if (floored) warnings.push(`Raised to the ${floor.toLocaleString()} kcal minimum. Consider a slower rate.`);
  for (const m of [t.day, t.rest].filter(Boolean) as Macros[]) {
    if (m.carbs < min.carbs) {
      warnings.push(`Carbs (${m.carbs} g) are below your ${min.carbs} g minimum. Lower protein or fat, or eat a little more.`);
      break;
    }
  }
  return t;
}

/** The target for one day: training/rest if cycling, else the daily average. */
export function targetFor(t: Targets, isTrainingDay: boolean): Macros {
  if (t.train && t.rest) return isTrainingDay ? t.train : t.rest;
  return t.day;
}

/* ---------- Food math ---------- */

export const ZERO: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

export function scale(m: Macros, f: number): Macros {
  return { kcal: m.kcal * f, protein: m.protein * f, carbs: m.carbs * f, fat: m.fat * f };
}

export function add(a: Macros, b: Macros): Macros {
  return { kcal: a.kcal + b.kcal, protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat };
}

/** Macros for `qty` of `unit` of a food. */
export function entryTotal(food: Pick<FoodData, 'basis' | 'macros'>, qty: number, unit: FoodUnit): Macros {
  const amount = qty * unit.amount; // grams or servings
  return scale(food.macros, food.basis === 'g' ? amount / 100 : amount);
}

export const GRAM: FoodUnit = { label: 'g', amount: 1 };
export const OUNCE: FoodUnit = { label: 'oz', amount: 28.3495 };
export const SERVING: FoodUnit = { label: 'serving', amount: 1 };

export function fmt(n: number): string {
  return Math.round(n).toLocaleString();
}

/** "150 g", "2 × 1 cup (245 g)", "1.5 serving". */
export function amountText(qty: number, unit: FoodUnit): string {
  return /^\d/.test(unit.label) ? `${qty} × ${unit.label}` : `${qty} ${unit.label}`;
}
