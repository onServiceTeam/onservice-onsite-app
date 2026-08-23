-- Align the server-canonical branding settings with Ken's approved
-- August 2026 Stitch direction. Migration 072 remains immutable history;
-- this migration intentionally supersedes its teal/cyan defaults.

UPDATE platform_settings
SET value = CASE key
      WHEN 'brand_color_primary' THEN '#003D9B'
      WHEN 'brand_color_secondary' THEN '#0052CC'
      WHEN 'brand_color_accent' THEN '#FE8A00'
    END,
    default_value = CASE key
      WHEN 'brand_color_primary' THEN '#003D9B'
      WHEN 'brand_color_secondary' THEN '#0052CC'
      WHEN 'brand_color_accent' THEN '#FE8A00'
    END,
    description = CASE key
      WHEN 'brand_color_primary' THEN 'Primary deep blue for navigation and brand identity. Source: docs/design-system/tokens.json color.brand.primary.'
      WHEN 'brand_color_secondary' THEN 'Action blue for buttons, links, focus rings, and selected states. Source: docs/design-system/tokens.json color.brand.secondary.'
      WHEN 'brand_color_accent' THEN 'Orange attention accent. Source: docs/design-system/tokens.json color.brand.accent.'
    END,
    updated_at = NOW()
WHERE category = 'branding'
  AND key IN ('brand_color_primary', 'brand_color_secondary', 'brand_color_accent');
