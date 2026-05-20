import { describe, expect, it } from 'vitest';
import { calculateBudgetPlanning, isValidBudgetRate } from '../src/utils/budget-planning';

describe('isValidBudgetRate', () => {
  it('accepts rates between 0 and 100', () => {
    expect(isValidBudgetRate(0)).toBe(true);
    expect(isValidBudgetRate(12.5)).toBe(true);
    expect(isValidBudgetRate(100)).toBe(true);
  });

  it('rejects invalid rates', () => {
    expect(isValidBudgetRate(-1)).toBe(false);
    expect(isValidBudgetRate(100.01)).toBe(false);
    expect(isValidBudgetRate(Number.NaN)).toBe(false);
  });
});

describe('calculateBudgetPlanning', () => {
  it('computes tax, gratuity, contingency, and planned total', () => {
    const result = calculateBudgetPlanning(1000, {
      taxRate: 8.25,
      gratuityRate: 10,
      contingencyRate: 5,
    });

    expect(result.taxAmount).toBe(82.5);
    expect(result.gratuityAmount).toBe(100);
    expect(result.contingencyAmount).toBe(50);
    expect(result.plannedTotal).toBe(1232.5);
  });

  it('rounds floating point calculations to cents', () => {
    const result = calculateBudgetPlanning(199.99, {
      taxRate: 7.875,
      gratuityRate: 0,
      contingencyRate: 0,
    });

    expect(result.taxAmount).toBe(15.75);
    expect(result.plannedTotal).toBe(215.74);
  });
});
