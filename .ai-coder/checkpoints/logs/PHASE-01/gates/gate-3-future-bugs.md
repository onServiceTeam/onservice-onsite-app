# Gate 3 — Future-Bugs Analysis — Phase 01

**Phase:** PHASE-01
**Date:** 2026-04-28

The single bug most likely to surface in 2 weeks of normal Phase 02–04 development, and the recommended preemptive guard.

---

## Most-likely 2-week bug: A consumer imports directly from `lucide-react` and it works

**Why it's likely:** Phase 02 will replace 73 emoji usages. Some of those replacements will be authored by a different agent in a different session, with `lucide-react` already installed and visible. The path of least resistance is `import { Wrench } from 'lucide-react'` — same as `from '@/components/icons'`, just shorter to the closest IDE autocomplete. TypeScript and the runtime are entirely happy with this. The build passes. The screen renders correctly. The lint and emoji gates do not catch it.

**Symptom:** When Phase 04 (or a later phase) needs to bump `lucide-react` or swap the icon vendor, only the centralized module is updated. Direct importers either fail to compile (best case) or render the wrong icon (worst case). Either way, the indirection contract has already been violated quietly.

**Why it's worse than it sounds:** The Phase 02 emoji-replacement plan will land 73 changes at once. Even one direct import in that batch is enough to start the rot. Subsequent phases will copy-paste from existing examples.

---

## Recommended guard (Phase 02 to install)

Add a forbidden-pattern entry that fires whenever a file *outside* `apps/admin/src/components/icons/`, `apps/admin/src/components/ui/`, `apps/mobile/src/components/icons/`, and `apps/mobile/src/components/ui/` imports from `lucide-react` or `lucide-react-native`. Concretely, append to `apps/admin/eslint.config.js` (and equivalent for mobile):

```js
{
  files: ['apps/admin/src/**/*.{ts,tsx}'],
  ignores: [
    'apps/admin/src/components/icons/**',
    'apps/admin/src/components/ui/**',
  ],
  rules: {
    'no-restricted-imports': ['error', {
      paths: [{
        name: 'lucide-react',
        message: 'Import icons from "@/components/icons" instead of "lucide-react" directly.',
      }],
    }],
  },
},
```

This is a single eslint rule. It fires at lint time (gate-1-lint), well before runtime, and gives a precise, actionable error message.

The mobile equivalent uses `lucide-react-native`.

The `ui/` folder is allowed to import directly because primitives like `Dialog` and `Select` legitimately need their own glyphs (close X, chevron) as part of their UX contract — those glyphs are part of "what a dialog is", not part of the application's icon vocabulary.

---

## Secondary candidate: `--legacy-peer-deps` becomes load-bearing

**Why it's likely:** Phase 01 used `--legacy-peer-deps` because of TD-002 (eslint-plugin-react@7 vs eslint@10). That flag silently disables peer-dep resolution. If Phase 02 installs more deps with the same flag, the npm tree will have multiple incompatible peer chains. Future debugging gets harder.

**Mitigation:** Phase 02 should resolve TD-002 and TD-003 *before* installing more packages, so subsequent installs run without flags.

---

## Tertiary candidate: `recharts` server-side rendering

**Why it's likely:** `Chart.tsx` re-exports recharts. If a future phase tries to SSR a chart (for example a printable booking summary), recharts uses DOM measurements that fail in Node. The wrapper does not yet handle this.

**Mitigation:** Add a `<ChartContainer suspense?>` future API once an SSR consumer arrives. Not needed now.
