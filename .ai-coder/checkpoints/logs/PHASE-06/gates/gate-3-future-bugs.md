# Phase 06 — Future Bugs

The single bug most likely to surface within 2 weeks of shipping Customer 360,
plus the next-most-likely candidates.

## #1 (most likely): Activity tab returns no login rows after a phone change

**Why:** `getCustomerActivity` keys `login_attempts` by `users.phone`.
Customer-side flows allow phone-number changes (the schema has no
`phone_history` table). Once the phone changes, the JOIN
`login_attempts.phone = users.phone (current)` returns 0 historical login
rows even though those logins really happened — the rows still exist in
`login_attempts` under the OLD phone string.

**How it surfaces:** Admin opens Activity tab on a customer who recently
updated their number — sees only audit + admin_action entries, no login
history. Looks like a bug ("we lost their device history") but the data
exists in the table under a stale phone string.

**Mitigation now:** HONESTY-CHECK documents the phone-keyed JOIN.

**Mitigation later (Phase 09+):** Add `user_id` column to `login_attempts`
and backfill via the matching phone, then change the JOIN.

---

## #2: Wallet credit input edge: pesos → centavos rounding

The frontend collects PHP pesos and converts via
`Math.round(parseFloat(amountPesos) * 100)`. For unusual inputs like
`0.105`, JavaScript yields `10.500000000000002` → rounds to 11 centavos
instead of 10. Server-side validation only requires a non-zero integer, so
the off-by-one slips through. Low impact (1 centavo) but visible in the
audit ledger. Fix later by accepting integer centavos in the UI or using
`decimal.js` on the client.

---

## #3: Fraud-pattern banner timezone drift

Detection uses `Date.now() - 30 * 24 * 60 * 60 * 1000` as the cutoff. The
DB stores `created_at` in UTC. On the boundary day, a dispute filed at
22:00 PHT (14:00 UTC) "yesterday-30d" may sit on the wrong side of the
cutoff depending on when the API request fires. Effect: a borderline 5th
dispute might be excluded for ~10 hours, missing the flag, then re-included.
Cosmetically jittery but does not cause data loss. Fix later by anchoring
the cutoff to `NOW() - INTERVAL '30 days'` in SQL.

---

## #4: react-query stale data after wallet credit

The payments query is invalidated on success of `creditCustomerWallet`,
and the profile query is also invalidated. But if a future admin opens a
*second* tab to the same customer, the second tab's queries are NOT
invalidated by the first tab's mutation. Admins comparing two windows may
see stale balances in the older tab. Fix later via a websocket / polling
nudge or a "Last refreshed N seconds ago" indicator.

---

## #5: Suki tier visual hint mis-classifies "premium" tier

The Suki Providers table renders `<Badge variant={s.tier === 'super_suki'
? 'success' : 'info'} />`. If a future migration adds a 'premium' or
'platinum' tier, those will render as the generic 'info' variant rather
than escalating to 'success'. Cosmetic only. Fix later by switching to a
tier→variant map.
