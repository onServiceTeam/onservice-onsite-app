# Decisions for Ken

One page that collects everything in this handbook that needs your call, plus a few real issues in the app that the writers found while cross-checking the code. Settle these and the handbook stops being "proposed" and becomes "how we run."

Two kinds of items:
- **DECIDE** items are choices only you can make (brand, money rules, staffing, thresholds).
- **FIX/VERIFY** items are real gaps or inconsistencies in the app that ops would trip over. I can act on these once you say go.

---

## A. Brand and strategy (from doc 01)

- [ ] **Mission.** Pick one of three candidates in `01` §2. My pick: #2 ("replace the risk of hiring a stranger with ID-verified pros, held payments, and real accountability").
- [ ] **Vision.** Pick one of three in `01` §3. My pick: #1 (Cebu first, every major city).
- [ ] **Core values.** Confirm or edit the five proposed in `01` §5. Add a sixth or seventh if you want (keep it to 7).
- [ ] **Company purpose.** Confirm the one-line purpose in `01` §4 or rewrite it.

## B. Operating model (from docs 02, 06, 07)

- [ ] **Support model.** In-house vs hybrid vs outsourced. My recommendation: in-house for the Cebu launch, move to hybrid when volume passes two agents. Money actions always stay with super-admin staff.
- [ ] **Support channels to staff first.** Recommendation: email + Facebook Messenger at launch, add phone/SMS later. (Filipino customers expect Messenger.)
- [ ] **Support hours.** Recommendation: Mon to Sat, 8am to 8pm PHT at launch.
- [ ] **Support hotline.** Provision a real number, or remove the placeholder (`+63 2 8123 4567`) from the app before launch. (See FIX item F4.)
- [ ] **Pay bands** for the lean hires (set against Cebu market rates). The handbook does not set salaries.
- [ ] **Who holds super-admin** accounts and how many. Recommendation: you plus one ops lead only.
- [ ] **Surge pricing posture** at launch (doc 11). Recommendation: launch with surge off.

## C. Money and policy thresholds (from docs 03, 04, 05, 09, 10, 12)

- [ ] **Referral incentive amounts** (doc 03). Recommendation: ₱500 to the referrer, ₱300 welcome bonus to the new provider, paid after the new provider completes 3 jobs, capped at 10 per referrer per month.
- [ ] **Refund sign-off threshold** (doc 09). No threshold exists today. Recommendation: refunds over ₱10,000, every refund-with-suspension, and every damage/theft payout get your (super-admin) review.
- [ ] **No-provider refund rule** (doc 08). Confirm that a platform-side no-provider failure is a clean 100% refund, and whether to add a ₱100 to ₱200 goodwill credit on top.
- [ ] **NBI expiry handling** (doc 04). Auto-suspend on expiry, or manual chase then manual suspend? Doc defaults to manual chase for launch.
- [ ] **Provider TIN timing** (doc 05). Require at onboarding, or before first payout? (Needed before a provider reaches ₱500,000 YTD for BIR withholding.)
- [ ] **Guarantee-fund claim rules** (doc 09). No written rule for when the 1.5% guarantee fund pays a damage claim (per-claim cap, eligible damage, evidence, provider clawback). Needs your rules.
- [ ] **Area go-live rule** (doc 03). Hold an area at soft-launch until each launch category has 8 to 12 providers, or flip to active at the 5-provider floor? Recommendation: 5 per category to soft-launch, 8 in the lead category to go active.
- [ ] **CSAT capture** (doc 12). Build CSAT into the ticket system, or run a manual post-resolution survey at launch?

## D. Real app issues the handbook found (FIX / VERIFY)

These came up because the writers checked the code, not just wrote prose. I have not fixed them yet. I would want to verify each in the code before acting, and a couple touch money so they would follow the same topic-branch-plus-PR path as the instant-pay fix.

- [ ] **F1. Two cancellation/refund systems disagree (money path).** The live refund calculation and the cancellation policy shown to users appear to use different refund brackets (for example, a 2-to-24-hour cancellation reportedly computes 100% in one and 75% in the other). If true, support would quote the wrong number and customers could be refunded inconsistently. **I should verify this and, if real, reconcile the two to one source of truth.** This is the highest-priority item in this section.
- [ ] **F2. Guarantee-fund base mismatch (money path).** The 1.5% guarantee-fund amount may be computed off a different base in `commission.service` than in `escrow.service`. If true, the books and the wallet drift. Needs verification, then alignment with an accountant's sign-off on which base is correct.
- [ ] **F3. Granular admin roles do not gate the app.** The roles `support_agent`, `finance`, and `moderator` exist as data, but the live permission gate is the single `users.role` value (`super_admin` / `admin` / `dpo`). So anyone with `admin` can reach money actions (escrow refund, payouts). For real segregation of duties (a support agent who cannot issue refunds), the granular roles need to actually gate the routes. Decide whether to wire this before or after launch. **Recommendation: before launch, at least for the money actions.**
- [ ] **F4. Placeholder support hotline in the app.** `+63 2 8123 4567` is hardcoded as the support number in the customer and provider apps. Replace it with a real number or remove it before testers and customers see it.
- [ ] **F5. Instant-pay (E03) not merged.** Already in motion: the fix is on branch `fix/e03-instant-pay-money-path` (PR #44), awaiting your go to merge and deploy. Until it merges, checkout still errors on "Pay," and several docs note not to promise customers or providers that bookings are always prepaid. This is the same decision you already approved in direction; it just needs the merge.

---

## How to use this page

Go top to bottom. For each DECIDE, write your answer next to it (or tell me and I will update the docs in place and remove the callout). For the FIX/VERIFY items in section D, tell me which to investigate and I will check the code and report back before changing anything that touches money.
