# Phase D Findings Part 5 — Account Management + Data Rights + Terms (NPC Compliance)

Files added in this batch:
- `apps/mobile/app/customer/account-management.tsx` (405)
- `apps/mobile/app/customer/data-rights.tsx` (431)
- `apps/mobile/app/customer/terms.tsx` (267)

**Phase D running total: ~8,167 lines fully read.**
**Audit grand total: ~27,841 lines fully read.**

---

## CRITICAL bugs (continuing from CRIT-82)

### CRIT-83 — Terms of Service contradicts server escrow timing — TOS says 48h, server auto-confirms at 24h
**Files:**
- [apps/mobile/app/customer/terms.tsx:30-33](apps/mobile/app/customer/terms.tsx#L30) — TOS Section 3 says "48-hour auto-confirmation window"
- [apps/mobile/src/config/platform.config.ts:35](apps/mobile/src/config/platform.config.ts#L35) — `escrowAutoConfirmHours: 24`
- [packages/api/src/config/platform.config.ts:32](packages/api/src/config/platform.config.ts#L32) — server: `escrowAutoConfirmHours: 24`
- [packages/api/src/jobs/workers.ts:45](packages/api/src/jobs/workers.ts#L45) — auto-confirms after `windowHours = platformConfig.escrowAutoConfirmHours ?? 24` (verified in B05)

The TOS tells customers their escrow auto-confirms after 48 hours. The server ACTUALLY auto-confirms after 24 hours. **The legal document customers agree to misrepresents the actual platform behavior.**

A customer who sees "Job completed" notification on Tuesday morning believes they have until Thursday morning (48h) to inspect and dispute. Server releases payment to provider on Wednesday morning (24h). Customer's right-to-dispute window is half what they were told.

This is a **legal exposure** — basis for chargeback claims, NPC complaints (deceptive practice), or class action. For a launch product, this is launch-blocking.

**Fix dispatch:**
```
1. Decision (Ken): which is correct — 24h or 48h auto-confirm?
   - Server uses 24h.
   - Mobile TOS says 48h.
   - If 24h is the intended behavior, update TOS Section 3 to "24-hour auto-confirmation window".
   - If 48h is intended, update platformConfig.escrowAutoConfirmHours to 48 on both server and mobile.
2. Add a CI check: parse the TOS sections in apps/mobile/app/customer/terms.tsx for digit+'-hour' patterns, assert they match platformConfig values from settings.service.
3. Better: derive the TOS text from the live platform_settings (server-canonical), so legal text auto-syncs with config changes.
4. Consider attorney review of the entire TOS once aligned.
5. Test: open /customer/terms, expand Section 3, assert "24-hour" matches platformConfig.escrowAutoConfirmHours.
```

### CRIT-84 — Two parallel account-deletion flows that are not coordinated
**Files:**
- [apps/mobile/app/customer/account-management.tsx](apps/mobile/app/customer/account-management.tsx) — calls `data-management.service:requestAccountDeletion` (cooling-off pattern, 30-day window)
- [apps/mobile/app/customer/data-rights.tsx](apps/mobile/app/customer/data-rights.tsx) — calls `compliance.service:submitDataSubjectRequest` with type='erasure' (NPC DSR pattern, 15-day SLA)

A customer who wants to delete their account has two paths:

1. **Profile → Account & Data → "Request Account Deletion"** → cooling-off flow. Server schedules deletion in 30 days, customer can cancel. Customer's wallet/bookings preconditions enforced.

2. **Profile → Account & Data → ??? OR somewhere → "Data Rights" → "Delete My Account"** → NPC DSR flow. Server creates a `data_subject_request` row. DPO has 15 days to respond.

**Problems:**
- The two flows write to different tables (`account_deletions` vs `data_subject_requests`).
- Customer might submit BOTH for the same account → confused state.
- The DSR flow doesn't explain it triggers a manual DPO review (no cooling-off, no automatic execution).
- The cooling-off flow doesn't explain it satisfies the NPC erasure right.
- **Neither screen mentions the other.**

**Customer experience:** Confusing. Likely will trigger duplicate ops work for the DPO + customer support.

**Fix dispatch:**
```
1. Decision (legal/product): pick ONE deletion flow as canonical.
   - Recommendation: route DSR erasure → cooling-off flow (server-side). DPO sees a unified queue.
2. Update data-rights.tsx erasure flow:
   - On submission, if user already has an active account_deletion row, show "You already have a deletion pending — view in Account & Data."
   - If submitting fresh, create both records OR redirect to account-management.
3. Update account-management.tsx:
   - Mention NPC RA 10173 §16 erasure right at top of the delete section.
   - Note that this fulfils the NPC erasure obligation (DSR row auto-created server-side).
4. Test: submit erasure DSR, verify a single account_deletions row exists; submit account deletion, verify a single data_subject_requests row exists. No duplicates.
```

---

## MEDIUM bugs

### MED-148 — TOS "Last updated" date hardcoded in source
**File:** [apps/mobile/app/customer/terms.tsx:172](apps/mobile/app/customer/terms.tsx#L172)
```ts
<Text style={styles.introDate}>Last updated: April 14, 2026</Text>
```
Hardcoded string. Easy to forget to bump on TOS changes. Should derive from platform_settings (`tos_last_updated_at`) so legal can ship updates without code changes.

### MED-149 — Account-management uses non-null assertions on `coolingOffEndsAt`
**File:** [apps/mobile/app/customer/account-management.tsx:196-197](apps/mobile/app/customer/account-management.tsx#L196)
```ts
{formatDate(activeDeletion!.coolingOffEndsAt)}
{daysRemaining(activeDeletion!.coolingOffEndsAt)}
```
If server returns a `cooling_off` status row without `coolingOffEndsAt` (data corruption, schema drift), runtime null deref crashes the screen. Add defensive check OR ensure server always populates it.

### MED-150 — Data rights flow doesn't show queue position or DPO acknowledgment
**File:** [apps/mobile/app/customer/data-rights.tsx:206-240](apps/mobile/app/customer/data-rights.tsx#L206)
Confirmation shows reference number + due date. But no link to "view request status." If 10 days pass and customer hasn't heard back, they have to email the DPO directly. Better: a "My Data Requests" history view showing all submitted DSRs.

(Comment at top of file acknowledges: "a customer-side 'list my requests' endpoint is deferred — see LAUNCH-LIMITATIONS.md".)

### MED-151 — TOS Section 6 (insurance disclaimer) is "Interim wording — pending attorney review"
**File:** [apps/mobile/app/customer/terms.tsx:53-59](apps/mobile/app/customer/terms.tsx#L53)
Code comment explicitly states: "Interim wording — pending attorney review. Ken's lawyer must sign off on this exact text before v1.0.0-launch-ready."

**Per CLAUDE.md:** "F#10 final attorney-reviewed disclaimer wording" is one of the three remaining items before `v1.0.0-launch-ready`. **Confirmed launch blocker — cannot ship final without attorney sign-off.**

### MED-152 — DPO email `dpo@onservice.ph` and support email `support@onservice.ph` are claimed but unverified
**Files:**
- [apps/mobile/app/customer/data-rights.tsx:303-304](apps/mobile/app/customer/data-rights.tsx#L303)
- [apps/mobile/app/customer/terms.tsx:198](apps/mobile/app/customer/terms.tsx#L198)

Two operational email addresses promised to customers. Both must be:
- Real and monitored (not a black hole).
- Documented in the launch runbook.
- Tied to D14 ops items (NPC DPO registration requires a real, named DPO with monitored email).

If `dpo@onservice.ph` bounces, customer's NPC complaint stands.

### MED-153 — Account-management has no "delete data export" UI
**File:** [apps/mobile/app/customer/account-management.tsx:159-176](apps/mobile/app/customer/account-management.tsx#L159)
Shows recent exports (top 3) but no way to delete an old export from the customer's view. Server's data_export_requests have an "expires" worker (`expireOldExports` per B05/workers.ts:438), but customer can't proactively scrub. Lower priority — not a customer pain point.

### MED-154 — No "data correction" flow in account-management.tsx (only in data-rights.tsx)
**File:** [apps/mobile/app/customer/account-management.tsx](apps/mobile/app/customer/account-management.tsx)
Account-management has Export + Delete. The Correction flow lives only in data-rights.tsx. Most customers never find data-rights.tsx. To exercise their NPC §16(a) right to correction, they have to find an obscure path. Add a "Correct My Data" card to account-management.tsx (or surface data-rights more prominently from profile).

---

## LOW / INFO

- **account-management.tsx is well-architected.** Cooling-off pattern with cancel button. Pre-flight checklist (no active bookings, zero balance). ConfirmModal for destructive action (Bug 998).
- **data-rights.tsx is excellent NPC compliance UX.** Three flows clearly separated, "Type DELETE to confirm" pattern, reference number + due date in confirmation, accessibility labels throughout.
- **terms.tsx 8 TOS sections + 6 Privacy sections** — comprehensive coverage of customer-facing legal points.
- **terms.tsx Bug 1170/1198 fix** — cancellation policy fetched live from server, not hardcoded.
- **terms.tsx Bug 834 D04 SiguradoShield pull** — Section 6 correctly stripped of insurance language.
- **NPC RA 10173 references** appear in 4+ places (data-rights.tsx, account-management.tsx, terms.tsx). Consistent legal grounding.
- **Privacy policy lists "complaints@privacy.gov.ph"** — real NPC contact.
- **Data retention disclosure** is honest about the 10-year BIR requirement for financial records.

---

## What's left in Phase D

- Mobile stores + auth-migration + config service + socket service (~700 lines)
- Smaller booking-flow screens (5 files, ~1,058 lines)
- Other customer screens (provider/[id], addresses, chat, search, suki, recurring, etc.) (~3,000 lines)
- Mobile shared services + components (push, recurring, booking-photo, catalog, review, tip) (~700 lines)

Continuing.
