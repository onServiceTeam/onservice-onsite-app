# Gate 3 — Future Bugs (Phase 09)

## Known limitations carried forward

1. **Promo code redemption not wired to checkout** — `apps/mobile/app/customer/booking/checkout.tsx` does NOT read `promo_codes` yet. Backlog item: add promo apply step in checkout (Phase 10 or 11).
2. **Per-customer usage limit unenforced** — schema has `usage_limit_per_customer` but no `promo_redemptions` table to track. Add in Phase 10.
3. **Campaign auto-attribution missing** — first-touch / last-touch attribution from `referrer_code` on signup is not implemented. Manual entry only.
4. **Background check is stubbed** — UI ready, but no `nbi_clearances` table or service. Provider always sees "pending".
5. **Identity verification has no server-side blur/glare detection** — only client-side size check.
6. **Service-area + skills POST endpoints assumed to exist** — if not, mobile shows Alert and user re-tries. Confirm endpoints in Phase 10 provider service consolidation.
7. **`navigate.tsx` "Mark Arrived" endpoint** — may need to be added to bookings routes.
8. **No e2e tests for any mobile screen** — only typecheck. Future Detox/Playwright suite (Phase 12).
9. **Live chat support** screen NOT built (Batch 09d) — deferred; spec says use Messenger or chat link from help-center.
10. **OAuth linked_accounts** screen NOT built — explicitly deferred per spec.
11. **Marketing dashboard date filter** — UI lets admin pick a `from`/`to`, but `getMarketingOverview` does the filter at the campaign-row level (started_at within window), NOT per-day spend allocation. This is intentional simplification.

## Things that WILL bite later
- `MarketingPage.tsx` chunk is 21.13 kB gzipped — fine for now but as it grows past 50 kB consider splitting modals into separate lazy chunks.
- `checklist.tsx` hardcodes a sample 4-category cleaning checklist regardless of booking category. A future change should fetch the category-appropriate template from `service_categories.checklist_template` (column doesn't exist yet — add in Phase 10).
- `skills.tsx` hardcodes 12 categories. Should pull from `service_categories` table once that endpoint exists.
- Mobile screens make best-effort POSTs — silent network failures will look like "saved" until user refreshes. Add toast notifications and pull-to-refresh in a polish phase.
