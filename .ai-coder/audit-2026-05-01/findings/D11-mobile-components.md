# Phase D Findings Part 11 — Mobile components

Files added in this batch (full reads):

**Top-level components:**
- `apps/mobile/src/components/PhoneInput.tsx` (107)
- `apps/mobile/src/components/Avatar.tsx` (77)
- `apps/mobile/src/components/FilterChips.tsx` (89)
- `apps/mobile/src/components/FilterModal.tsx` (198)
- `apps/mobile/src/components/ConfirmModal.tsx` (136)
- `apps/mobile/src/components/StatusBadge.tsx` (88)
- `apps/mobile/src/components/PulsingDot.tsx` (88)
- `apps/mobile/src/components/PaginationLoader.tsx` (53)

**ui/ primitives:**
- `apps/mobile/src/components/ui/Badge.tsx` (45)
- `apps/mobile/src/components/ui/Button.tsx` (113)
- `apps/mobile/src/components/ui/EmptyState.tsx` (77)
- `apps/mobile/src/components/ui/EndOfList.tsx` (43)
- `apps/mobile/src/components/ui/ErrorState.tsx` (91)
- `apps/mobile/src/components/ui/Input.tsx` (93)
- `apps/mobile/src/components/ui/LazyImage.tsx` (88)
- `apps/mobile/src/components/ui/OTPInput.tsx` (105)
- `apps/mobile/src/components/ui/OfflineBanner.tsx` (85)
- `apps/mobile/src/components/ui/OptimizedList.tsx` (111)
- `apps/mobile/src/components/ui/PullToRefresh.tsx` (54)
- `apps/mobile/src/components/ui/ScreenContainer.tsx` (66)
- `apps/mobile/src/components/ui/ScrollToTop.tsx` (84)
- `apps/mobile/src/components/ui/Skeleton.tsx` (75)
- `apps/mobile/src/components/ui/SuccessAnimation.tsx` (130)
- `apps/mobile/src/components/ui/Toast.tsx` (178)

**icons + toast helper:**
- `apps/mobile/src/components/icons/index.ts` (197)
- `apps/mobile/src/lib/toast.ts` (~25)

**Phase D running total: ~17,495 lines fully read.**
**Audit grand total: ~37,169 lines fully read.**

---

## CRITICAL bugs

**None found in this batch.** Components are uniformly well-structured: accessibility roles + labels everywhere, native driver animations, consistent theme tokens, defensive nulls. Phase 14 D11 (Pattern 11–14 component bundle) is the cleanest module in the codebase.

---

## MEDIUM bugs

