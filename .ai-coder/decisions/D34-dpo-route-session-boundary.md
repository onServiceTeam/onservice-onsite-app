# D34 - DPO route and session boundary

**Date:** 2026-08-31  
**Status:** APPROVED by Ken's standing instruction to make the recommended decision and continue  
**Resolves:** E34 and E38 when the implementation and behavioral gates below are complete

## Problem

The current `dpo` account role is neither a complete privacy workspace nor a
real segregation boundary:

- a DPO can open general marketplace, support, money, tax, staff, and settings
  pages in the admin client;
- DPO login lands on a dashboard whose API rejects the role;
- consent and breach routes accept the DPO while most DSR routes reject it;
- a DPO role change updates `users.role` but leaves access tokens, refresh
  tokens, CSRF records, and connected sockets usable under the old role;
- the DPO removal flow can move a privileged internal identity directly into a
  customer or provider persona.

Changing only the navigation or widening one API allowlist would preserve the
underlying security defect.

## Decision

### 1. The DPO is a dedicated internal account identity

- A DPO appointment can promote only an active `admin` account.
- Removing the appointment always returns that same identity to `admin`.
- The flow never converts a customer, provider, provider staff member, or super
  admin into DPO, and never demotes a DPO into an external persona.
- Super admin retains fallback privacy authority and is not converted to DPO.

This avoids hidden provider/customer data and ownership relationships surviving
an internal-role conversion.

### 2. Privacy work has its own client and API boundary

The DPO client can reach:

- `/privacy` as its landing page;
- `/data-protection-log` for DSR intake and decisions;
- `/consent-versions` for consent history and publishing;
- its own password, account, and logout controls.

The DPO cannot reach marketplace operations, customer/provider support,
bookings, communications, payments, payouts, catalog, marketing, tax, general
audit, staff, or settings routes. Super admin can reach both privacy and general
operations. Plain admin does not receive privacy-record access.

The DPO API owns consent reads, DSR list/detail/status/actions/alerts, consent
versions, and the existing breach-log actions. General audit export, BIR/tax, platform
operations, and privileged-account management remain admin/super-admin work as
otherwise defined by their routes.

No new breach-log client screen ships under this decision. Its classification,
workflow, and deadline wording are held by E40 for privacy-counsel review. D34
determines who may call the already-existing privacy API; it does not decide
whether a given incident is legally reportable. The privacy home therefore does
not label incidents as notice-pending or display the current unconditional
72-hour calculation.

### 3. Protected requests use canonical account state

Migration 158 adds `users.session_version`, defaulting existing accounts to 1.
Access, refresh, and admin pre-auth tokens carry that version. For compatibility,
an older token without the claim is interpreted as version 1 only.

Every protected HTTP request and authenticated socket handshake must reload the
account's current `role`, `is_active`, and `session_version`. The request fails
closed when the account is missing/inactive, the role differs, or the token
version differs. This makes a DPO role change permanent through generation
revocation and makes an account reject requests while it remains inactive.
General account-lifecycle revocation and reactivation invariants remain E39.

### 4. Role handover revokes all old credentials atomically

A DPO promotion or removal runs in one database transaction that:

1. locks and validates the account and singleton DPO seat;
2. changes the role and increments `session_version`;
3. deletes every refresh-token row for the account;
4. revokes every active admin CSRF token;
5. records the before/after roles, new generation, and revocation counts in the
   existing admin action.

After commit, the API disconnects all sockets for that user. A failed
transaction leaves both the role and credential state unchanged.

### 5. Admin session duration is one truthful contract

Admin refresh JWTs, refresh cookies, and the client-visible expiration use
`platformConfig.adminSessionTimeoutHours` (currently 8 hours). Access and CSRF
cookies keep the shorter 15-minute cap. The implementation must not describe or
depend on a nonexistent `admin_sessions` table.

Customer, provider, and provider-staff refresh duration remains on the existing
mobile-session policy.

## Rejected alternatives

1. **Navigation-only hiding.** Direct URLs and API calls would still cross the
   privacy boundary.
2. **Delete refresh tokens only.** Existing access JWTs and sockets would keep
   old authority until expiry/disconnect.
3. **Global token blacklist.** It adds a hot-path store and per-token lifecycle
   complexity when an account generation provides the required immediate,
   auditable boundary.
4. **Allow DPO-to-customer/provider conversion.** Internal and external personas
   have different data ownership and lifecycle rules. Mixing them creates a
   later cleanup and authorization trap.

## Required evidence before closing E34/E38

- old access and refresh tokens fail after a DPO transition;
- current-version tokens work and inactive/role-mismatched accounts fail;
- refresh, CSRF, and socket revocation are demonstrated;
- admin, super-admin, and DPO route/API matrices are behaviorally tested;
- direct client URLs redirect to the correct role home;
- the privacy home, DSR, and consent surfaces render at desktop and tablet
  widths; breach UI evidence remains held under E40;
- focused API/admin suites and all repository gates pass.

This decision does not resolve E39. Governed creation, activation,
deactivation, recovery, two-person approval, and last-super-admin invariants
remain a separate privileged-account lifecycle wave built on this session
generation foundation.
