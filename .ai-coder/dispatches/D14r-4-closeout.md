# Remediation #4 (scaffold) — Admin Playwright visual specs

Branch: `phase/14r-4-admin-playwright`
Tag (after merge): scaffold-only PR — `v0.14.1-remediation-4` applies after baseline capture per `.ai-coder/handoff/F4-playwright-baseline-capture.md`.
Audit reference: Finding #4 in `.ai-coder/PHASE-14-REMEDIATION-MASTER-INSTRUCTION.md` lines 210-289.

<!-- gate-b: no-bugs-this-dispatch -->

## What this PR ships

- **29 Playwright spec files** committed under `apps/admin/tests/visual/<page-slug>.spec.ts`, one per admin page in `apps/admin/src/pages/`.
- Each spec captures **4 states** (default / loading / empty / error) at **3 viewport widths** (1280, 1440, 1920) = 12 screenshots per page = up to **348 total baselines**.
- API mocking via `page.route('**/api/v1/admin/**', ...)` so each spec triggers state behaviour without backend fixtures.
- **Generator script** (`scripts/dev/generate-playwright-specs.py`) so the scaffolding can be regenerated when admin pages change.
- **Handoff doc** (`.ai-coder/handoff/F4-playwright-baseline-capture.md`) with prerequisites, capture commands, gate promotion path, and a hosted-runner alternative.

## What this PR does NOT ship

- The **baseline PNG files**. Capture requires a running admin app + headless Chromium. That's a 1-2 hour operator session, not a CLI session task.
- **Gate D promotion to BLOCKING.** Stays REPORT until R3 + R4 baselines are both captured.
- **`v0.14.1-remediation-4` tag.** Applied after the operator runs `pnpm exec playwright test tests/visual --update-snapshots`, commits the baselines, and promotes the gate.

## Audit alignment

Audit said 28 admin pages; actual count is 29. Both numbers reflected in the handoff. The 12-screenshot-per-page target (4 states × 3 viewports) matches the audit's spec.

The `EXPLICIT_ROUTES` map in the generator handles admin pages whose URL is not a simple kebab-case of the page filename (e.g., `ProviderDetailPage` → `/providers/PV-0001`, `BookingDetailPage` → `/bookings/BK-0001`). Where a page has dynamic params, the spec uses a sample fixture id; the operator can swap to real fixture ids during capture.

## Verification

```bash
$ find apps/admin/tests/visual -name "*.spec.ts" | wc -l
29
$ cd apps/admin && npx tsc --noEmit
$ echo $?  # 0 — specs compile against existing Playwright + admin types
```

## Files added

- `apps/admin/tests/visual/*.spec.ts` (29 files)
- `scripts/dev/generate-playwright-specs.py`
- `.ai-coder/handoff/F4-playwright-baseline-capture.md`
- `.ai-coder/dispatches/D14r-4-closeout.md` (this)

## Gates

- [x] Gate A — all 10 fragments PASSED locally
- [x] Gate B — meta-only PR (no-bugs marker)
- [x] Gate C — all 6 BLOCKING articles PASSED locally
- [x] Admin tsc — 0 errors

## Auto-proceed decision

F#4 scaffold landed. Operator handoff doc tells them exactly what to do. Continue to F#6.
