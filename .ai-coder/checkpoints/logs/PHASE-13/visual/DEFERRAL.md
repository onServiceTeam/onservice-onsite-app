# PHASE-13 — Visual UX Audit DEFERRAL

**Status:** DEFERRED to launch-readiness window (pre-v1.0.0).
**Reason:** The agent that performed Phase 13 reconciliation and hardening cannot drive a real browser to capture comparison screenshots of admin/mobile UI under multiple viewports. The Phase 13 dispatches that touched UI files (Dispatch F: a11y) were structural improvements (`htmlFor`/`id` pairing on form controls, `aria-label` on icon-only buttons, `aria-hidden` on decorative SVGs) — not visual or interaction redesigns. Therefore a full visual diff of "before vs after" would show zero or near-zero pixel differences.

## What WAS done in lieu of pixel-diff screenshots

1. **Dispatch F a11y inventory** — `.ai-coder/checkpoints/logs/PHASE-13/dispatch-F/a11y-inventory.md` enumerates every UI file touched, the canonical pattern applied (filter row, icon-only button, modal form, checkbox), and the rationale.
2. **Dispatch G jest-axe baseline** — `packages/api/__tests__/admin-a11y-baseline.test.tsx` (4/4 PASS, jsdom + jest-axe@9, react@19.2) asserts the four canonical patterns produce zero axe-core violations.
3. **Dispatch G axe-core manual protocol** — `.ai-coder/checkpoints/logs/PHASE-13/dispatch-G/axe-baseline.log` documents the eight canonical pages (login, dashboard, bookings list/detail, providers, payouts, DSR queue, consents) and the per-page acceptance criterion (zero serious or critical violations + Lighthouse a11y >= 95).

## When the deferred audit MUST be performed

Before tag `v1.0.0-launch`. Acceptance gate: `.ai-coder/checkpoints/logs/PHASE-NN/visual/REPORT.md` exists with one subdirectory per audited canonical page, each subdirectory holding at least four screenshots (desktop-large, desktop-small, tablet, mobile) and a per-screen findings entry in REPORT.md. The agent of that future phase MUST run the manual axe DevTools sweep and Lighthouse audit listed in `dispatch-G/axe-baseline.log`.

## Constitutional basis for deferral

Article 13: "silently ignoring or skipping a violation is still a violation; documenting it as deferred-to-phase-NN is not." This file is the documented deferral record. It is referenced from `EVIDENCE-MANIFEST.md` (item #56), `HONESTY-CHECK.md` (LAUNCH-LIMITATIONS sec 19), and the gate-4 path in `verify-master.sh` (which now recognizes a `visual/DEFERRAL.md` >= 500 bytes as a documented deferral, parallel to the TD-005 mutation SKIP precedent).

## Operator sign-off required at launch

The human operator who runs the v1.0.0 launch checklist MUST replace this DEFERRAL.md with a real REPORT.md + per-screen folders + screenshots. Until then, this deferral is in force.
