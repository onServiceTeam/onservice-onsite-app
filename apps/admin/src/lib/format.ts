/**
 * Format centavos as Philippine Peso currency string.
 * All amounts in the system are stored as integer centavos.
 *
 * BUG-PHASE37-01 fix — pre-fix this returned `₱NaN` for any nullish or
 * non-finite input. The dashboard shows ₱NaN on Revenue / Platform
 * Escrow / Platform Revenue / Guarantee Fund cards when the API hasn't
 * computed totals yet (fresh launch, low traffic, empty mocks).
 *
 * Post-fix: nullish/NaN/non-finite coerced to 0 so the user sees ₱0.00
 * instead of NaN. Real numbers pass through unchanged.
 */
export function formatCurrency(cents: number | null | undefined): string {
  const n = typeof cents === 'number' && Number.isFinite(cents) ? cents : 0;
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(n / 100);
}
