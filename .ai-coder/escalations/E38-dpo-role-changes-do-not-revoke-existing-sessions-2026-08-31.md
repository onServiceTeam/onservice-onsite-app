# E38: DPO role changes do not revoke existing sessions

**Date:** 2026-08-31
**Severity:** High privacy authorization risk
**Status:** Open hard stop for DPO role-transition changes
**Found during:** Admin Staff & Roles W13 audit

## Bad news first

The Staff & Roles page can change an active account from `admin` to `dpo`, or
from `dpo` to `admin`, `customer`, or `provider`. The database row and the
explicit `admin_actions` record change in one transaction, but the transition
does not revoke any existing access token, refresh-token row, admin CSRF token,
or browser session.

Access tokens contain the role that existed when the token was issued and are
accepted from the signed claim. Admin-tier access tokens currently last 15
minutes. Refresh rotation does reload the current user row and therefore mints
the next token with the current role, but the old access token remains usable
until it expires. The role-change service does not force that rotation or
delete the existing refresh-token rows.

E34 separately establishes that the DPO route and page matrix is incomplete.
Therefore neither promotion nor removal can currently guarantee the intended
privacy-only boundary, even after the old access token expires.

## Why this is a hard stop

- A promoted DPO can retain their former general-admin token authority during
  the access-token window.
- A removed DPO can retain DPO token authority during the same window.
- A database-role update is currently presented as a handover control even
  though it is not an immediate session or route-boundary control.
- Adding one token deletion inside the service is insufficient because signed
  access tokens are stateless and E34 has not resolved the target route matrix.
- Demoting a DPO into a customer or provider persona can cross operational and
  marketplace account boundaries and needs an explicit migration and ownership
  policy, not a page-local default.

## Safe containment completed in W13

The Staff & Roles page now states that DPO route segregation is incomplete,
that existing tokens are not revoked, and that operators must not promise an
immediate access change. The removal dialog no longer claims that the action
immediately removes route access. No authorization, user role, token, or
production row was changed by W13.

## Recommended correction

Resolve this together with E34 in a dedicated security and privacy wave:

1. Approve the complete `dpo`, `admin`, and `super_admin` route/action matrix.
2. Decide whether DPO is a dedicated account identity or whether reversible
   cross-role promotion remains allowed. Do not default DPO removal to a
   customer or provider persona without that decision.
3. Add a canonical account-session version or equivalent immediate-revocation
   mechanism that every protected request enforces.
4. In the same locked role-transition transaction, revoke all refresh tokens
   and admin CSRF tokens and advance the session version.
5. Return a transition result that reports the prior role, next role, and
   revoked-session count without exposing token material.
6. Add executed tests proving that an old access token and old refresh token
   fail after promotion and removal, while a newly authenticated session has
   exactly the approved route access.
7. Require the documented personnel, NPC, evidence-custody, and replacement
   handover steps before the transition is enabled in production.

## What is not authorized by this record

- Do not broaden `requireAdmin`, `requireDpoRole`, or page navigation as a
  shortcut.
- Do not claim refresh-token deletion alone invalidates already-issued access
  tokens.
- Do not change a production DPO role or session while E32 blocks verified
  server identity and E34 remains unresolved.
