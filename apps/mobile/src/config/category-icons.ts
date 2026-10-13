/**
 * Service-category icons, shared by the customer home grid, the category
 * (service list) screen and provider onboarding.
 *
 * Human audit 2026-10-13 (Ken's notes, HA-DISC): the old icons stood for an
 * idea rather than the job (sparkles for cleaning, a snowflake for aircon, a
 * hammer for roofing and landscaping), which made the first screen look like a
 * game. Each icon below depicts the work itself and comes from the one icon
 * family the app already uses (lucide-react-native 0.456.0, re-exported through
 * src/components/icons). One shared map replaces the two copies that used to
 * live in home.tsx and provider-onboarding/categories.tsx.
 *
 * Lookup order: exact slug, then the category name turned into a slug, then a
 * keyword found inside either (so an admin-created "aircon-cleaning" category
 * still gets the aircon icon), then the Wrench fallback.
 */

import type { ComponentType } from 'react';
import {
  AirVent,
  SprayCan,
  ShowerHead,
  PlugZap,
  Hammer,
  PaintRoller,
  Bug,
  Refrigerator,
  House,
  Trees,
  Drill,
  Truck,
  Cctv,
  WashingMachine,
  Wrench,
} from '@/components/icons';

export type CategoryIconProps = { size?: number; color?: string };
export type CategoryIconComponent = ComponentType<CategoryIconProps>;

export const FALLBACK_CATEGORY_ICON: CategoryIconComponent = Wrench;

/** Exact slug matches. Keys are the seeded and legacy category slugs. */
export const CATEGORY_ICONS: Readonly<Record<string, CategoryIconComponent>> = {
  aircon: AirVent,
  'aircon-services': AirVent,
  'air-conditioning': AirVent,
  cleaning: SprayCan,
  plumbing: ShowerHead,
  electrical: PlugZap,
  carpentry: Hammer,
  painting: PaintRoller,
  pest: Bug,
  'pest-control': Bug,
  appliance: Refrigerator,
  'appliance-repair': Refrigerator,
  roofing: House,
  landscaping: Trees,
  'general-maintenance': Drill,
  moving: Truck,
  cctv: Cctv,
  laundry: WashingMachine,
};

/**
 * Keyword fallbacks, checked in order against the slug and the name. Keep the
 * keywords specific so an unrelated category never borrows a misleading icon.
 */
const KEYWORD_ICONS: ReadonlyArray<readonly [string, CategoryIconComponent]> = [
  ['aircon', AirVent],
  ['air-con', AirVent],
  ['clean', SprayCan],
  ['plumb', ShowerHead],
  ['electric', PlugZap],
  ['carpent', Hammer],
  ['paint', PaintRoller],
  ['pest', Bug],
  ['appliance', Refrigerator],
  ['roof', House],
  ['landscap', Trees],
  ['maintenance', Drill],
  ['moving', Truck],
  ['cctv', Cctv],
  ['laundry', WashingMachine],
];

function toSlug(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** The icon for a service category. Never returns undefined. */
export function getCategoryIcon(
  slug?: string | null,
  name?: string | null,
): CategoryIconComponent {
  const slugKey = toSlug(slug);
  const nameKey = toSlug(name);
  const exact = CATEGORY_ICONS[slugKey] ?? CATEGORY_ICONS[nameKey];
  if (exact) return exact;
  for (const [keyword, icon] of KEYWORD_ICONS) {
    if (slugKey.includes(keyword) || nameKey.includes(keyword)) return icon;
  }
  return FALLBACK_CATEGORY_ICON;
}
