-- Migration 102: Partial unique index on admin_actions for
-- consent_version_published rows.
--
-- MED-N125 fix.
--
-- Pre-fix: compliance-admin.service.publishConsentVersion did a
-- pre-check SELECT for an existing (consentType, version) and threw
-- 409 if found, then INSERTed. Two simultaneous publishes both
-- passed the existence check and both INSERTed — duplicate published
-- versions in the audit trail. Customers downstream of the consent
-- version look-up could see the wrong version as "current".
--
-- Post-fix: a partial UNIQUE INDEX on
--   (action_type, target_type, details->>'consentType', details->>'version')
--   WHERE action_type = 'consent_version_published'
-- enforces uniqueness at the database level. The pre-check stays as
-- a fast-path for the friendly 409 error; on race the second INSERT
-- now fails with PG error 23505 and the service translates it to
-- the same 409.

CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_actions_consent_version_published
    ON admin_actions(
        (details->>'consentType'),
        (details->>'version')
    )
    WHERE action_type = 'consent_version_published'
      AND target_type = 'consent_version';

COMMENT ON INDEX uq_admin_actions_consent_version_published IS
    'MED-N125 fix. Prevents duplicate consent_version_published rows for the same (consentType, version). Pre-check race could let two simultaneous publishes both pass and both INSERT.';
