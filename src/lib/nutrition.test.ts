import { describe, expect, it } from 'vitest';
import { parseOff, parseUsda, sameBarcode, tidyName } from './foodApi';
import { bmr, computeTargets, defaultProfile, entryTotal, GRAM } from './nutrition';

describe('targets', () => {
  const LB = 0.45359237;
  const base = () => ({ ...defaultProfile(), height_cm: 180, birth_year: 1996 });
  const none = { sessionsPerWeek: 0, hours: 0.75 };

  it('uses Mifflin-St Jeor', () => {
    // 80 kg, 180 cm, 30 y male: 800 + 1125 - 150 + 5 = 1780
    expect(bmr('male', 80, 180, 30)).toBe(1780);
    expect(bmr('female', 60, 165, 25)).toBeCloseTo(600 + 1031.25 - 125 - 161);
  });

  it('adds lifestyle, workouts and the goal', () => {
    const p = { ...base(), lifestyle: 'light' as const, goal: 'lose' as const, rate_kg: 1 * LB };
    const t = computeTargets(p, 80, { sessionsPerWeek: 6, hours: 0.75 }, 2026);
    expect(t.working.bmr).toBe(1780);
    expect(t.working.lifestyleKcal).toBe(Math.round(1780 * 1.375));
    expect(t.working.perWorkout).toBe(240); // 4 kcal/kg/h x 80 kg x 0.75 h
    expect(t.working.workoutDaily).toBe(Math.round((240 * 6) / 7));
    expect(t.working.adjust).toBe(Math.round((-LB * 7700) / 7)); // 1 lb/week = about -499/day
    expect(Math.abs(t.day.kcal - (1780 * 1.375 + (240 * 6) / 7 - (LB * 7700) / 7))).toBeLessThan(1);
    expect(t.day.protein).toBe(160); // 2.0 g/kg
    expect(Math.abs(t.day.protein * 4 + t.day.carbs * 4 + t.day.fat * 9 - t.day.kcal)).toBeLessThan(15);
  });

  it('uses a small deficit for recomp', () => {
    const t = computeTargets({ ...base(), goal: 'recomp' }, 80, none, 2026);
    expect(t.working.adjust).toBe(Math.round((-0.25 * 7700) / 7));
  });

  it('never goes below the calorie floor', () => {
    const p = { ...base(), sex: 'female' as const, height_cm: 155, birth_year: 1970, goal: 'lose' as const, rate_kg: 2 * LB };
    const t = computeTargets(p, 50, none, 2026);
    expect(t.day.kcal).toBe(1200);
    expect(t.working.floored).toBe(true);
    expect(t.warnings.length).toBeGreaterThan(0);
  });

  it('puts workout calories on training days only when asked', () => {
    const p = { ...base(), workout_mode: 'training_days' as const };
    const t = computeTargets(p, 80, { sessionsPerWeek: 4, hours: 1 }, 2026);
    expect(t.train!.kcal - t.rest!.kcal).toBe(t.working.perWorkout);
    // The weekly total matches the daily average.
    expect(Math.abs(4 * t.train!.kcal + 3 * t.rest!.kcal - 7 * t.day.kcal)).toBeLessThan(5);
    expect(t.train!.protein).toBe(t.rest!.protein);
  });

  it('uses a calories-per-workout override', () => {
    const t = computeTargets({ ...base(), workout_kcal: 400 }, 80, { sessionsPerWeek: 7, hours: 1 }, 2026);
    expect(t.working.perWorkout).toBe(400);
    expect(t.working.workoutDaily).toBe(400);
  });

  it('keeps fat at or above its minimum', () => {
    const p = { ...base(), fat_pct: 0.1 };
    const t = computeTargets(p, 100, none, 2026);
    expect(t.min.fat).toBe(Math.round((0.3 / LB) * 100));
    expect(t.day.fat).toBeGreaterThanOrEqual(t.min.fat);
  });

  it('warns when carbs fall below their minimum', () => {
    const p = { ...base(), calorie_mode: 'manual' as const, manual_kcal: 1600, protein_mode: 'fixed' as const, protein_fixed_g: 250 };
    const t = computeTargets(p, 100, none, 2026);
    expect(t.day.carbs).toBeLessThan(t.min.carbs);
    expect(t.warnings.some((w) => w.startsWith('Carbs'))).toBe(true);
  });

  it('supports manual calories and fixed protein', () => {
    const p = { ...base(), calorie_mode: 'manual' as const, manual_kcal: 2200, protein_mode: 'fixed' as const, protein_fixed_g: 190 };
    const t = computeTargets(p, 90, none, 2026);
    expect(t.day.kcal).toBe(2200);
    expect(t.day.protein).toBe(190);
  });
});

