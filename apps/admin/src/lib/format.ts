/**
 * Format centavos as Philippine Peso currency string.
 * All amounts in the system are stored as integer centavos.
 */
export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(cents / 100);
}
