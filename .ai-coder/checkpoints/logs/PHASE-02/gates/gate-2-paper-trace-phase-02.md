# Paper Trace — PHASE-02 (Icon Replacement)

For each unit of work this phase, this document traces the change from intent → implementation → verification.

## Trace 1 — Admin Sidebar (`apps/admin/src/components/Sidebar.tsx`)

- **Intent:** Phase 02 doc Step 2 — replace 18 emoji-as-icon entries in the navItems array with lucide components.
- **Code change:** `icon: string` field renamed to `Icon: React.ComponentType<{size?:number; className?:string}>`. Eighteen emoji string literals replaced with the lucide component imports listed in the phase doc. Render call changed from `<span>{item.icon}</span>` to `<item.Icon size={18} className="shrink-0" />`.
- **Module boundary:** All icon imports go through `@/components/icons` (the centralized re-export module from Phase 01). No direct `lucide-react` imports.
- **Verification:** typecheck PASS; navigation routes unchanged; `verify-no-emoji.sh` reports 0 hits in `Sidebar.tsx`.

## Trace 2 — Admin KpiCard (`apps/admin/src/components/ui/KpiCard.tsx`)

- **Intent:** Phase 02 doc Step 3 — accept `React.ReactNode` for `icon` prop instead of `string`, so KPI consumers can pass `<Icon ... />` JSX.
- **Code change:** Interface `icon: string` → `icon: React.ReactNode`. Removed `text-2xl` font-size wrapper around the icon (lucide controls its own sizing via `size` prop). Wrapper became `<span className="text-[var(--color-text-secondary)]">{icon}</span>`.
- **Module boundary:** Type narrowed to `ReactNode` (largest reasonable type for the slot). All consumers updated to pass JSX.
- **Verification:** typecheck PASS across all 6 admin pages that consume KpiCard.

## Trace 3 — Admin pages (DashboardPage, FinancialsPage, PricingRulesPage, AuditLogPage, CatalogPage)

- **Intent:** Replace emoji literals at every consumer site of KpiCard, plus emoji used in empty-state icons and label-prefixed object literals.
- **Code change:** Each page imports the relevant lucide components from `@/components/icons` and passes them via `icon={<Lucide size={N} className="text-{color}-{shade}" />}`. Empty-state `<p className="text-4xl mb-3">EMOJI</p>` replaced with `<Lucide size={40} className="..." />` wrappers. Label-prefix emoji (e.g. `'📈 Peak Hours'`) had the emoji+space stripped — not converted to a JSX icon, because the label is a string token consumed by a select dropdown.
- **Module boundary:** Import surface is `@/components/icons` only. No new prop API on KpiCard beyond ReactNode.
- **Verification:** typecheck PASS; visual report PASS; emoji gate PASS.

## Trace 4 — Mobile centralized icon module (`apps/mobile/src/components/icons/index.ts`)

- **Intent:** Add the lucide-react-native re-exports needed by Phase 02 replacements without introducing direct `lucide-react-native` imports anywhere else.
- **Code change:** Module went from 60 re-exports (Phase 01) to 174 re-exports (Phase 02). Each new symbol verified to exist in `lucide-react-native@0.456.0` by typecheck (TS would surface a "module has no exported member X" error otherwise; both `apps/mobile && tsc --noEmit` runs were exit=0).
- **Module boundary:** Single re-export file. Consumers import only from `@/components/icons`. The contract of `lucide-react-native` is preserved (no aliasing of canonical names; one alias `Map as MapIcon` carried forward from Phase 01 to avoid clashing with `Map` global type in some files).
- **Verification:** mobile typecheck PASS at every batch boundary; final exit=0.

## Trace 5 — Mobile tab bars (`apps/mobile/app/(tabs)/_layout.tsx`, `(provider-tabs)/_layout.tsx`)

