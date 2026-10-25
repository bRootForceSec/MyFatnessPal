import { describe, expect, it } from 'vitest';
import { displayToKg, kgToDisplay, parseNumber, cmToDisplay, displayToCm } from './units';

describe('units', () => {
  it('converts weight both ways', () => {
    expect(kgToDisplay(100, 'imperial')).toBe(220.5);
    expect(kgToDisplay(displayToKg(185, 'imperial'), 'imperial')).toBe(185);
    expect(kgToDisplay(82.46, 'metric')).toBe(82.5);
  });
  it('converts length both ways', () => {
    expect(cmToDisplay(2.54 * 32, 'imperial')).toBe(32);
    expect(displayToCm(10, 'imperial')).toBeCloseTo(25.4);
  });
  it('parses numbers with commas and blanks', () => {
    expect(parseNumber('82,5')).toBe(82.5);
    expect(parseNumber('  ')).toBeNull();
    expect(parseNumber('abc')).toBeNull();
  });
});
