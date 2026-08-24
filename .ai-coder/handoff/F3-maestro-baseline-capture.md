# F3 Handoff — Maestro mobile visual baseline capture

**Status:** scaffolded (89 screen flows committed) → awaiting baseline capture against real devices.
**Owner after handoff:** Ken / contractor / hosted device farm (BrowserStack / Sauce Labs / AWS Device Farm).
**Estimated time:** 1 operator-day (4-8 hours of capture + review + commit + push).
**Estimated cost:** Free (your own simulator) or ~$50-100 for a hosted-farm session.

---

## What's already done (no action needed)

- 89 scaffolded Maestro screen-flow YAML files committed:
  - `apps/mobile/.maestro/visual/customer/001-…yaml` through `045-…yaml` (45 flows)
  - `apps/mobile/.maestro/visual/provider/001-…yaml` through `044-…yaml` (44 flows)
- The two `000-setup-login.yaml` helpers are setup flows and are not counted as screen baselines.
- Each flow loads the app, navigates to the target screen, and runs a `takeScreenshot: <kind>/<slug>/default` capture.
- 3 additional `takeScreenshot` calls per flow are commented out (loading / empty / error / success). The operator uncomments them as they wire each screen's state-trigger script (see step 5 below).

The flows compile against Maestro's YAML schema as-is and are immediately runnable.

---

## Prerequisites

1. **Maestro CLI** installed:
   ```bash
   curl -Ls "https://get.maestro.mobile.dev" | bash
   echo 'export PATH="$PATH:$HOME/.maestro/bin"' >> ~/.zshrc  # or ~/.bashrc
   maestro --version
   ```

2. **One simulator running** (iOS) OR **one emulator running** (Android). Maestro picks whichever is active.
   - iOS: `xcrun simctl boot "iPhone 14"` then `open -a Simulator`
   - Android: `emulator -avd Pixel_6_API_34 &`

3. **Local Docker stack up** so the mobile app has a working API to talk to:
   ```bash
   bash scripts/dev/up.sh
   # Wait for "API ready" log line
   ```

4. **The mobile app loaded in the simulator** with a logged-in test customer + a logged-in test provider account on a separate simulator instance (or you reset between captures).

   Export IDs for dynamic routes, including `MAESTRO_BOOKING_ID`,
   `MAESTRO_JOB_ID`, and an open participant-visible `MAESTRO_DISPUTE_ID`.

5. **Git LFS configured** for the baseline PNGs:
   ```bash
   git lfs install
   git lfs track "apps/mobile/.maestro/visual/baselines/**/*.png"
   git add .gitattributes
   ```

---

## Capture procedure

### 1. Capture customer baselines

With a logged-in test customer in the simulator:
```bash
cd apps/mobile
maestro test .maestro/visual/customer/ --update-snapshots
```

Maestro runs each `001-…yaml` … `045-…yaml` flow in order, navigating + taking screenshots. Output goes to `apps/mobile/.maestro/visual/baselines/customer/<slug>/default.png`.

Expected: 45 PNGs created.

### 2. Capture provider baselines

Reset the simulator OR switch to a second simulator with the test provider logged in:
```bash
cd apps/mobile
maestro test .maestro/visual/provider/ --update-snapshots
```

Expected: 44 more PNGs created, in `apps/mobile/.maestro/visual/baselines/provider/<slug>/default.png`.

### 3. Review the baselines

Open each PNG visually. Reject any with obvious render bugs (e.g. screen showed an unexpected modal, text is clipped, the app routed to the wrong screen). Re-run the affected flows after fixing the underlying issue.

### 4. (Optional, recommended) Capture loading/empty/error/success per screen

For each YAML flow under `apps/mobile/.maestro/visual/<kind>/`, uncomment the loading/empty/error/success blocks (3 commented sections per file) AND wire the state-trigger scripts under `scripts/maestro/`:

```bash
# scripts/maestro/force-error.sh
# Tells the API to return 500 for the next request to /api/v1/* so the
# next-rendered screen shows its error state.
curl -X POST http://localhost:7381/__test/force-next-error
```

```bash
# scripts/maestro/seed-empty.sh
# Truncates the test database tables that the next-rendered screen reads,
# so the empty-state path renders.
curl -X POST http://localhost:7381/__test/seed/empty -d '{"scope":"bookings"}'
```

```bash
# scripts/maestro/seed-success.sh
# Repopulates fixtures so the success-state path renders.
curl -X POST http://localhost:7381/__test/seed/success -d '{"scope":"bookings"}'
```

(The `__test` endpoints are gated by `NODE_ENV=test` and only mounted in the local Docker stack — they are NOT in the production server.)

After uncommenting and wiring scripts, re-run each flow to capture the additional 3 states. Total capture target: 89 × 4 = 356 PNGs (or 89 × 1 = 89 if you only do default state for v1.0).

### 5. Commit + push

```bash
git add apps/mobile/.maestro/visual/baselines/
git status  # confirm LFS pointer files, NOT raw PNG bytes
git commit -m "test(r3): Maestro visual baselines for 89 mobile screens (default state)"
git push
```

The baselines flow through Git LFS, not stored in regular Git. Confirm via `git ls-files | grep .png | head -5` then `cat <one>.png` should show `version https://git-lfs.github.com/spec/v1` headers.

### 6. Promote Gate D to BLOCKING

Edit `scripts/gates/MODES.json`:
```json
"gate_d_state": {
  "mode": "BLOCKING",
  "owning_dispatch": "D14r-3",
  "promoted_in": "D14r-3-baselines",
  "rationale": "Promoted to BLOCKING after F#3 handoff captured 89 default-state baselines (and optionally 267 additional state baselines) on real devices. Gate D now compares each PR's screenshot output against these baselines and fails on visual regression."
}
```

Push the change as `phase/14r-3-baselines-capture` and merge.

### 7. Tag

```bash
git tag -a v0.14.1-remediation-3 -m "R3 — Maestro visual baselines captured"
git push origin v0.14.1-remediation-3
```

---

## Hosted-farm alternative (if no local simulator)

If you don't have a Mac for iOS simulator or RAM for Android emulator:

1. **BrowserStack App Live**: $39/month. Upload the .ipa/.apk + run Maestro flows against their cloud devices. They support Maestro natively as of 2025.
2. **AWS Device Farm**: pay per device-minute (~$0.17/min). Build the app, upload to S3, run Maestro flows via the AWS CLI.
3. **Sauce Labs**: similar pricing.

The capture procedure is identical; the only difference is `maestro test` runs against the hosted-farm endpoint instead of localhost.

---

## What `v0.14.1-remediation-3` represents when tagged

- 89 Maestro screen flows committed.
- 89 default-state baseline PNGs committed via LFS.
- (Optional) up to 267 more state baselines for loading/empty/error/success.
- Gate D promoted to BLOCKING.
- Future PRs that change UI render output get caught by visual diff.

Without baseline capture, the YAML flows still serve as documentation of what each screen should render — but the gate stays REPORT (per `scripts/gates/MODES.json`'s rationale).
