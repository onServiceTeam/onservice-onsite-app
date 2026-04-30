# Remediation #3 (scaffold) — Maestro mobile visual flows

Branch: `phase/14r-3-maestro-flows`
Tag (after merge): scaffold-only PR, no tag yet — `v0.14.1-remediation-3` applies after baseline capture per `.ai-coder/handoff/F3-maestro-baseline-capture.md`.
Audit reference: Finding #3 in `.ai-coder/PHASE-14-REMEDIATION-MASTER-INSTRUCTION.md` lines 128-206.

<!-- gate-b: no-bugs-this-dispatch -->

## What this PR ships

- **84 scaffolded Maestro YAML flow files** committed under `apps/mobile/.maestro/visual/`:
  - `customer/001-…yaml` … `043-…yaml` (43 customer screens)
  - `provider/001-…yaml` … `041-…yaml` (41 provider screens)
- Each flow loads the app, navigates to the target screen, and runs a `takeScreenshot: <kind>/<slug>/default` capture.
- 3 additional `takeScreenshot` calls per flow (loading/empty/error/success) are commented out so the operator can uncomment + wire state-trigger scripts as they capture (see step 4 of the handoff).
- **Generator script** (`scripts/dev/generate-maestro-flows.py`) so the scaffolding can be regenerated whenever the screen catalogue changes.
- **Handoff doc** (`.ai-coder/handoff/F3-maestro-baseline-capture.md`) with the exact operator runbook: simulator setup, Maestro install, capture commands, Git LFS configuration, gate promotion path.

## What this PR does NOT ship

- **The 84 (or up to 336) baseline PNG files.** Capture requires an iOS simulator or Android emulator (or a hosted device-farm session). That step is operator/contractor work and does not happen from this CLI session.
- **Gate D promotion.** Stays REPORT per `MODES.json` until baselines are captured.
- **`v0.14.1-remediation-3` tag.** Applied after the operator runs `maestro test --update-snapshots`, commits the baselines, and promotes the gate.

## Audit alignment

The audit's F#3 calls for 82 Maestro flows. The actual mobile screen count is 84 (43 customer + 41 provider, excluding `_layout.tsx` files). Both the per-flow YAML and the handoff doc reflect 84 — this is a count divergence, not a scope cut.

The audit's optional "4 states × 3 viewports = 984 baselines" is itemized in the handoff as the full polish target. The realistic v1.0 ship is 84 default-state PNGs (covers the Gate D requirement of "screen renders without obvious bug"), with the additional state captures landing as Maestro maturity grows.

## Generator pattern

Future scaffolding regenerations (when new screens land):

```bash
find apps/mobile/app -name "*.tsx" -not -name "_layout.tsx" -not -path "*/node_modules/*" \
  | sort > scripts/dev/.screens-list.txt
python scripts/dev/generate-maestro-flows.py
rm scripts/dev/.screens-list.txt
```

The generator is idempotent — it overwrites existing flows with the canonical scaffold. Operator-customised state-trigger blocks survive only when committed; the generator preserves comments inside the YAML body.

## Verification

```bash
$ find apps/mobile/.maestro/visual/customer -name "*.yaml" | wc -l
43
$ find apps/mobile/.maestro/visual/provider -name "*.yaml" | wc -l
41
$ wc -l apps/mobile/.maestro/visual/customer/001-*.yaml
27 apps/mobile/.maestro/visual/customer/001-tabs-bookings.yaml  # canonical scaffold size
```

## Files added

- `apps/mobile/.maestro/visual/customer/*.yaml` (43 files)
- `apps/mobile/.maestro/visual/provider/*.yaml` (41 files)
- `scripts/dev/generate-maestro-flows.py`
- `.ai-coder/handoff/F3-maestro-baseline-capture.md`
- `.ai-coder/dispatches/D14r-3-closeout.md` (this)

## Gates

- [x] Gate A — all 10 fragments PASSED locally
- [x] Gate B — meta-only PR (no-bugs marker)
- [x] Gate C — all 6 BLOCKING articles PASSED locally

## Auto-proceed decision

F#3 scaffold landed. Operator/contractor handoff doc tells them exactly what to do next. Continue to F#4.
