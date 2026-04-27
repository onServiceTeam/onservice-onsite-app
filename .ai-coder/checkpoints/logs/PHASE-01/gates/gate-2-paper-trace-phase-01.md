# Gate 2 — Paper Trace — Phase 01 Design System

**Phase:** PHASE-01
**Date:** 2026-04-28
**Author:** AI coder

End-to-end trace of every code path introduced in Phase 01, from import line to usage call site.

---

## Trace 1 — Centralized icon module (`apps/admin/src/components/icons/index.ts`)

**What it does:** Re-exports a curated set of `lucide-react` components under their canonical names so the rest of the admin code never imports from `lucide-react` directly. This is the single point of indirection between the admin source tree and the icon library.

**Inputs (compile time):**
- `lucide-react@0.456.0` (installed in `apps/admin/node_modules/`).

**Outputs (runtime):**
- ES module exports of ~70 named symbols (each a React component).

**Path through the system:**
```
[ caller ]
   └── import { Coins } from '@/components/icons'  (or relative)
       └── apps/admin/src/components/icons/index.ts
           └── export { ... } from 'lucide-react'
               └── lucide-react@0.456.0 (npm)
```

**Why this design:**
- Lets us swap `lucide-react` for a fork or a different vendor without touching every consumer (one-file blast radius).
- Lets `verify-no-emoji.sh` and the future "no direct lucide imports" guard look at exactly one well-known file.
- Matches the Phase 01 spec ("never import directly from lucide-react").

**Failure modes:**
- If a consumer imports a name the module does not re-export, TypeScript fails at the consumer (not here). This is intentional — every new icon must be added here first.

---

## Trace 2 — Centralized icon module (`apps/mobile/src/components/icons/index.ts`)

Identical contract to Trace 1 but re-exports from `lucide-react-native@0.456.0` (peer dep `react-native-svg@15.8.0`). One subtle difference: `lucide-react-native` does not export `Refresh`, so the spec's `Refresh as RefreshIcon` was substituted with `RefreshCw` (the canonical refresh glyph available in 0.456.0). This substitution was made consciously, validated by `npx tsc --noEmit`, and is documented here.

---

## Trace 3 — UI primitive `Button` (CVA-driven variants)

**File:** `apps/admin/src/components/ui/Button.tsx`

**Path:**
```
<Button variant="destructive" size="sm" onClick={...}>Delete</Button>
   ↓
React.forwardRef → <button className={buttonVariants({ variant, size })} {...props} />
   ↓
buttonVariants = cva(base, { variants, defaultVariants })  (class-variance-authority@0.7.1)
   ↓
Tailwind 4 utility classes resolved at build time
```

**Boundary cases:** see boundary matrix (`gate-2-boundaries-phase-01.md`).

---

## Trace 4 — Radix-wrapped primitives (Dialog, Tabs, Select, Checkbox, Switch, Tooltip, Label)

Each wraps a Radix primitive with `React.forwardRef` and a Tailwind className appended after the wrapper's default classes. The wrapper preserves all upstream Radix props (it forwards `...props`), which means accessibility behavior (focus management, escape handling, ARIA attributes) is delegated to Radix and not re-implemented.

**Path (Dialog example):**
```
<Dialog open={...}> <DialogContent>...</DialogContent> </Dialog>
   ↓
DialogPrimitive.Root → DialogPrimitive.Portal → DialogOverlay (z-50, bg-black/50)
   ↓ + DialogPrimitive.Content (fixed center, animated)
   ↓ + DialogPrimitive.Close (auto-rendered with X icon from lucide-react)
```

The `X` icon imported by `Dialog.tsx` and `Select.tsx` is the only place these primitives import from `lucide-react` directly. This is acceptable because the icon belongs to the primitive's own UX contract (the close glyph is part of "what a dialog is"), not the application's icon vocabulary. The forbidden-import rule (when added in a later phase) should whitelist `apps/admin/src/components/ui/**` for this reason.

---

## Trace 5 — Stateless presentational primitives (Skeleton, EmptyState, LoadingState, ErrorState)

No external deps beyond React and (for ErrorState) the `AlertTriangle` icon. Each renders a single `<div>` with role/ARIA attributes (`role="status"`, `aria-busy`, `aria-live`, `role="alert"`) appropriate to its purpose. No hooks, no state — they are display-only and can be memoized trivially by the caller.

---

## Trace 6 — Chart wrapper

**File:** `apps/admin/src/components/ui/Chart.tsx`

Re-exports `recharts` primitives (Line/Bar/Area + axes + tooltip + legend) plus a `ChartContainer` that wraps `ResponsiveContainer` with a fixed-height div. This is the same indirection pattern as the icon module: callers import from `@/components/ui` (which re-exports from `Chart.tsx`) so we can change the chart vendor without touching consumers.

`CHART_COLORS` exposes the brand palette as named constants so charts use design tokens consistently instead of hardcoding hex values per chart.

---

## Trace 7 — Design-token CSS variables (`apps/admin/src/index.css`)

Additive change. The existing `:root` block (brand colors at the project's pre-existing values) is preserved untouched. A new appended block adds:
- `--color-border-strong`, `--color-text-tertiary-2`
- `--color-success-bg`, `--color-warning-bg`, `--color-danger-bg`
- `--color-info`, `--color-info-bg`
- `--font-sans`, `--font-mono`

These are additions, not overrides. Any existing component reading the old vars continues to work unchanged. New primitives that need status-bg colors will read `var(--color-success-bg)` etc.

The `body` rule is not modified (the existing rule already sets font-family from `'Inter'`).

---

## Trace 8 — Dependency installs (admin and mobile)

Both installs used `--save-exact --legacy-peer-deps --no-workspaces`:
- `--save-exact` is the Phase 01 spec's pin policy (no caret, no tilde).
- `--legacy-peer-deps` works around pre-existing baseline tech debt (TD-002, eslint-plugin-react@7 vs eslint@10).
- `--no-workspaces` scopes the install to a single workspace, avoiding the workspace-wide resolve that surfaces other workspaces' baseline issues (TD-003 was the trigger that made this necessary).

After install, both workspaces' `package.json` and `package-lock.json` were updated.

`apps/mobile/package.json` also had a one-line baseline fix (`expo-device: ~7.3.0` → `~55.0.15`, see TD-003 in `.ai-coder/checkpoints/logs/tech-debt.md`). No other baseline file was modified.
