# Screen Audit — [Screen Name]

**Path:** `apps/[admin|mobile]/...`
**Stitch reference:** [URL or N/A]
**Audited:** YYYY-MM-DD
**Auditor:** [AI coder]

## Visual Fidelity (FE-V01 through FE-V15)

- [ ] FE-V01 — Screen matches design tokens (colors)
- [ ] FE-V02 — Spacing matches token scale
- [ ] FE-V03 — Typography matches tokens
- [ ] FE-V04 — No emoji used as iconography
- [ ] FE-V05 — All icons from lucide library
- [ ] FE-V06 — All icons from centralized module
- [ ] FE-V07 — Loading state exists
- [ ] FE-V08 — Error state exists
- [ ] FE-V09 — Empty state exists
- [ ] FE-V10 — Success state exists
- [ ] FE-V11 — Layout 1920×1080 OK
- [ ] FE-V12 — Layout 1440×900 OK
- [ ] FE-V13 — Layout 1280×720 OK
- [ ] FE-V14 — Layout tablet OK
- [ ] FE-V15 — Layout mobile OK

## Interactions (FE-I01 through FE-I25)

(Check each that applies; mark N/A with justification if not applicable.)

- [ ] FE-I01 — All buttons functional
- [ ] FE-I02 — Forms submit valid data successfully
- [ ] FE-I03 — Forms reject invalid data with helpful message
- [ ] FE-I04 — Forms preserve input on validation error
- ... (continues per MASTER-QA-SYSTEM.md)

## Data (FE-D01 through FE-D20)

- [ ] FE-D01 — Lists fetch from real API (no mock data)
- [ ] FE-D02 — Detail pages fetch by ID from URL
- [ ] FE-D03 — Money values use formatCurrency()
- ... (continues)

## Accessibility (FE-A01 through FE-A20)

- [ ] FE-A01 — All interactive elements reachable via Tab
- [ ] FE-A07 — Color contrast ≥ 4.5:1 body text
- ... (continues)

## Performance (FE-P01 through FE-P15)

- [ ] FE-P01 — FCP < 2s on 3G
- [ ] FE-P15 — No console.warn/error in production build
- ... (continues)

## Issues found

(List any issues. If none, write "None.")

## Screenshots

Stored in: `gates/gate-4-screen-<n>/`

- `screenshot-loading.png` — loading state
- `screenshot-error.png` — error state
- `screenshot-empty.png` — empty state
- `screenshot-success.png` — success state
- `screenshot-1920.png` — desktop large
- `screenshot-1440.png` — desktop standard
- `screenshot-1280.png` — desktop small
- `screenshot-tablet.png` — tablet
- `screenshot-mobile.png` — small phone