describe('food math', () => {
  it('scales per-100g and per-serving foods', () => {
    const m = { kcal: 200, protein: 10, carbs: 20, fat: 5 };
    expect(entryTotal({ basis: 'g', macros: m }, 150, GRAM).kcal).toBe(300);
    expect(entryTotal({ basis: 'g', macros: m }, 2, { label: 'cup', amount: 50 }).protein).toBe(10);
    expect(entryTotal({ basis: 'serving', macros: m }, 1.5, { label: 'bar', amount: 1 }).kcal).toBe(300);
  });
});

describe('food parsers', () => {
  it('parses a USDA branded food', () => {
    const f = parseUsda({
      fdcId: 1,
      description: 'GREEK YOGURT, PLAIN',
      dataType: 'Branded',
      brandOwner: 'ACME FOODS',
      gtinUpc: '012345678905',
      servingSize: 170,
      servingSizeUnit: 'g',
      householdServingFullText: '1 CONTAINER',
      foodNutrients: [
        { nutrientId: 1008, unitName: 'KCAL', value: 59 },
        { nutrientId: 1003, value: 10.3 },
        { nutrientId: 1004, value: 0.4 },
        { nutrientId: 1005, value: 3.6 },
      ],
    })!;
    expect(f.name).toBe('Greek Yogurt, Plain');
    expect(f.brand).toBe('Acme Foods');
    expect(f.basis).toBe('g');
    expect(f.units[0]).toEqual({ label: '1 container (170 g)', amount: 170 });
    expect(Math.round(entryTotal(f, 1, f.units[0]).kcal)).toBe(100);
  });

  it('parses a USDA generic food with Atwater energy and measures', () => {
    const f = parseUsda({
      fdcId: 2,
      description: 'Bananas, raw',
      foodNutrients: [
        { nutrientNumber: '957', unitName: 'KCAL', value: 89 },
        { nutrientNumber: '203', value: 1.1 },
      ],
      foodMeasures: [{ disseminationText: '1 medium', gramWeight: 118 }],
    })!;
    expect(f.macros.kcal).toBe(89);
    expect(f.units[0].label).toBe('1 medium (118 g)');
  });

  it('parses Open Food Facts per 100 g and per serving', () => {
    const f = parseOff({
      code: '123',
      product_name: 'Protein Bar',
      brands: 'Barco, Other',
      serving_size: '60 g',
      serving_quantity: '60',
      nutriments: { 'energy-kcal_100g': 350, proteins_100g: 33, carbohydrates_100g: 40, fat_100g: 10 },
    })!;
    expect(f.brand).toBe('Barco');
    expect(Math.round(entryTotal(f, 1, f.units[0]).kcal)).toBe(210);

    const s = parseOff({ product_name: 'Drink', serving_size: '1 can', nutriments: { 'energy-kcal_serving': 140 } })!;
    expect(s.basis).toBe('serving');
    expect(s.macros.kcal).toBe(140);
    expect(parseOff({ product_name: 'Mystery', nutriments: {} })).toBeNull();
  });

  it('matches UPC and EAN forms of a barcode', () => {
    expect(sameBarcode('012345678905', '0012345678905')).toBe(true);
    expect(tidyName('Mixed Case')).toBe('Mixed Case');
  });
});
