# Gate 2 — Boundary Matrix — Phase 01 Design System

**Phase:** PHASE-01
**Date:** 2026-04-28

For each new function or component, document the boundary inputs and expected behavior at the boundaries.

---

## `Button({ variant, size, className, ...props })`

| Boundary | Input | Expected behavior |
|---|---|---|
| `variant` undefined | `<Button>X</Button>` | Renders as `default` (blue, h-9, px-4) per `defaultVariants`. |
| `variant` invalid | `<Button variant={'oops' as any}>X</Button>` | TypeScript rejects at compile time; at runtime CVA falls through and emits the base class only. Not silently styled wrong. |
| `disabled` true | `<Button disabled>X</Button>` | Tailwind `disabled:pointer-events-none disabled:opacity-50` activates; native `disabled` HTML attribute also blocks click. |
| `className` provided | `<Button className="w-full">X</Button>` | Appended after CVA classes (later wins in Tailwind 4 source order — note: Tailwind 4 uses cascade order, so caller's class wins for conflicting utilities). |
| `size="icon"` no children | `<Button size="icon"><X/></Button>` | h-9 w-9; icon centered via flex. Consumers must provide `aria-label` (Constitution: no icon-only buttons unless universally understood). |
| `onClick` throws | `<Button onClick={() => { throw new Error() }}>X</Button>` | Error propagates to nearest React error boundary. Button does not catch. (Aligns with Constitution Article 7: no swallowed errors.) |
| `type` not provided | `<Button>Submit</Button>` inside a `<form>` | Defaults to `type="submit"` per HTML spec. Caller must opt out with `type="button"` for non-submit buttons. (Captured here as a known foot-gun; consumers should always specify `type` when inside a form.) |

---

## `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`

All six are pure `forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>` wrappers with fixed Tailwind classes plus appended `className`.

| Boundary | Input | Expected |
|---|---|---|
| Empty card | `<Card />` | Renders empty bordered rounded box (intentional — for skeleton states). |
| Deep nesting | `<Card><CardContent><Card>...</Card></CardContent></Card>` | Both render; outer & inner styling are independent. No state coupling. |

---

## `Dialog` family (Radix-wrapped)

All accessibility behavior (focus trap, Escape dismiss, return-focus on close, ARIA modal semantics) is provided by Radix and tested by Radix's own test suite. Wrapper boundaries:

| Boundary | Input | Expected |
|---|---|---|
| `open` controlled, `onOpenChange` missing | `<Dialog open={true}>...</Dialog>` (no setter) | Dialog renders open. User cannot close (no setter). Console warning from Radix. Caller bug, not wrapper bug. |
| `DialogContent` without `DialogTitle` | `<DialogContent>just body</DialogContent>` | Radix logs a11y warning to console. Render still succeeds. Caller responsibility to provide title for screen readers. |
| Portal target | n/a | Renders into `document.body` via Radix `<Portal>`. No tabindex sniffing required. |

---

## `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`

| Boundary | Input | Expected |
|---|---|---|
| `value` not in any `TabsTrigger.value` | `<Tabs value="ghost">` (no triggers match) | Radix renders no active tab. No content shown. No error. |
| Keyboard arrow navigation | Focus a trigger, press Right/Left | Radix moves focus and activates on Tab activation mode (default = "automatic"). |

---

## `Select` family

| Boundary | Input | Expected |
|---|---|---|
| `Select.Value` with no items | `<Select><SelectTrigger><SelectValue/></SelectTrigger></Select>` | Empty trigger; user clicks → empty popover. No error. |
| `SelectContent.position="item-aligned"` | Override default `popper` | Radix positions content to align with selected item. Wrapper passes through. |

---

## `Checkbox`, `Switch`

Each is a pure Radix wrapper. Boundary: indeterminate state on Checkbox.

| Boundary | Input | Expected |
|---|---|---|
| `checked="indeterminate"` | `<Checkbox checked="indeterminate" />` | Radix sets `data-state="indeterminate"`; our class only styles `data-state="checked"`. Indeterminate renders as unchecked-looking. **Documented as known limitation** — when first consumer needs indeterminate, add `data-[state=indeterminate]:bg-blue-300` etc. |
| `defaultChecked` only | `<Checkbox defaultChecked />` | Uncontrolled; works as expected. |

---

## `Tooltip`

| Boundary | Input | Expected |
|---|---|---|
| Renders without `TooltipProvider` ancestor | direct `<Tooltip>` | Radix logs error; tooltip does not appear. Caller bug. (`TooltipProvider` should wrap the app once, near the root.) |
| `delayDuration` 0 | tooltip on hover | Appears instantly. Default Radix delay is 700ms. |

---

## `Skeleton`, `EmptyState`, `LoadingState`, `ErrorState`

| Boundary | Input | Expected |
|---|---|---|
| `EmptyState` without `description` or `action` | `<EmptyState title="No data"/>` | Renders title only; container still padded. |
| `LoadingState` without `label` | `<LoadingState/>` | Defaults to "Loading…" |
| `ErrorState` without `title` | `<ErrorState/>` | Defaults to "Something went wrong" |
| All four | className overrides | Appended after default classes (caller wins for layout). |

---

## `ChartContainer({ height = 240, children })`

| Boundary | Input | Expected |
|---|---|---|
| `height` 0 | `<ChartContainer height={0}>...</ChartContainer>` | Renders 0px-tall div; `ResponsiveContainer` reports 0×0 → recharts renders nothing. Not an error; intentional. |
| `children` not a single React element | `<ChartContainer>{[a,b]}</ChartContainer>` | `ResponsiveContainer` requires a single child element; React/recharts will warn. Type signature `React.ReactElement` enforces single element. |

---

## Icon module re-exports (admin + mobile)

| Boundary | Input | Expected |
|---|---|---|
| Import unknown name | `import { NotARealIcon } from '@/components/icons'` | TypeScript error: "has no exported member 'NotARealIcon'". Caught at compile time. |
| Library missing icon | If a future `lucide-react` minor renames an icon, the re-export will fail at compile time of THIS module (the only file that imports from `lucide-react`). One-file blast radius. |
