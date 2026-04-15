/**
 * Philippine address formatting.
 * Format: Barangay, Municipality/City, Province
 * Never use US-style "123 Main St" format.
 */

export interface PHAddress {
  street?: string;
  barangay: string;
  city: string;
  province: string;
  zipCode?: string;
}

export function formatPHAddress(address: PHAddress): string {
  const parts: string[] = [];

  if (address.street) {
    parts.push(address.street);
  }

  parts.push(`Brgy. ${address.barangay}`);
  parts.push(address.city);
  parts.push(address.province);

  if (address.zipCode) {
    parts.push(address.zipCode);
  }

  return parts.join(', ');
}

export function formatShortAddress(address: PHAddress): string {
  return `Brgy. ${address.barangay}, ${address.city}`;
}
