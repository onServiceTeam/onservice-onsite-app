# Mobile visual baseline flows (Maestro)

Per Phase 14 Part 4 §"Gate D — Visual screenshots". Each catalogued mobile screen (Part 2B — 43 customer + Part 2C — 39 provider = 82 total) gets a Maestro flow here that exercises all 4 required states and captures screenshots matching a baseline image.

## Directory structure

```
.maestro/visual/
├── customer/
│   ├── 001-onboarding.yaml
│   ├── 002-auth-login.yaml
│   ├── ...
│   └── 043-terms.yaml
├── provider/
│   ├── 001-role-select.yaml
│   ├── 002-onboarding-terms.yaml
│   ├── ...
│   └── 039-settings.yaml
└── baselines/
    ├── customer/
    └── provider/
```

## Population timeline

- **Dispatch 0:** This README only. Directory exists so Gate D's existence check passes; gate skips with informational message.
- **Dispatch 11 (mobile customer polish):** All 43 customer flows + baselines populated.
- **Dispatch 12 (mobile provider polish):** All 39 provider flows + baselines populated.

## Baseline storage

Baseline PNGs live at `.maestro/visual/baselines/<role>/<flow-name>/<state>.png`. Configure Git LFS:

```bash
git lfs track "apps/mobile/.maestro/visual/baselines/**/*.png"
```

## How to write a flow

```yaml
# .maestro/visual/customer/001-onboarding.yaml
appId: com.onservice.app

---
- launchApp: { clearState: true }
- assertVisible: "Home services, made trustworthy"
- takeScreenshot: customer/001-onboarding/slide-1
- swipe: { direction: LEFT }
- assertVisible: "Booked safely"
- takeScreenshot: customer/001-onboarding/slide-2
- swipe: { direction: LEFT }
- assertVisible: "Booked in minutes"
- takeScreenshot: customer/001-onboarding/slide-3
```

## Cross-device matrix

Per Design Contract V2 §12 + Part 2B/2C: each flow runs against iPhone SE (375×667), iPhone 14 (390×844), Pixel 6 (411×891). Maestro picks the device via `--device` flag at runtime; baselines are device-tagged.

## Required states per screen

Every screen captures: loading skeleton, empty state with CTA, error state with retry, success state. Matches Design Contract V2 §8 "States that are required, not optional."
