# Phase 43 — Deep screen audit + repair (admin app, screens 22-25 of 28) (2026-05-04)

Continuing the deep-audit methodology to:

- Compliance (DPA hub: data-protection officer surface)
- DataProtectionLog (DSR — data subject request — lifecycle)
- ConsentVersions (NPC consent-version manager)
- SupportTickets (customer/provider ticketing)

## Coverage delta

| Track | Phase 42 | Phase 43 |
|---|---|---|
| Admin Playwright baselines (4 specs × 12 captures) | 354/354 PASS | **354/354 PASS** (48 re-captured) |
| Admin Vitest DOM tests | 101/101 PASS | **101/101 PASS** |
| Real bugs in this batch | 2 | **1 real bug found + fixed** |
| Cumulative bugs found+fixed (Phase 17→43) | 80 | **81** |

## Bugs found in this round

### BUG-PHASE43-01 — SupportTickets resolved/closed transitions skip resolution notes

`apps/admin/src/pages/SupportTicketsPage.tsx` status-change select
fired the mutation immediately for ALL transitions including
`resolved` and `closed` — no resolution notes captured. The API
accepts `resolutionNotes` as optional, but operationally a
resolved/closed ticket without notes leaves an incomplete audit
trail and provides nothing for trend analysis or recipient comms.

**Fix:** When the admin selects 'resolved' or 'closed' from the
dropdown, a confirm dialog opens requiring resolution notes
(min 10 chars) before the mutation fires. Other transitions
(in_progress / waiting_on_customer / etc.) still fire directly.

## What I checked but did NOT change

### CompliancePage — feature-complete for v1.0

DPO-facing dashboard with NPC registration tracker, breach log,
DSR open-count, consent stats. No surfacing gaps; existing flow is
adequate for the operator role.

### DataProtectionLogPage — well-built

DSR lifecycle (complete / request-info / reject / escalate-to-NPC)
all use explicit reason/info/npcReference parameters captured via
dialog inputs. No hardcoded reasons, no missing fields. Audit
trail is complete.

### ConsentVersionsPage — well-built

Publish-version dialog requires 30-char minimum changeSummary,
captures material-flag with clear copy explaining consequences,
known-types datalist auto-populates. Comprehensive.

## Files changed in Phase 43

**Admin app code (1 file):**
- `apps/admin/src/pages/SupportTicketsPage.tsx` — BUG-PHASE43-01

**Re-captured baselines (48 PNG files):**
- compliance, data-protection-log, consent-versions, support-tickets
  — 12 each.

**Documentation:**
- `.ai-coder/phase-15-real-audit/PHASE-43-FINAL.md` (this file)

## Verified post-fix

- 101/101 admin Vitest DOM tests still passing
- `npx tsc --noEmit` clean
- 48 visual baselines confirm

## Cumulative across Phase 17 → 43

- **81 real bugs found + fixed** (+1 from Phase 42's 80)
- **9 migrations** (no new in Phase 43)
- 5131+ total assertions verified across all surfaces

## Continuation checklist

Phase 44+ (FINAL admin batch):
- StaffRoles, CancellationPolicy, ProviderDetail (Phase 44)
- Regression sweep across all 28 admin screens
- Mobile screens (Phase 45+ — gated behind E02-F#3 — Maestro on
  iOS sim or Android emulator)
