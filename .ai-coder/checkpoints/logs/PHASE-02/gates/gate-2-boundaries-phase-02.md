# Boundary Matrix — PHASE-02 (Icon Replacement)

Each replacement pattern's input/output/error contract is documented below.

## Pattern A — KpiCard `icon` prop widening

| Boundary | Before (Phase 01) | After (Phase 02) |
|---|---|---|
| Type | `icon: string` (emoji literal) | `icon: React.ReactNode` |
| Acceptable values | Any string; rendered raw inside `text-2xl` `<div>` | Any ReactNode (string still works for backward compat); rendered raw inside `<span>` |
| Default styling | `text-2xl` (~24 px Tailwind) | None — caller supplies `size` and color via lucide props |
| Backward compat | n/a | A consumer passing a plain string (e.g. existing `"💰"` in untouched code) still renders, just without the 2xl scaling. No runtime crash. |

## Pattern B — `Record<string, string>` icon maps → `Record<string, ComponentType<IconProps>>`

| Boundary | Before | After |
|---|---|---|
| Map key shape | `string` (transaction/notification type) | unchanged |
| Map value shape | `string` (emoji) | `ComponentType<{size?:number; color?:string}>` |
| Lookup site | `<Text>{MAP[type] ?? '🔔'}</Text>` | `const Icon = MAP[type] ?? FallbackIcon; return <Icon size={N} color={C} />` |
| Unknown-type behavior | Renders fallback emoji string | Renders fallback lucide component (Bell / CreditCard / AlertTriangle depending on context) |
| Type-safety | Loose — any string accepted | Tight — lookup yields a typed component, TS catches typos |

## Pattern C — Tab bar icon factory (Expo Router)

| Boundary | Before | After |
|---|---|---|
| Factory shape | `<TabIcon emoji="🏠" focused={focused} />` (custom Text-based wrapper) | `tabIcon(Home)` returns `({ focused, color }) => <Home size={focused ? 24 : 22} color={focused ? colors.secondary : color ?? colors.textTertiary} />` |
| Expo `tabBarIcon` contract | satisfied (returns ReactElement) | satisfied |
| `focused` semantics | Passed to wrapper to apply `iconFocused` style | Passed to factory to choose size + color |
| Removed dead code | n/a | `TabIcon` component, `icon` and `iconFocused` styles, `Text` import |

## Pattern D — Empty/error state icon wrapper

| Boundary | Before | After |
|---|---|---|
| DOM shape | `<Text style={styles.emptyIcon}>⚠️</Text>` | `<View style={styles.emptyIconWrap}><AlertTriangle size={48} color={colors.error} /></View>` |
| Layout | Text node, font-size driven | View node + child SVG, size driven by lucide `size` prop |
| Touch handling | None (text in a non-interactive area) | None (view in a non-interactive area) — preserved |
| Vertical rhythm | `marginBottom: spacing.base` from styles.emptyIcon | `marginBottom: spacing.base` ported to styles.emptyIconWrap |

## Pattern E — Centralized icon module (mobile)

| Boundary | Phase 01 | Phase 02 |
|---|---|---|
| Re-export count | ~60 | ~174 |
| Source library | `lucide-react-native@0.456.0` | unchanged |
| Aliases | `Map as MapIcon`, `Image as ImageIcon` | unchanged + no new aliases (added an alias for `Refresh as RefreshIcon` was already in P01 — unchanged) |
| Verification | TS would error on missing exports → typecheck PASS proves every name exists | unchanged |
| Risk | A new lucide upgrade could remove a name | mitigated: lock-file is exact-pinned (`0.456.0`); upgrades require explicit phase work |

## Pattern F — Content-string emoji removal

| Boundary | Before | After |
|---|---|---|
| String shape | `\`⭐ ${rating}\`` | `\`${rating}\`` |
| Star icon | embedded in the string | externalized to `<Star ... />` JSX where layout permits, otherwise omitted |
| Consumer impact | None (no programmatic consumer of the formatted string beyond `<Text>`) | None |

## Risk surface

The replacement pattern set is mechanical. The only non-trivial risks are:

1. **Wrapped icon vs touchable hit area** (Pattern D / Trace 7) — wrapping an icon in a `<View>` doesn't change the parent `<TouchableOpacity>` hit rect, but it does change the icon's position by ~0–4 px depending on the wrapper's flex/align settings. Mitigation: explicit `marginBottom`/`alignItems` matched to the prior `emptyIcon` text style. Visual report Pass 3 (pixel pass) confirms.
2. **Fallback-icon semantics** (Pattern B) — choosing the wrong fallback can mislead a user when an unknown transaction/notification type appears. Mitigation: chose context-appropriate fallbacks (Bell for notifications, CreditCard for transactions, AlertTriangle for errors). Boundary matrix called out so future contributors don't change a fallback without reading this row.
3. **lucide-react-native missing names** (Pattern E) — flagged at typecheck. No silent failure mode.

No money-flow code, no auth code, no migration code, and no test code was touched. Money/PII boundaries unchanged.
