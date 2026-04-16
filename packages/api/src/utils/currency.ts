/**
 * Format centavo amount to Philippine Peso string for error/validation messages.
 * @param centavos Amount in centavos (e.g. 10000 = ₱100.00)
 */
export function formatPHP(centavos: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(centavos / 100);
}
