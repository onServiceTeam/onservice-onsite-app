-- Phase 14 Dispatch 13 — Feature flags for A/B testing + promo redemption.
-- Bug 44 + Bug 45.
--
-- Both features are infrastructurally present but unwired on the customer
-- side (no redemption pipeline in pricing.service for promo, no variant
-- assignment service for A/B). Per .ai-coder/decisions/D13-feature-decisions.md,
-- both are pulled for v1.0. The seed values are FALSE; admin can toggle to
-- TRUE post-launch in v1.1+ once the wiring is complete.
--
-- platform_settings rich schema (migration 050) requires category, label,
-- value_type, value, default_value — so we follow the same pattern as the
-- existing rows.

INSERT INTO platform_settings (
  category, subcategory, key, label, description,
  value_type, value, default_value,
  display_order, is_active
)
VALUES
  (
    'feature_flags', 'launch_phase',
    'feature_flag.promo_redemption_enabled',
    'Promo Code Redemption Enabled',
    'Phase 14 D13 — promo codes UI + redemption pipeline. Pulled for v1.0. v1.1 wires when first marketing campaign exists.',
    'boolean', 'false', 'false',
    100, TRUE
  ),
  (
    'feature_flags', 'launch_phase',
    'feature_flag.ab_testing_enabled',
    'A/B Testing Framework Enabled',
    'Phase 14 D13 — A/B variant assignment + admin dashboard. Pulled for v1.0. v1.1 wires when first experiment hypothesis is documented.',
    'boolean', 'false', 'false',
    101, TRUE
  )
ON CONFLICT (key) DO NOTHING;
