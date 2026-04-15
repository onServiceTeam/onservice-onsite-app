/**
 * Philippine Peso formatting utilities.
 * ALWAYS use these — never format currency manually.
 * All amounts stored in centavos internally.
 */

const formatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatPHP(centavos: number): string {
  return formatter.format(centavos / 100);
}

export function parsePHP(display: string): number {
  const cleaned = display.replace(/[₱,\s]/g, '');
  return Math.round(parseFloat(cleaned) * 100);
}

export function centavosToDecimal(centavos: number): number {
  return centavos / 100;
}

export function decimalToCentavos(decimal: number): number {
  return Math.round(decimal * 100);
}