### MED-202 — OptimizedList silently overrides the caller's `ListFooterComponent`
**File:** [apps/mobile/src/components/ui/OptimizedList.tsx:68-99](apps/mobile/src/components/ui/OptimizedList.tsx#L68)
```tsx
const ListFooter = useCallback(() => {
  if (!showEndIndicator) return null;
  ...
  return <EndOfList />;
}, [showEndIndicator, rest.data]);

return (
  <FlatList<T>
    {...rest}                           // ← could include caller's ListFooterComponent
    ...
    ListFooterComponent={ListFooter}    // ← always wins; caller's footer is dropped
  />
);
```

Any screen that wires a `<PaginationLoader loading={...} hasMore={...} />` as its FlatList footer (the canonical use of the PaginationLoader component from MED bundle D11) will see `EndOfList` rendered instead. Pagination silently degrades:
- Customer scrolls bookings list → reaches the bottom → sees "You're all caught up" instead of "Loading more..." spinner.
- Next page never fetches.
- Customer thinks they have no more bookings; actually they have 50+ unread.

**Fix dispatch:**
```
1. Compose footers: if rest.ListFooterComponent is provided, render it
   followed by EndOfList (or replace EndOfList entirely when caller
   supplies their own).
2. Recommended:
   const finalFooter = useCallback(() => (
     <>
       {rest.ListFooterComponent
         ? React.createElement(rest.ListFooterComponent as React.ComponentType, {})
         : null}
       {showEndIndicator ? <EndOfList /> : null}
     </>
   ), [rest.ListFooterComponent, showEndIndicator]);
3. Test (real-render): render <OptimizedList ListFooterComponent={() => <Text testID="my-footer" />} ...>;
   query getByTestId('my-footer') — must exist.
4. Audit caller sites (bookings/index.tsx etc) to ensure pagination
   actually triggers via onEndReached — separate from this fix.
```

### MED-203 — Input.tsx prop-spread order lets caller override theme styling and focus tracking
**File:** [apps/mobile/src/components/ui/Input.tsx:30-52](apps/mobile/src/components/ui/Input.tsx#L30)
```tsx
<TextInput
  style={[styles.input, focused && styles.inputFocused, error ? styles.inputError : undefined, style]}
  placeholderTextColor={colors.textTertiary}
  accessibilityLabel={label ?? props.placeholder}
  ...
  onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
  onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
  {...props}                          // ← spreads AFTER, props wins
/>
```

In JSX, the last-set prop wins. `{...props}` spread after the explicit props means the caller's `onFocus`/`onBlur`/`style`/`placeholderTextColor`/`accessibilityLabel` overrides everything the wrapper added.

**Concrete impact:**
- Any caller that sets `onFocus` (e.g., to highlight a parent container) breaks the input's own focus-border highlight — `setFocused(true)` is replaced by the caller's bare handler.
- Any caller that sets `style` overrides the error-border style — the red border for `error` prop never renders if caller passes a `style` prop.
- accessibilityLabel from caller wins, but `props.accessibilityLabel` is undefined when caller passed via `label`, so label fallback works only if caller didn't override — fragile.

**Fix dispatch:**
```
1. Move {...props} BEFORE the explicit overrides:
   <TextInput
     {...props}
     style={[styles.input, focused && styles.inputFocused, error ? styles.inputError : undefined, style]}
     placeholderTextColor={colors.textTertiary}
     accessibilityLabel={label ?? props.placeholder}
     ...
     onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
     onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
   />
2. Real test: render <Input error="bad" style={{borderColor: 'blue'}} />,
   assert the rendered input style includes the error border (red wins
   over caller-blue OR they merge). Pick the contract and lock it in.
3. Audit OTPInput, PhoneInput for the same pattern (both look correct
   but worth double-check during the fix).
```

### MED-204 — StatusBadge `BookingStatus` union may be incomplete vs server enum
**File:** [apps/mobile/src/components/StatusBadge.tsx:14-26](apps/mobile/src/components/StatusBadge.tsx#L14)
Lists 12 statuses. Server's booking state machine is canonically described as 11 states in this file's comment (line 6) — but the union has 12. There's likely also `'created'` (pre-payment), `'failed'` (payment fail), `'expired'`, `'refunded'` on the server side. The component falls back to `String(status)` for unknown values — bookings show raw `"refunded"` text instead of a proper label.

**Fix:** generate the enum from server Zod schemas (same pattern as CRIT-97 dispatch). For now, audit `packages/api/src/services/booking-state.ts` (or equivalent) and add the missing rows to STATUS_MAP.

### MED-205 — `showRetryableToast` ignores the `onRetry` callback (documented limitation)
**File:** [apps/mobile/src/lib/toast.ts:18-26](apps/mobile/src/lib/toast.ts#L18)
```ts
export function showRetryableToast(message, _onRetry, type) {
  // v1.0: surfaces the error message; the screen's existing retry button
  // is the recovery affordance. v1.1+ will inline an action button on the
  // toast itself per Part 2B Pattern 7.
  useToastStore.getState().show(message, type);
}
```
Self-documented. Callers that pass a meaningful retry callback get an empty toast with no Retry button. The callback is silently ignored. Not customer-breaking (errors still surface), but the API shape misleads the caller. Add the inline action button OR rename the function to `showToastWithoutRetry` until Pattern 7 lands.

### MED-206 — OfflineBanner silently swallows NetInfo require failures
**File:** [apps/mobile/src/components/ui/OfflineBanner.tsx:13-19, 45](apps/mobile/src/components/ui/OfflineBanner.tsx#L13)
```ts
let NetInfo: NetInfoModule | null = null;
try {
  NetInfo = require('@react-native-community/netinfo') as NetInfoModule;
} catch {
  // Package not installed
}
// ...
if (!NetInfo) return null;
```

NetInfo is in `apps/mobile/package.json:19`. If `require` fails (version mismatch, native module not linked, etc.), the banner silently disappears — customer never sees the "You're offline" warning. They see an apparently-working app that just times out on every API call.

The defensive try/catch hides a real bug. Should either:
- Throw at boot (loud failure that surfaces in QA), OR
- Log to Sentry / crashlytics with the specific error so the issue is visible.

```ts
} catch (err) {
  console.error('[OfflineBanner] NetInfo failed to load:', err);
  // optional: Sentry.captureException(err);
}
```

Same pattern likely exists elsewhere — flag for cross-cutting "no silent require failures" rule in Phase I.

### MED-207 — `useState(() => new Animated.Value(0))[0]` should be `useRef(new Animated.Value(0)).current`
**File:** [apps/mobile/src/components/ui/OfflineBanner.tsx:23](apps/mobile/src/components/ui/OfflineBanner.tsx#L23)
```ts
const opacity = useState(() => new Animated.Value(0))[0];
```
Style issue, not a behavior bug. The `useState` form re-runs on hot reload differently than `useRef`. All the other animation-using components (PulsingDot, ScrollToTop, SuccessAnimation, Toast, Skeleton) use the canonical `useRef(new Animated.Value(0)).current` pattern. Migrate for consistency.

---

## LOW / INFO

- **PhoneInput regex** `/^(09|9)\d{9}$/` matches both `09XXXXXXXXX` (11 digits, with leading 0) and `9XXXXXXXXX` (10 digits). Regex itself is correct.
- **PhoneInput** strips spaces before validation; `placeholder="9XX XXX XXXX"` and `maxLength={11}` both reasonable.
- **Avatar** initials fallback handles single-name (`"Maria"` → `"MA"`) and two-name (`"Maria Santos"` → `"MS"`) cases. Defensive against undefined name.
- **FilterChips** wraps Pressable per chip with `accessibilityRole="tab"` + `accessibilityState.selected` — accessible.
- **FilterModal** wires Android hardware-back via `BackHandler.addEventListener('hardwareBackPress')` with cleanup. Pattern 13 implemented correctly. **Pending state stays local until Apply — Pattern 14 also correct.**
- **ConfirmModal** disables both buttons during `loading` and shows ActivityIndicator on the confirm side. Hardware-back ignored while loading. Pattern 13 + 14 both correct.
- **StatusBadge** uses `colors.successDark` for fg + `colors.successLight` for bg (good legibility) — accessible color contrast.
- **PulsingDot + ScrollToTop + SuccessAnimation + Toast** all use `useNativeDriver: true` — animations don't block JS thread.
- **PaginationLoader** correctly returns `null` when no more results AND no spinner — doesn't waste vertical space.
- **Button** wires `hapticLight()` before onPress, includes `accessibilityState.busy` during loading. Solid.
- **Toast** uses `accessibilityRole="alert"` + `accessibilityLiveRegion="assertive"` — screen reader announces immediately. Auto-haptic per type.
- **OTPInput** uses `keyboardType="number-pad"` + `textContentType="oneTimeCode"` (iOS Autofill from SMS). Correct.
- **LazyImage** uses `expo-image` with blurhash placeholder + `cachePolicy="disk"` + `recyclingKey={source}` — performant.
- **Skeleton + SkeletonCard** offer a base + composed pattern. SkeletonCard styles look fine.
- **PullToRefresh** triggers haptic on refresh, finally-resets refreshing flag (no stuck spinner on error).
- **ScreenContainer** consistent insets handling. The `paddingBottom: insets.bottom + 80` adds tab-bar clearance — confirmed compatible with the customer (tabs) layout.
- **icons/index.ts** is a single-source-of-truth re-export from `lucide-react-native`. Strong pattern. ~150 icons.
- **EmptyState + ErrorState + EndOfList** all properly accessible with role + label.
- **No emoji-as-icon abuse** apart from `EmptyState` (📭 default), `OfflineBanner` (📡), `LazyImage` placeholder (📷). All other icons are lucide. Acceptable.
- **No hardcoded colors** anywhere in this batch — all via `colors.*` from theme. Strong consistency.

---

## Phase D progress

D11 closes the components portion. Remaining for Phase D: hooks + utils + smaller files (~500-700 lines). Continuing into D12 to wrap Phase D.

---

## Updated headline counts after D11

| Severity | Total | New in D11 |
|---|---:|---:|
| **CRITICAL** | **97 (1 invalidated → 96 real)** | **+0** |
| **MEDIUM** | **207** | **+6 (MED-202–207)** |
