# Escalation E23 — production demo-fixture cleanup

**Date raised:** 2026-08-24
**Status:** OPEN — production-data cleanup requires an approved backup and deletion plan

## Bad news first

`scripts/server/02-deploy.sh` ran every file in `packages/api/seeds/` on a
server install even when `ENABLE_TEST_FIXTURES=0`. The shared live database
currently contains:

- 12 accounts matching the committed seed phone/email identities;
- 120 bookings whose description starts `[demo]`;
- 96 reviews whose comment starts `[demo]`;
- 96 total rows in `reviews`, meaning every current marketplace review is a
  generated fixture rather than an organic customer review.

The demo-history seed also recalculates five provider ratings/job totals from
those generated rows. These records can affect customer trust, provider search,
admin analytics, escrow/booking queues, and provider dashboards.

## Safe containment completed

The deployment script now applies no SQL fixture unless the protected server
environment explicitly sets `ENABLE_TEST_FIXTURES=1`. The production template
and verifier require `0`, with a behavioral regression test.

## Why cleanup is paused

Deleting the seeded users cascades through wallets, providers, bookings,
reviews, messages, and potentially later test activity. Some seeded accounts
may also have been used for manual testing after installation. A broad delete
could remove evidence or records no longer distinguishable solely by a seed
phone number. This is a production-data hard stop under `AGENTS.md`.

## Decision and evidence needed

Approve a cleanup window after a fresh database/uploads/config/git backup and
answer whether historical manual testing performed through the 12 seed
accounts must be preserved. The cleanup script should then:

1. inventory every foreign-key row linked to the exact 12 seed user IDs and
   five known provider IDs;
2. classify rows as generated (`[demo]`, committed fixture identity/UUID) or
   later manual activity;
3. export the removal set to a restricted audit artifact;
4. delete in one reviewed transaction or quarantine/deactivate where deletion
   would damage evidence;
5. recompute provider aggregates from remaining organic data;
6. verify customer search, financial totals, admin analytics, booking queues,
   and review counts before commit;
7. retain a tested rollback path from the backup.

Do not advertise ratings/reviews from this database as real customer testimony
while E23 remains open.
