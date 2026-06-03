# D23 — Provider staff / team members

**Status:** Decided (Ken, 2026-06-04). Built end-to-end on topic branch `feat/provider-staff` (not yet merged/deployed — awaiting Ken's cutover call).
**Owner:** AI coder, reviewed by Ken.

### Build progress (2026-06-04)

- **DONE — Phase 1 (foundation):** migration 131 (provider_staff, approval state
  machine, users.role += provider_staff, performer_staff_id on bookings+reviews),
  provider-staff.service with the pure tested state machine. ✅ tested.
- **DONE — Phase 2 (admin Staff tab):** admin endpoints (list / review / suspend)
  + the Staff tab on ProviderDetailPage with per-member performance. ✅ tested.
- **DONE — Phase 3 (provider mobile manage team):** provider endpoints (list /
  invite / remove), the mobile `provider/team` screen + profile menu entry. ✅ tested.
- **DONE — quality flow backend:** submit-for-review (so admin approval is
  reachable), assign-staff-to-booking endpoint + service, and review attribution
  (createReview copies performer_staff_id → reviews so performance rolls up to the
  provider and into the per-member breakdown). Mobile "Submit for review" button. ✅ tested.

- **DONE — Phase 4 (staff own login):** `/api/v1/staff` (my-invites, accept,
  my-jobs); `provider_staff` role added to every role union (API + mobile);
  accept-invite returns a fresh token pair so the app re-routes; mobile staff
  area (staff/jobs read-only assigned list + staff/invites accept flow); splash
  routes provider_staff → staff jobs; "Team Invitations" discovery entry on the
  customer profile. ✅ tested (render tests; SQL validated vs live schema).
- **DONE — assign-from-app UI:** booking DTO exposes performerStaffId; the active
  job screen has a "Who's doing this job?" chip row (Me + approved members) that
  assigns/reassigns. ✅ tested.

**The feature is complete end-to-end on the branch.** Two real bugs were caught
and fixed during integrity checks: a singular-vs-plural API path mismatch in the
mobile staff calls, and `u.full_name` (a nonexistent column) in two queries — both
verified against the live schema.

### Not yet done (intentional, post-merge ops)

- The branch is **not merged to master and not deployed.** Merging means applying
  migration 131 + rebuilding the API image + redeploying admin and mobile-web —
  recommend one clean cutover (Ken's call).
- Staff **job execution** (a member updating status / uploading photos on their
  assigned job) is out of scope for this slice — the staff view is read-only.
- Invite delivery is in-app discovery (the invited person finds it under their
  profile via phone/email match). SMS/email invite links are a future enhancement.

## The ask (Ken, 2026-06-04)

A provider can add a staff / team member. Two decisions Ken made:

1. **Staff get their own login.** A team member is a real platform user with their
   own account, not just a name attached to the provider. (Bigger build: auth,
   invite flow, a scoped staff app surface.)
2. **Performance counts fully toward the provider.** Reviews/ratings for jobs a
   team member performs roll up into the provider's overall account quality the
   same as the provider's own work, AND admin gets a per-member breakdown so
   back-office can spot a weak member.

Plus the standing quality requirement: **any professional added to the platform
is manually reviewed/approved by onService back-office before they can work**, and
everything is reviewable in the admin provider-controls area.

## Why this is a multi-increment build

The codebase today has **no** concept of staff: providers are 1:1 with a single
user (`providers.user_id`), bookings capture only `provider_id`, reviews attach
only to `provider_id`, and `users.role` is `('customer','provider','admin',
'super_admin')`. So this touches: a schema migration, a new user role + auth
scoping, an invite/approval flow (mirroring provider onboarding), job assignment,
review attribution, a quality rollup, an admin review tab, and mobile surfaces for
both the provider (manage team) and the staff member (their assigned jobs).

It is money/quality-path-adjacent and adds an auth surface, so per CLAUDE.md it is
built on a **topic branch** and merged in reviewable increments, not pushed
straight to master.

## Data model

### New table `provider_staff`
Links a user (the team member's own account) to a provider, with an approval
state machine that mirrors the existing provider onboarding/verification pattern
(`providers.status` + `provider_onboarding_progress.admin_decision`).

- `id` UUID PK
- `provider_id` UUID FK → providers(id) ON DELETE CASCADE
- `user_id` UUID FK → users(id) ON DELETE CASCADE (the staff member's own login)
- `role_title` VARCHAR(100) — e.g. "Aircon technician", "Cleaner"
- `status` VARCHAR(20) CHECK IN ('invited','pending_review','approved','rejected','suspended','deactivated')
  - `invited`: provider invited, member hasn't accepted/signed up yet
  - `pending_review`: member accepted + submitted docs; awaiting back-office
  - `approved`: cleared by back-office; can be assigned jobs
  - `rejected` / `suspended` / `deactivated`: cannot work
- `invited_by` UUID FK → users(id) (the provider owner who invited)
- `invite_phone` / `invite_email` — contact used for the invite (before the user exists)
- `submitted_for_review_at`, `admin_reviewer_id`, `admin_decision` ('approved'|'rejected'|'sent_back'), `admin_decision_at`, `admin_decision_reason`
- per-member metrics (advisory breakdown, NOT a second source of truth for the provider score): `rating`, `total_jobs`, `total_reviews`
- `created_at`, `updated_at`
- UNIQUE (provider_id, user_id); index on (provider_id), (status), partial index on pending review

### Staff documents
Reuse the proven `provider_documents` pattern keyed to the staff member. Simplest:
a `provider_staff_documents` table mirroring `provider_documents` (NBI/govt-ID/selfie,
status enum). Deferred until Phase 4 if Phase 2 admin review can start with just the
member's profile + provider attestation.

### Booking attribution
`ALTER TABLE bookings ADD COLUMN performer_staff_id UUID REFERENCES provider_staff(id) ON DELETE SET NULL`.
NULL = the provider owner performed it (backward compatible). `provider_id` stays the
account that holds the job; `performer_staff_id` records who actually did it.

### Review attribution + rollup
`ALTER TABLE reviews ADD COLUMN performer_staff_id UUID REFERENCES provider_staff(id) ON DELETE SET NULL`.
- **Full rollup is automatic**: the provider's headline rating already aggregates
  `AVG(rating) WHERE provider_id = X`, which includes staff-performed jobs regardless
  of `performer_staff_id`. No change needed to the provider score path → Ken's
  "counts fully toward the provider".
- **Per-member breakdown** for admin: `AVG(rating), COUNT(*) ... WHERE performer_staff_id = S`.

### Auth
`users.role` CHECK extended to include `'provider_staff'`. A staff login is scoped:
they see/act on bookings where `performer_staff_id` = their staff row (assigned to
them) only; they cannot touch the provider's payouts, business profile, team, or
unassigned jobs. This scoping is enforced in the provider route guards.

## Approval flow (mirrors provider onboarding)

1. Provider owner invites a member by phone/email (status `invited`).
2. Member signs up (or links an existing user); role `provider_staff`; submits ID docs (status `pending_review`).
3. Back-office reviews in the admin **provider detail → Staff tab** (new), approves/rejects/sends back — same controls + `admin_actions` audit as provider approval.
4. On approve (status `approved`), the member can be assigned jobs by the provider.
5. Suspension/deactivation available to back-office at any time.

New `admin_actions` types: `provider_staff_invited`, `provider_staff_submitted`,
`provider_staff_approved`, `provider_staff_rejected`, `provider_staff_suspended`,
`provider_staff_reactivated`.

## Job assignment + dispatch interaction

- The matching/auto-dispatch engine is unchanged — it matches the **provider account**.
- After a job is the provider's, the provider assigns it to an approved staff member
  (sets `performer_staff_id`). The staff member sees it in their scoped app.
- A staff member must be `approved` to be assignable (enforced server-side).

## Phased build plan

- **Phase 1 — foundation (this increment):** migration (provider_staff,
  performer_staff_id on bookings+reviews, role enum), `provider-staff.service.ts`
  (CRUD + approval state machine, pure-tested), no UI/auth wiring. Lands on the
  topic branch with real tests.
- **Phase 2 — admin Staff tab:** review queue + approve/reject/suspend + per-member
  performance on ProviderDetailPage; admin API endpoints. (Back-office can start
  reviewing.)
- **Phase 3 — provider mobile:** invite + manage team screen; assign a job to a staff
  member.
- **Phase 4 — staff auth + mobile:** invite-accept / signup, `provider_staff` role,
  scoped route guards, the staff member's "my assigned jobs" surface, staff docs.
- **Phase 5 — attribution + rollup wiring:** set `performer_staff_id` at assignment /
  completion; review carries it; per-member breakdown queries surfaced in admin.

## Open sub-decisions (defaulting unless Ken says otherwise)

- **Staff payouts:** v1 assumes the provider pays their own staff **off-platform**;
  onService pays the provider account as today. (No per-staff payout/wallet in v1.)
- **Multi-provider staff:** v1 assumes a staff member belongs to **one** provider at
  a time (UNIQUE provider_id+user_id still allows different providers historically,
  but the active app flow is single-provider). Revisit if needed.
- **Commission/tier:** staff inherit the provider's tier/commission; no separate
  economics.

If Ken disagrees with any default above, it changes Phase 4/5, not the Phase 1
foundation.
