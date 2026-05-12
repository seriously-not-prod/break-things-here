export interface BudgetPlanningRates {
  taxRate: number;
  gratuityRate: number;
  contingencyRate: number;
}

export interface BudgetPlanningTotals extends BudgetPlanningRates {
  taxAmount: number;
  gratuityAmount: number;
  contingencyAmount: number;
  plannedTotal: number;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

export function isValidBudgetRate(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

export function calculateBudgetPlanning(
  allocatedAmount: number,
  rates: BudgetPlanningRates,
): BudgetPlanningTotals {
  const taxAmount = roundCurrency((allocatedAmount * rates.taxRate) / 100);
  const gratuityAmount = roundCurrency((allocatedAmount * rates.gratuityRate) / 100);
  const contingencyAmount = roundCurrency((allocatedAmount * rates.contingencyRate) / 100);
  const plannedTotal = roundCurrency(allocatedAmount + taxAmount + gratuityAmount + contingencyAmount);

  return {
    ...rates,
    taxAmount,
    gratuityAmount,
    contingencyAmount,
    plannedTotal,
  };
}
