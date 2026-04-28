# Phase 05 — Future Bugs

The single bug most likely to surface within 2 weeks of shipping Provider 360,
plus the next-most-likely candidates.

## #1 (most likely): Activity tab returns no login rows for newly registered providers

**Why:** `getProviderActivity` keys `login_attempts` by `users.phone`. New
providers go through OTP signup that may write to `login_attempts` BEFORE
their `users` row is created (depending on signup flow). For brand-new
accounts, the JOIN can miss rows because the phone format differs by a
single character (e.g., E.164 vs national format).

**How it surfaces:** Admin opens Activity tab on a provider who just
verified — sees only audit entries, no login history. Looks like a bug
("provider can't log in?") but the data exists in the table under a
slightly-different phone string.

**Mitigation now:** HONESTY-CHECK documents the phone-keyed JOIN.

**Mitigation later (Phase 09+ stitching):** Add `user_id` column to
`login_attempts` and backfill via the matching phone, then change the JOIN.

---

## #2: ProvidersPage breaks navigation when row name is missing

The `<Link>` wraps `r.fullName?.trim() || r.businessName || '(no name)'`.
If both are empty strings, the link still navigates but shows "(no name)"
— admins may accidentally drill into the wrong provider. Add a defensive
fallback to `r.id` slice in a follow-up.

---

## #3: Wallet adjustment input edge: pesos → centavos rounding

The frontend collects PHP pesos and converts via `Math.round(parseFloat(amountPesos) * 100)`.
For unusual inputs like `0.105`, JavaScript yields `10.500000000000002` →
rounds to 11 centavos instead of 10. Validation on the server only requires
non-zero integer, so the off-by-one slips through. Low impact (1 centavo)
but visible in audit. Fix later by accepting integer centavos in the UI or
using `decimal.js` on the client.

---

## #4: Notes textarea allows extremely large bodies

The DB column is `TEXT` (unbounded). A single 10MB note would slow the
Notes tab page-load and fill the JSON response. Add a server-side length
cap (e.g., 10_000 chars) in the next phase.

---

## #5: react-query stale data after wallet adjustment

The financials query is invalidated on success of `adjustProviderWallet`,
but the parent page header (showing wallet via separate profile query)
isn't refetched. Admin sees fresh totals but stale header. Fix by also
invalidating `['admin-provider-profile', id]`.
