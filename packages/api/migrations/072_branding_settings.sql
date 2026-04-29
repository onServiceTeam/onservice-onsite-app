-- Migration 072: Branding settings (server-canonical, admin-editable).
-- Phase 14 Dispatch 02 Part 2 — Bug 1324 fix.
--
-- Adds three brand-color rows to the existing platform_settings table so the
-- canonical values from docs/design-system/tokens.json are admin-tunable
-- without code changes. Edited via the existing /admin/settings page (no
-- new admin UI is required — the SystemSettingsPage already handles
-- string-typed settings).
--
-- Mobile and admin clients read these via GET /api/v1/config (the existing
-- public client config bundle, augmented in the same dispatch part).
--
-- Runtime application:
--   - Admin web: theme is in apps/admin/src/index.css as CSS variables.
--     Runtime override is currently NOT wired (admin reads CSS vars at
--     load). Editing the values in /admin/settings updates getClientConfig
--     immediately but the rendered page won't reflect until rebuild.
--     LAUNCH-LIMITATIONS.md tracks the dynamic-theme follow-up.
--   - Mobile: theme is in apps/mobile/src/config/theme.ts (synchronous
--     import). Same story — admin edit takes effect on next app build.
--
-- The structural fix (single source of truth, no #0066FF) is complete.
-- The cosmetic-runtime polish (live theme update) is tracked separately.

INSERT INTO platform_settings
  (category, key, label, description, value_type, value, default_value, display_order)
VALUES
  ('branding', 'brand_color_primary',   'Primary Brand Color',   'Primary brand color hex (deep teal). Used for sidebar accents, primary buttons. Source: docs/design-system/tokens.json color.brand.primary.', 'string', '#1B3A4B', '#1B3A4B', 1),
  ('branding', 'brand_color_secondary', 'Secondary Brand Color', 'Secondary cyan hex. Used for focus rings, links. Source: tokens.json color.brand.secondary.',                                                'string', '#00B4D8', '#00B4D8', 2),
  ('branding', 'brand_color_accent',    'Accent Brand Color',    'Accent orange hex. Used for alerts, dispute badges. Source: tokens.json color.brand.accent.',                                              'string', '#FF6B35', '#FF6B35', 3);
