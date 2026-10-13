/**
 * D38 human audit (Ken, 2026-10-13): how a customer's request budget reads on
 * the provider side. Amounts are centavos, as stored on the booking. A
 * request with no budget is one where the customer ticked "Not sure, let the
 * pro quote" (or an older request that had no budget), so it says so plainly
 * instead of showing nothing.
 */
import { formatPHP } from '@/utils/currency';

export function formatJobRequestBudget(budgetMin: number | null | undefined, budgetMax: number | null | undefined): string {
  const min = typeof budgetMin === 'number' ? budgetMin : null;
  const max = typeof budgetMax === 'number' ? budgetMax : null;
  if (min != null && max != null) {
    return min === max ? `Budget ${formatPHP(max)}` : `Budget ${formatPHP(min)} to ${formatPHP(max)}`;
  }
  if (min != null) return `Budget from ${formatPHP(min)}`;
  if (max != null) return `Budget up to ${formatPHP(max)}`;
  return 'Customer is not sure of the price';
}

/**
 * The amount "Use the customer's budget" fills in: the top of the range, or
 * the only amount the customer gave. Null when there is no budget.
 */
export function customerBudgetTarget(budgetMin: number | null | undefined, budgetMax: number | null | undefined): number | null {
  if (typeof budgetMax === 'number' && budgetMax > 0) return budgetMax;
  if (typeof budgetMin === 'number' && budgetMin > 0) return budgetMin;
  return null;
}
