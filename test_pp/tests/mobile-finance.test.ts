import { describe, expect, it } from 'vitest';
import { applyTransfer, paiseToRupees, progress, rupeesToPaise } from '../mobile/src/finance.js';

describe('mobile money entry logic', () => {
  it('round-trips rupees into backend paise', () => { expect(rupeesToPaise('1,250.50')).toBe(125050); expect(paiseToRupees(125050)).toContain('1,250.5'); });
  it('rejects zero and clamps goal progress', () => { expect(() => rupeesToPaise('0')).toThrow(); expect(progress(120, 100)).toBe(1); expect(progress(20, 100)).toBe(0.2); });
  it('rejects blank and non-finite money input and handles zero targets', () => { expect(() => rupeesToPaise('   ')).toThrow(); expect(() => rupeesToPaise('Infinity')).toThrow(); expect(progress(50, 0)).toBe(0); expect(progress(-10, 100)).toBe(0); });
  it('moves transfer value between accounts without changing total wealth', () => { expect(applyTransfer(10000, 5000, 2500)).toEqual([7500, 7500]); });
});