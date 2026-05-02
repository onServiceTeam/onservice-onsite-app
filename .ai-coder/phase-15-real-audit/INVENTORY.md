# Phase 15 — File + line inventory (2026-05-03)

Real numbers, freshly counted. Used as the denominator for "what
fraction has actually been verified."

## Backend API (`packages/api/`)

| Area | Files | Lines |
|---|---:|---:|
| Services (`src/services/`) | 70 | 35,032 |
| Routes (`src/routes/`) | 42 | 12,246 |
| Migrations (`migrations/`) | 105 (numbered up to 116; gaps from drops) | 5,366 |
| Tests (`__tests__/`) | 185 | (not counted yet) |

**Highest migration number:** 116. **Files present:** 105. **Gaps:**
several numbers were used and then the file removed during the
audit-remediation churn. Cross-check before any fresh-DB regen.

## Admin web (`apps/admin/`)

| Area | Files | Lines |
|---|---:|---:|
| Pages | 31 | 17,191 |
| Components | 23 | (not counted yet) |
| Tests | 32 | (not counted yet) |

## Mobile (`apps/mobile/`)

| Area | Files | Lines |
|---|---:|---:|
| App screens | 91 | 25,809 |
| Components | 29 | (not counted yet) |
| Tests | 103 | (not counted yet) |

## What "tested" actually means right now (per area)

### Backend

- **Tests pass:** 2,498 jest tests. ✓
- **Verified at runtime against real Postgres:** 0 endpoints. The
  test suite uses `jest.mock('../src/models/db')` everywhere. The
  SQL strings in tests are asserted via regex on the call args, NOT
  executed against a real database.
- **Verified end-to-end (HTTP request → DB write → HTTP response):**
  0 endpoints in this test corpus. Some Phase 13 tests may have
  used supertest; needs verification.

### Admin web

- **Tests pass:** 101 vitest tests. ✓
- **Verified at runtime in a real browser:** 0 pages. Tests use
  jsdom + react-testing-library; no real-browser session has been
  driven through the app in any session 5g–5r.
- **F#4 Playwright specs:** 29 spec files exist. Baselines NOT
  captured; need a running admin app.

### Mobile

- **Tests pass:** 406 jest tests + 89 todo. ✓
- **Verified on a real device or simulator:** 0 screens. Same
  jsdom-style harness; never run on iOS or Android.
- **F#3 Maestro YAMLs:** 84 flow files exist. Baselines NOT
  captured; all uniformly skeleton.

## Pre-Phase-15 baseline

Cumulative commits on master between session 5g start and now:
ran `git log --oneline 359318c..HEAD` after the LL#12 commit and
got 6 commits in this most-recent fix-up wave.

Total commits since the audit closed (2026-05-01) is much larger;
not yet counted.

## What needs runtime bring-up (Phase 16)

Without these, Phases 17+ cannot honestly run:

1. Postgres (Docker container or local install).
2. Migrations 001–116 applied to the dev DB.
3. Seed: 1 admin (super_admin), 1 admin (admin tier), 1 dpo,
   1 customer (verified phone), 1 provider (approved),
   1 booking (received status), 1 published consent version
   (material=true), 1 legacy-hash admin (must_rotate_password=true).
4. Redis container (BullMQ queues + cache).
5. API server running on a known port.
6. Admin web `vite dev` on port 7382.
7. Mobile: choose between Expo Go / Bluestacks for Android, OR
   defer mobile runtime checks.

Each of these is a discrete operator step with a discrete blocker.
PLAN.md Phase 16 has the sequence.
