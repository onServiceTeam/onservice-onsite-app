-- 136 — Provider vetting questionnaire answers.
--
-- The provider onboarding flow now asks a short vetting questionnaire after the
-- service-area step (years of experience, main skills/specialties, own tools,
-- one professional reference). years_experience already exists on providers
-- (mig 013); the remaining free-form answers are stored as a JSONB blob so the
-- admin can review them during vetting without a column per question.
--
-- Nullable so legacy clients (and the 42703 fallback in provider.service.ts)
-- keep working if this migration has not been applied yet.

ALTER TABLE providers ADD COLUMN IF NOT EXISTS vetting_answers JSONB;

COMMENT ON COLUMN providers.vetting_answers IS
  'Provider onboarding vetting questionnaire answers: { mainSkills, hasOwnTools, reference: { name, contact } }. Captured at application time, reviewed by admin during approval.';
