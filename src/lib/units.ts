export type UnitSystem = 'metric' | 'imperial';

export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;

/** Round to a number of decimal places, avoiding float noise like 80.00000001. */
export function round(n: number, places = 1): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

export function weightUnit(u: UnitSystem): 'kg' | 'lb' {
  return u === 'metric' ? 'kg' : 'lb';
}

export function lengthUnit(u: UnitSystem): 'cm' | 'in' {
  return u === 'metric' ? 'cm' : 'in';
}

/** Weights are always stored in kg. */
export function kgToDisplay(kg: number, u: UnitSystem): number {
  return u === 'metric' ? round(kg, 1) : round(kg / KG_PER_LB, 1);
}

export function displayToKg(value: number, u: UnitSystem): number {
  return u === 'metric' ? value : value * KG_PER_LB;
}

/** Lengths are always stored in cm. */
export function cmToDisplay(cm: number, u: UnitSystem): number {
  return u === 'metric' ? round(cm, 1) : round(cm / CM_PER_IN, 1);
}

export function displayToCm(value: number, u: UnitSystem): number {
  return u === 'metric' ? value : value * CM_PER_IN;
}

/** Parse user input like "82,5" or " 180 " into a number, or null if empty/invalid. */
export function parseNumber(input: string): number | null {
  const s = input.trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
