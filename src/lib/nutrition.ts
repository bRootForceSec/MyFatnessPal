import type { Activity, FoodData, FoodUnit, Goal, Macros, Profile, Sex } from './db';

/** Standard activity multipliers used with the Mifflin-St Jeor equation. */
export const ACTIVITY: Record<Activity, { factor: number; label: string; desc: string }> = {
  sedentary: { factor: 1.2, label: 'Sedentary', desc: 'Desk job, little or no exercise' },
  light: { factor: 1.375, label: 'Lightly active', desc: 'Exercise 1–3 days a week' },
  moderate: { factor: 1.55, label: 'Moderately active', desc: 'Exercise 3–5 days a week' },
  very: { factor: 1.725, label: 'Very active', desc: 'Hard exercise 6–7 days a week' },
  extra: { factor: 1.9, label: 'Extremely active', desc: 'Hard training plus a physical job' },
};

/** Weekly rate choices per goal, in % of bodyweight per week. */
export const GOALS: Record<Goal, { label: string; desc: string; rates: number[]; defaultRate: number }> = {
  lose: { label: 'Lose fat', desc: 'A steady deficit', rates: [-0.25, -0.5, -0.75, -1], defaultRate: -0.5 },
  recomp: {
    label: 'Lose fat and build muscle',
    desc: 'A small deficit with hard training and high protein',
    rates: [-0.25, 0],
    defaultRate: -0.25,
  },
  maintain: { label: 'Maintain', desc: 'Eat at maintenance', rates: [0], defaultRate: 0 },
  gain: { label: 'Build muscle', desc: 'A small surplus', rates: [0.1, 0.25, 0.5], defaultRate: 0.25 },
};

/** Approximate energy in 1 kg of bodyweight change. */
export const KCAL_PER_KG = 7700;

export function defaultProfile(trainingDays = 6): Profile {
  return {
    sex: 'male',
    birth_year: new Date().getFullYear() - 30,
    height_cm: 178,
    activity: trainingDays >= 6 ? 'very' : trainingDays >= 3 ? 'moderate' : 'light',
    goal: 'recomp',
    rate_pct: GOALS.recomp.defaultRate,
    protein_mode: 'per_weight',
    protein_g_per_kg: 2.0,
    protein_fixed_g: 180,
    fat_pct: 0.25,
    calorie_mode: 'calculated',
    manual_kcal: 2400,
    cycle: false,
    cycle_pct: 0.1,
    training_days: trainingDays,
  };
}

/** Mifflin-St Jeor resting energy, kcal/day. */
export function bmr(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
}

export interface Targets {
  /** Average daily target. */
  day: Macros;
  /** Set when calories shift between training and rest days. */
  train?: Macros;
  rest?: Macros;
  working: {
    age: number;
    weightKg: number;
    bmr: number;
    factor: number;
    tdee: number;
    adjust: number;
  };
  warnings: string[];
}

function split(kcal: number, proteinG: number, fatPct: number): Macros {
  const fat = (kcal * fatPct) / 9;
  const carbs = Math.max(0, (kcal - proteinG * 4 - fat * 9) / 4);
  return { kcal: Math.round(kcal), protein: Math.round(proteinG), carbs: Math.round(carbs), fat: Math.round(fat) };
}

export function computeTargets(p: Profile, weightKg: number, year = new Date().getFullYear()): Targets {
  const age = year - p.birth_year;
  const rest = bmr(p.sex, weightKg, p.height_cm, age);
  const factor = ACTIVITY[p.activity].factor;
  const tdee = rest * factor;
  const adjust = ((p.rate_pct / 100) * weightKg * KCAL_PER_KG) / 7;
  const kcal = p.calorie_mode === 'manual' ? p.manual_kcal : tdee + adjust;
  const protein = p.protein_mode === 'fixed' ? p.protein_fixed_g : p.protein_g_per_kg * weightKg;

  const warnings: string[] = [];
  if (kcal < rest) warnings.push('Your calorie target is below your resting energy (BMR). Consider a slower rate.');
  if (protein * 4 + (kcal * p.fat_pct) > kcal) warnings.push('Protein and fat already use up all your calories, so carbs are 0.');

  const t: Targets = {
    day: split(kcal, protein, p.fat_pct),
    working: { age, weightKg, bmr: Math.round(rest), factor, tdee: Math.round(tdee), adjust: Math.round(adjust) },
    warnings,
  };

  const n = Math.round(p.training_days);
  if (p.cycle && n > 0 && n < 7) {
    // Training days get cycle_pct more than rest days; the weekly total stays the same.
    const diff = kcal * p.cycle_pct;
    const trainKcal = kcal + (diff * (7 - n)) / 7;
    const restKcal = kcal - (diff * n) / 7;
    // Keep protein and fat the same; the difference comes from carbs.
    const fat = (kcal * p.fat_pct) / 9;
    const mk = (k: number): Macros => ({
      kcal: Math.round(k),
      protein: Math.round(protein),
      fat: Math.round(fat),
      carbs: Math.round(Math.max(0, (k - protein * 4 - fat * 9) / 4)),
    });
    t.train = mk(trainKcal);
    t.rest = mk(restKcal);
    if (restKcal < rest) warnings.push('Rest-day calories are below your resting energy (BMR). Use a smaller training-day difference.');
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
