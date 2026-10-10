/**
 * Absolute platform safety ceiling for one service add-on.
 *
 * The live addon_price_max_cents setting may tighten this boundary, but it
 * must never raise it. Keep this neutral config module dependency-free so
 * validators, settings, and catalog services all consume the same source.
 */
export const ADDON_PRICE_HARD_MAX_CENTAVOS = 10_000_000; // ₱100,000
