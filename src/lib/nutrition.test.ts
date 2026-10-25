import { describe, expect, it } from 'vitest';
import { parseOff, parseUsda, sameBarcode, tidyName } from './foodApi';
import { bmr, computeTargets, defaultProfile, entryTotal, GRAM } from './nutrition';

describe('targets', () => {
  it('uses Mifflin-St Jeor', () => {
    // 80 kg, 180 cm, 30 y male: 800 + 1125 - 150 + 5 = 1780
    expect(bmr('male', 80, 180, 30)).toBe(1780);
    expect(bmr('female', 60, 165, 25)).toBeCloseTo(600 + 1031.25 - 125 - 161);
  });

  it('builds calories from BMR, activity and goal', () => {
    const p = { ...defaultProfile(6), height_cm: 180, birth_year: 1996, activity: 'very' as const, goal: 'lose' as const, rate_pct: -0.5 };
    const t = computeTargets(p, 80, 2026);
    expect(t.working.bmr).toBe(1780);
    expect(t.working.tdee).toBe(Math.round(1780 * 1.725));
    // -0.5% of 80 kg = 0.4 kg/week = 3080 kcal/week = -440/day
    expect(t.working.adjust).toBe(-440);
    expect(t.day.kcal).toBe(Math.round(1780 * 1.725 - 440));
    expect(t.day.protein).toBe(160); // 2.0 g/kg
    expect(t.day.fat).toBe(Math.round((t.day.kcal * 0.25) / 9));
    // Calories add up (within rounding).
    expect(Math.abs(t.day.protein * 4 + t.day.carbs * 4 + t.day.fat * 9 - t.day.kcal)).toBeLessThan(15);
  });

  it('keeps the weekly total the same when cycling', () => {
    const p = { ...defaultProfile(6), cycle: true, cycle_pct: 0.1, training_days: 6 };
    const t = computeTargets(p, 80, 2026);
    expect(t.train!.kcal).toBeGreaterThan(t.day.kcal);
    expect(t.rest!.kcal).toBeLessThan(t.day.kcal);
    expect(Math.abs(6 * t.train!.kcal + t.rest!.kcal - 7 * t.day.kcal)).toBeLessThan(5);
    expect(t.train!.protein).toBe(t.rest!.protein);
    // 10% of the average between training and rest days.
    expect(Math.abs(t.train!.kcal - t.rest!.kcal - t.day.kcal * 0.1)).toBeLessThan(2);
  });

  it('supports manual calories and fixed protein', () => {
    const p = { ...defaultProfile(), calorie_mode: 'manual' as const, manual_kcal: 2200, protein_mode: 'fixed' as const, protein_fixed_g: 190 };
    const t = computeTargets(p, 90, 2026);
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
