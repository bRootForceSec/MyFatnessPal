import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';

describe('csv', () => {
  it('quotes awkward cells and rounds numbers', () => {
    expect(toCsv([['a', 'b, c', 'say "hi"', null, 1.23456]])).toBe('a,"b, c","say ""hi""",,1.23\r\n');
  });
});