- **Intent:** Replace the inline `<TabIcon emoji="🏠" focused={focused} />` wrapper with a lucide-component factory.
- **Code change:** Removed the `TabIcon` Text wrapper. New `tabIcon(Icon)` factory: `({ focused, color }) => <Icon size={focused ? 24 : 22} color={focused ? colors.secondary : color ?? colors.textTertiary} />`. Used Home / ClipboardList / Wallet / User for the customer tabs and LayoutDashboard / Wrench / Coins / User for the provider tabs. Removed orphan `Text` import + `icon`/`iconFocused` styles.
- **Module boundary:** Expo Router contract preserved (`tabBarIcon` still returns React element with `focused`/`color`/`size` signature).
- **Verification:** typecheck PASS; tab bar still renders four tabs with correct labels.

## Trace 6 — Mobile transactions / notifications object-literal maps (earnings, wallet, customer/notifications, provider/notifications)

- **Intent:** Replace `Record<string, string>` emoji maps with `Record<string, ComponentType<IconProps>>` so the transaction/notification renderer can render a lucide component instead of a string.
- **Code change:** Pattern applied uniformly:

  ```ts
  type IconProps = { size?: number; color?: string };
  type IconComponent = ComponentType<IconProps>;
  const ICONS: Record<string, IconComponent> = { payment: CreditCard, escrow_hold: Lock, /* ... */ };
  const FALLBACK = Bell; // or appropriate fallback
  ```

  Renderer call site: `const Icon = ICONS[item.type] ?? FALLBACK; return (..., <Icon size={22} color={colors.primary} />, ...)`.
- **Module boundary:** No change to the transaction/notification service contracts. The map keys (transaction `type`, notification `type`) are unchanged. The renderer's prop API is unchanged.
- **Verification:** typecheck PASS; renderer exhaustively covers all known type values, fallback keeps unknown types renderable.

## Trace 7 — Mobile screens with empty-state / error-state emoji (~40 files)

- **Intent:** Replace `<Text style={styles.emptyIcon}>⚠️</Text>` and similar with `<View style={styles.emptyIconWrap}><AlertTriangle size={48} color={colors.error} /></View>`.
- **Code change:** Mechanical pattern. Where an existing `emptyIcon` style anchored the emoji, a `emptyIconWrap` (or `errorIconWrap`, `menuIconImg`, etc.) view style was added with `marginBottom: spacing.base` to preserve vertical rhythm. Lucide icon receives explicit `size` (40 or 48) and `color` from the theme tokens.
- **Module boundary:** Component tree depth grows by one layer (View → Icon) but the layout box is preserved by the wrapper view. Touch targets unchanged because the wrappers are inside the existing visible content area, not inside an interactive element's hit-test rect.
- **Verification:** typecheck PASS; visual rationale documented in `visual/REPORT.md` Pass 4 (interaction pass).

## Trace 8 — Mobile content-string emoji (rating "⭐ 4.8", "★" repeats)

- **Intent:** Strip emoji from data-formatted strings rather than introduce a JSX wrapper inside a `Text` interpolation (which lucide cannot live inside).
- **Code change:** `\`⭐ ${rating.toFixed(1)}\`` → `\`${rating.toFixed(1)}\`` (rating prefix wrapped externally with `<Star size={14} color={colors.warning} />` only where the surrounding JSX permits a flex row). `'⭐'.repeat(full)` star-rating displays converted to `<View style={...}><Star ... /></View>` repeats where ergonomic; otherwise the text rating remains alongside a single `<Star />` glyph.
- **Module boundary:** Display-string contract changed (rating no longer prepended with star inside the same string). Consumers of `formatRating` (none — it was inline) unaffected.
- **Verification:** typecheck PASS; visual report Pass 3 (pixel pass) confirms the iconography is now uniform lucide.

## Trace 9 — accessibility config (`apps/mobile/src/config/accessibility.ts`)

- **Intent:** The `statusIndicators.disputed.icon` field carried a Unicode `'⚠'` (no VS-16) which the emoji gate's regex matched.
- **Code change:** Replaced with the literal `'!'`. The field is currently dead code (no consumer reads it); a future consumer should pull from the centralized icon module. Logged in the manifest's "Deferred" section so the next consumer remembers.
- **Module boundary:** Config-shape unchanged.
- **Verification:** typecheck PASS; emoji gate PASS.

---

All nine traces map 1:1 to file groups touched by Phase 02. The full per-file list is in the EVIDENCE-MANIFEST and in the commit diff.
