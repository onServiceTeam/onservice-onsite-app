# Gate 3 — Pre-mortem — Phase 01 Design System

**Phase:** PHASE-01
**Date:** 2026-04-28

Five plausible incident scenarios where Phase 01's work breaks something in production within 6 weeks of merge. For each: trigger, blast radius, mitigation, residual risk.

---

## Incident 1 — Tailwind 4 cascade reorder breaks `Button` variant precedence

- **Trigger:** Tailwind 4's source-order cascade means caller-provided `className` wins over CVA classes. A consumer passes `className="bg-green-500"` to a `<Button variant="destructive">`. The destructive (red) gradient is silently overridden to green. Reviewer thinks the destructive style is broken.
- **Blast:** Visual regression on every Delete button overridden by ad-hoc class. Could ship a "Delete" button that looks like a confirmation in a screen we didn't visually audit (Phase 04+ hits this risk hardest).
- **Mitigation:** Add a documented rule: "Do not pass background or color classes via `className` on `<Button>`; use `variant` instead." Phase 04+ visual audits will catch ad-hoc overrides. Optionally: switch from string concatenation to `clsx` + `tailwind-merge` so conflicting utilities are resolved deterministically.
- **Residual:** Medium. Until tailwind-merge is added, ad-hoc className overrides are technically supported and easy to misuse. Tracked as a Phase 04 (admin dashboard) preview item.

---

## Incident 2 — `lucide-react@0.456.0` ships a breaking export rename in 0.457

- **Trigger:** A future lucide-react patch (e.g., 0.457.0) renames an icon (lucide has done this before — `Pencil` ↔ `Edit2` history). When Phase 02+ bumps to a newer version (or another phase forgets the `--save-exact` pin), the centralized icon module compile fails on the renamed export.
- **Blast:** Admin or mobile build breaks. Caught at compile time (typecheck gate fails). No silent runtime issue.
- **Mitigation:** Pin via `--save-exact` (already done; package.json shows `"lucide-react": "0.456.0"` exact). Add a CI guard that rejects PRs which change icon-library versions without a matching catalog update. Phase 02+ visual audit confirms every icon still renders.
- **Residual:** Low. Pin + compile-time check + visual audit cover this.

---

## Incident 3 — `react-native-svg@15.8.0` peer-dep mismatch with future React Native upgrade

- **Trigger:** When mobile bumps `react-native` from 0.83.0 to 0.84.x, `react-native-svg@15.8.0` may declare an incompatible peer range. Build fails with peer-dep error; or worse, runtime fails because native module isn't linked.
- **Blast:** Mobile app fails to start in dev or build to APK/IPA. iOS native pods fail to install.
- **Mitigation:** Phase 02 cleanup should align `react-native-svg` with the supported version table for the chosen React Native release. Add to the upgrade checklist: "When bumping RN, verify `react-native-svg` and `lucide-react-native` peer ranges."
- **Residual:** Medium. Mobile dep matrix is fragile generally (TD-003 already showed one typo'd version).

---

## Incident 4 — `class-variance-authority` removed or deprecated upstream

- **Trigger:** CVA hasn't shipped in 12+ months at time of Phase 01. If maintainer abandons the package or upstream React's compiler obsoletes runtime variant computation, our 16 primitives all depend on it.
- **Blast:** New CVA versions stop arriving. Eventually a transitive dep stops supporting it. We're stuck on a frozen version or have to migrate.
- **Mitigation:** CVA's API surface is tiny (one function). A drop-in replacement could be written in <50 lines. Documented here as a known surface-area-bet. The migration cost is bounded.
- **Residual:** Low. Bounded, well-isolated; one file (Button.tsx today) imports from CVA.

---

## Incident 5 — Radix `Dialog` portal interferes with downstream React 19 root-level features

- **Trigger:** Radix Portal renders into `document.body`. React 19's transition / suspense boundaries, plus future use of view transitions API, may not propagate transition state across portal boundaries. A user clicks "Delete" → modal opens; another action triggers a `useTransition` update; modal does not see the pending state and shows a "Confirm" button when it should be disabled.
- **Blast:** Subtle UI bugs in any phase that combines modals with `startTransition`/`useDeferredValue`. Could lead to double-submit if timing is wrong.
- **Mitigation:** When a phase combines transitions with modals, exercise the boundary explicitly in tests. Phase 07 (booking 360) and Phase 08 (financial) are most exposed because they have confirmation modals + heavy data fetches.
- **Residual:** Medium. Real risk surfaces only when the combo arises; difficult to pre-empt.

---

## Summary

The five incidents fall into three categories:

1. **Style cascade** (#1): real and immediate; address with tailwind-merge in a future phase.
2. **Dependency drift** (#2, #3, #4): bounded by exact pinning and one-file-blast indirection.
3. **Cross-cutting React 19 features** (#5): can only be discovered in actual usage; tracked for Phase 07/08 reviews.

None of these justify holding Phase 01 from merge. All are tracked for the appropriate downstream phase.
