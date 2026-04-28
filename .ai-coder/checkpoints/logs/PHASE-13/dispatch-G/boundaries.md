# Phase 13 Dispatch G — boundaries (companion)

Companion to `gates/gate-2-boundaries-phase-13.md`. Same content,
condensed list. The gate-level file is authoritative.

## Function boundary tables

- `verifyPasswordWithRehash`: empty pwd, malformed scrypt, legacy 2-part, missing salt, UPDATE-fail-but-token-still-issued.
- `verifyHCaptchaToken`: missing token, missing secret, network timeout, HTTP 5xx, success=false, success=true, malformed JSON.
- `piiMaskFormat`: null fields, undefined, circular refs (WeakSet), deep nesting, mixed types, non-string `email`, key-based [REDACTED], arrays.
- `processExpiredCoolingOff`: zero expired, all succeed, partial FK violation (per-row tx ROLLBACK), DB connection lost mid-loop, race-deleted user.
- BIGINT parser: NULL, '0', MAX_SAFE_INTEGER, MAX_SAFE_INTEGER+2 (silent precision loss documented), negative.
- A11y components: missing aria-label fallback to verb-only.

## Trust boundaries

- /admin/compliance/dsr — admin JWT + Zod.
- /admin/consent/versions — admin JWT + Zod, INSERT only.
- /compliance/dsr — customer JWT + Zod, scoped to own userId.
- Cron processExpiredCoolingOff — worker process, idempotent.
- pg-types BIGINT parser — global registration (project-wide scope, LAUNCH-LIMITATIONS §16).
