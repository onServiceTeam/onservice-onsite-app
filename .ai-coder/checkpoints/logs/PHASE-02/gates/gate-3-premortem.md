# Pre-Mortem — PHASE-02 (Icon Replacement)

It is six months from now. Phase 02 was the source of an incident. What happened? Five plausible scenarios, each with trigger / blast radius / mitigation / residual risk.

## Incident 1 — Bundle bloat from un-tree-shaken lucide imports

- **Trigger:** A developer adds `import * as Icons from '@/components/icons'` (or `import { Icons } from '@/components/icons'` with an indirection that defeats tree-shaking) in a hot mobile screen. The 174-symbol re-export file becomes a single Metro chunk and ships as ~120 KB of unused SVG paths.
- **Blast:** Mobile bundle grows by ~100 KB; cold-start time on low-end Android (Cherry Mobile, etc.) regresses by 200–400 ms.
- **Mitigation:** Metro tree-shakes named imports correctly when the re-export is `export { X } from '...'` (which is what we use). The risk only materializes if a future commit changes the re-export style to `export * from '...'`.
- **Residual:** Add an eslint guard (`no-restricted-syntax` for `import * as ... from '@/components/icons'`) in Phase 03 or whichever phase ships the lint config tightening.

## Incident 2 — Stale custom-icon style leaking spacing bugs

- **Trigger:** Files that previously had `<Text style={styles.emptyIcon}>EMOJI</Text>` retained the `emptyIcon` style entry alongside the new `emptyIconWrap`. A future contributor accidentally references the old `styles.emptyIcon` (font-size 48) on a non-text element, getting unintended scaling.
- **Blast:** A single screen renders an oversized (48 px font-size on a non-text element) layout glitch. Visual only, no data corruption.
- **Mitigation:** This phase deleted the now-unused `emptyIcon` styles wherever no consumer remained. A handful of files retain both `emptyIcon` and `emptyIconWrap` because the diff complexity wasn't worth removing the orphan. typecheck does not catch unused style entries.
- **Residual:** Add `eslint-plugin-react-native/no-unused-styles` enforcement in a future cleanup phase. Until then, the residual risk is "unused style line of code" — cosmetic, not behavioral.

## Incident 3 — Fallback icon misleads a customer

- **Trigger:** A new notification or transaction type ships from the API (e.g., `referral_credit`) without being added to the `Record<string, IconComponent>` map. The fallback (`Bell` for notifications, `CreditCard` for transactions) renders.
- **Blast:** A user sees a credit-card icon next to a referral-credit message. The message text is correct; the icon is misleading. Could erode trust on a transactional surface (wallet).
- **Mitigation:** The notification/transaction service tests exhaustively assert known type strings. A contract test could pin "every known type has an icon entry" but Phase 02's scope did not include adding such a test.
- **Residual:** Add a unit test in Phase 04 (auth & onboarding, when notification flows mature) asserting that for every notification type emitted by the API, the customer + provider notification screens have an icon entry.

## Incident 4 — `lucide-react-native` upgrade removes an icon name

- **Trigger:** A future phase upgrades `lucide-react-native` past `0.456.0`. lucide periodically renames icons (e.g., `BarChart3` → `BarChart`) or removes deprecated aliases. Our 174-name re-export module breaks at typecheck.
- **Blast:** Mobile typecheck fails. The phase doing the upgrade halts until the rename mapping is applied. No production impact (we'd never deploy a broken build).
- **Mitigation:** package-lock.json pins exact versions. Upgrades require explicit work. The re-export file's typecheck signal is loud and immediate.
- **Residual:** Document a rename-table when next upgrading. No code change needed now.

## Incident 5 — Visual gate accepting low-quality screenshots

- **Trigger:** Phase 02's visual gate PASSED with five screenshots that all show the unauthenticated admin landing page, not the icon work itself. A future phase reviewer assumes "visual gate PASS = visual evidence of feature correctness" and trusts the gate without inspecting the report.
- **Blast:** A future phase ships UI regressions undetected because the gate's heuristic (≥4 PNGs + REPORT.md exists) doesn't validate screenshot content.
- **Mitigation:** This phase's `visual/REPORT.md` and `HONESTY-CHECK.md` both explicitly disclose the limitation. `gate-3-future-bugs.md` (this phase) carries this forward as the most-likely 2-week bug source for visual confidence.
- **Residual:** Phase 04 (when an authenticated admin surface ships) must establish a Playwright fixture with seeded credentials. The gate harness should be tightened to require the screenshots' SHA differs from a known empty-shell screenshot — but that's a harness change, owned by a future TD.

---

Each scenario is plausible. Each has a documented mitigation that already lives in the codebase or is named in the deferred-items section of the manifest. None require Phase 02 to do additional work *now*; all are properly logged for the phase that owns them.
