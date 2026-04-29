# DESIGN CONTRACT V2 — onService PH

**This document is locked. The AI coder cannot change any value in it without Ken signing off in writing. This document supersedes `docs/architecture/DESIGN-CONTRACT.md` and reconciles the brand-color and typography drift that V1 allowed.**

The bar this contract meets: **"If a paying customer used this for the first time, would they trust the platform with their money and their home?"**

A platform that asks for ₱5,000 in escrow for a plumbing job needs to look like a platform that can be trusted with ₱5,000. Not a prototype. Not a hackathon. Not a portfolio piece. Production work.

---

## 1. Brand identity (locked)

| Property | Value | Where it lives |
|---|---|---|
| Brand name | onService | `package.json`, `app.json` |
| Tagline (English) | "Trusted Home Services" | Header on web, splash on mobile |
| Tagline (Tagalog) | "Maaasahang Serbisyo sa Bahay" | Subordinate, used only in marketing |
| Voice | Direct, friendly, professional | All copy |
| Positioning | "The home services platform that guarantees the work" | Marketing only — do NOT use in product copy until SiguradoShield Layer 2 ships |

The voice exclusion is important. Until SiguradoShield Layer 2 is wired (currently NOT WIRED per `INSURANCE.md` and Bug 538), the product UI does not say "guarantee," "guaranteed," "protection guarantee," "we guarantee," or any close synonym. It says "Your booking is monitored by SiguradoShield" or "Dispute resolution within 48 hours" — concrete, accurate claims. RA 7394 risk otherwise.

---

## 2. Color palette (locked, single source of truth)

The single source of truth is `docs/design-system/tokens.json`. Every other place that mentions a brand color must derive from it. Drift is enforced by `scripts/verify-design-tokens.sh` and the new Gate A.

### Primary palette

| Role | Token | Hex | Use |
|---|---|---|---|
| Brand primary | `color.brand.primary` | `#1B3A4B` | Sidebar accent, primary buttons, links, page titles |
| Brand primary hover | `color.brand.primary-hover` | `#142D3B` | Hover state of primary |
| Brand primary active | `color.brand.primary-active` | `#0E1F2D` | Pressed/active state |
| Brand secondary | `color.brand.secondary` | `#00B4D8` | Focus rings, secondary links, tab indicators |
| Brand accent | `color.brand.accent` | `#FF6B35` | Alerts, dispute badges, urgency markers |

**Reconciliation note:** V1 had three different "primary" values across docs and code (`#1B3A4B`, `#0F62FE`, `#0066FF`). V2 picks `#1B3A4B` because the admin already uses it and it's the value in `tokens.json`. Mobile `theme.ts`, `DESIGN-CONTRACT.md` (V1), and admin chart configs must change to match. Dispatch 02 in Phase 14 makes the change. After Dispatch 02, Gate A enforces.

### Status palette

| Role | Token | Hex | Background variant |
|---|---|---|---|
| Success | `color.status.success` | `#10B981` | `success-bg` `#DEFBE6` |
| Warning | `color.status.warning` | `#F59E0B` | `warning-bg` `#FCF4D6` |
| Danger | `color.status.danger` | `#EF4444` | `danger-bg` `#FFF1F1` |
| Info | `color.status.info` | `#0043CE` | `info-bg` `#EDF5FF` |

### Neutral palette (Carbon-inspired)

| Token | Hex | Use |
|---|---|---|
| `color.neutral.0` | `#FFFFFF` | Main background |
| `color.neutral.50` | `#F4F4F4` | Page background, hover row |
| `color.neutral.100` | `#E0E0E0` | Default border |
| `color.neutral.200` | `#C6C6C6` | Strong border |
| `color.neutral.300` | `#A8A8A8` | Disabled icon |
| `color.neutral.400` | `#8D8D8D` | Tertiary text, placeholder |
| `color.neutral.500` | `#6F6F6F` | Disabled text |
| `color.neutral.600` | `#525252` | Secondary text |
| `color.neutral.700` | `#393939` | Body text on tinted bg |
| `color.neutral.800` | `#262626` | Header text |
| `color.neutral.900` | `#161616` | Primary text |

### Semantic aliases (use these in components, not raw neutrals)

```
text-primary    → neutral.900   #161616
text-secondary  → neutral.600   #525252
text-tertiary   → neutral.400   #8D8D8D
background      → neutral.0     #FFFFFF
background-alt  → neutral.50    #F4F4F4
border          → neutral.100   #E0E0E0
border-strong   → neutral.200   #C6C6C6
```

### Forbidden

- Hex literals in components (`<div style="color: #1B3A4B">` — no, use `text-primary` Tailwind class)
- Inline RGB values
- Tailwind's default brand colors (`text-blue-500`, `bg-purple-600`) — they don't match our palette
- Gradients **except** the active-booking card (one specific exception, see §11)
- Shadows other than `shadow-sm`, `shadow`, `shadow-lg`
- Competitor colors anywhere in the product (Lazada orange #FF6300, Shopee orange #EE4D2D, Grab green #00B14F)

---

## 3. Typography (locked)

| Property | Value |
|---|---|
| Sans serif | Inter |
| Monospace | JetBrains Mono |
| Loaded via | Self-hosted, no CDN. WOFF2 in `apps/admin/public/fonts/` and Expo asset bundle for mobile |
| Tagalog support | Inter covers Latin Extended which is sufficient for modern Tagalog |
| Fallback chain | `Inter, ui-sans-serif, system-ui, -apple-system, sans-serif` |

### Type scale

| Size | Use | Weight | Line height |
|---|---|---|---|
| 11px | Captions, hint text | 400 | 16px |
| 12px | Secondary text, table cells, badges | 400 | 16px |
| 14px | Body, button labels (admin), table data | 400 / 500 | 20px |
| 16px | Body, button labels (mobile), input text | 400 / 500 | 24px |
| 18px | Section headings | 600 | 24px |
| 20px | Page subtitles | 600 | 28px |
| 24px | Page titles (H1) | 700 | 32px |
| 30px | KPI numbers | 700 | 36px |
| 36px | Hero numbers (wallet balance) | 700 | 44px |

### Forbidden

- Italic anywhere except book titles or genuine quotes (no italic for emphasis)
- Underline anywhere except hyperlinks
- Letter-spacing changes (no tracking adjustments — Inter is already optimized)
- More than two weights on a single screen
- Mixing Inter weights at the same size (e.g., a heading that has both 14/600 and 14/500)
- ALL CAPS for body text. Buttons may use Title Case but not ALL CAPS. Section dividers may not use ALL CAPS.

---

## 4. Spacing (4-based scale, locked)

Every space, padding, margin, gap on the entire platform comes from this scale:

```
0  → 0
1  → 4px
2  → 8px
3  → 12px
4  → 16px
5  → 20px
6  → 24px
8  → 32px
10 → 40px
12 → 48px
16 → 64px
20 → 80px
24 → 96px
```

**Forbidden:** any space value not in this list. No `padding: 13px`. No `margin-top: 18px`. No `gap: 7px`. If you find yourself wanting a value outside this scale, the layout is wrong, not the scale. Refactor the layout.

### Standard spacing patterns

| Pattern | Value |
|---|---|
| Card internal padding | 24px (`p-6`) |
| Card external margin | 16px (`m-4`) |
| Form field vertical gap | 16px (`gap-4`) |
| Section vertical gap (within page) | 32px (`gap-8`) |
| Page-level top padding | 24px (`pt-6`) |
| Page-level horizontal padding | 24px (`px-6`) |
| Modal padding | 24px on desktop (`p-6`), 16px on mobile (`p-4`) |
| Table cell padding | 12px vertical, 16px horizontal (`py-3 px-4`) |
| Button padding | 8px vertical, 16px horizontal for default (`py-2 px-4`); 12/24 for large; 4/12 for small |

---

## 5. Border radius (locked, four values only)

```
4px  → sm    badges, small buttons, table corners
8px  → DEFAULT  inputs, cards
12px → md    elevated cards, modals
16px → lg    hero sections, large illustrations
9999px → full   avatars, pills
```

Forbidden: 6px, 10px, 14px, 20px. There are five values. Pick one.

---

## 6. Iconography (locked)

**Library:** `lucide-react` (admin) and `lucide-react-native` (mobile). No other icon libraries. No `react-icons`. No FontAwesome. No emoji as iconography.

**Import path:** every component imports from `@/components/icons` — never directly from `lucide-react`. The centralized re-export module exists for two reasons: (a) it lets us swap libraries if needed, (b) it gives every icon a canonical name in the codebase.

### Standard icon sizes

| Size | Use |
|---|---|
| 12px | Inline with caption text |
| 16px | Default size in admin (sidebar, buttons, table actions) |
| 20px | Default size in mobile, secondary admin emphasis |
| 24px | Mobile primary (tab bar, header) |
| 32px | Empty-state illustrations (with text below) |
| 48px+ | Hero illustrations only |

### Icon catalog
The full emoji-to-lucide mapping lives in `docs/design-system/icon-catalog.md`. It maps the existing 73 emoji to the lucide replacements. Phase 14 dispatches 07 and 08 enforce the replacement.

### Forbidden
- Emoji as iconography in committed code (Article 4.6)
- Inline SVG (use lucide; if lucide doesn't have it, ask Ken before building a custom icon)
- Multiple icon styles mixed on one screen (outline + filled + duotone — pick one set: lucide is outline)
- Icon-only buttons without an `aria-label` (a11y)
- Decorative icons without `aria-hidden="true"` (screen readers should ignore them)

### Allowed emoji
- In notification body text (`"🎉 You earned a tier upgrade"` — that's content, not iconography)
- In user-generated content (chat messages, reviews)
- In demo/fixture data only if the field is a user message (not an icon slot)

---

## 7. Component patterns (locked)

These are the canonical patterns. Every screen uses these. Drift = the screen is wrong, not the pattern.

### 7.1 Buttons

Five variants only:

| Variant | Use | Tailwind |
|---|---|---|
| `primary` | Main action on a screen (one per screen) | `bg-primary text-white hover:bg-primary-hover` |
| `secondary` | Alternate action | `border border-border text-primary hover:bg-bg-alt` |
| `tertiary` | Low-emphasis action | `text-primary hover:bg-bg-alt` |
| `danger` | Destructive action (delete, suspend, refund) | `bg-danger text-white hover:bg-red-600` |
| `ghost` | Toolbar, icon-only | `hover:bg-bg-alt` |

**Sizing:** `sm` (32px tall), `default` (40px tall), `lg` (48px tall — mobile primary).

**States required for every button:**
- Default
- Hover (cursor over)
- Focus (keyboard, with 2px outline using `brand.secondary`)
- Active (mid-click)
- Disabled (50% opacity, `cursor-not-allowed`)
- Loading (spinner replaces label, button text becomes "Loading…" for screen readers)

**Forbidden:**
- More than five sizes (we have three)
- Rounded-full buttons (only badges and avatars use full)
- Buttons with shadows (use border instead)
- Gradient backgrounds on buttons
- Multiple primary buttons on the same screen (one is "primary," others are "secondary")

### 7.2 Forms

Standard form pattern:

```
Label (14/500, text-primary)
[Input field, h-10, rounded-md, border]
Helper text (12/400, text-secondary) — optional
Error text (12/400, text-danger) — when invalid
```

**Required for every form:**
- Every field has a `<Label htmlFor>` paired with `<Input id>`
- Every required field is marked visually with `*` after the label AND announced via `aria-required="true"`
- Validation errors appear below the field with `role="alert"` and `aria-describedby` linking to the input
- Submit button is disabled while submitting
- Submit button shows a spinner (not a hang) while submitting
- Network failure shows a user-friendly error, not a stack trace
- Form preserves user input on validation error (do not clear)
- Currency inputs use `inputMode="numeric"`, accept only digits, format on blur
- Phone inputs use `inputMode="tel"`, format as `+63 9XX XXX XXXX` on blur

**Forbidden:**
- Native browser validation messages (`required` attribute alone produces "Please fill out this field" which is generic — use custom validation)
- Validation that fires on every keystroke (debounce or only on blur)
- Forms that submit on Enter without a focused submit button (especially dangerous on multi-step)
- Auto-submit on field change

### 7.3 Tables

Standard table pattern (admin):

```
[Sticky filter bar: search, filters, view-toggle, bulk-action menu]
[Table header: column titles, sort affordance, column-visibility toggle]
[Table rows: hover state, selectable checkbox if bulk action enabled]
[Empty state if no rows]
[Pagination footer: "Showing 1-50 of 1,247", page controls, page-size dropdown]
```

**Required:**
- Every list endpoint paginates (LIMIT 50 default)
- Sticky header on scroll
- Sortable columns indicated by an arrow icon (lucide `ArrowUpDown`)
- Empty state with concrete copy ("No bookings yet" not "No data")
- Loading state with skeleton rows (not a spinner over the whole table)
- Error state with retry button
- Single row selection highlight (subtle, `bg-bg-alt`)
- Right-click or row-click opens the detail page (mobile: tap)

**Forbidden:**
- Tables with no header
- Tables with no pagination (even if "you only have 5 rows now")
- Horizontal scrolling on desktop tables (squeeze columns or hide non-essential)
- Wrapping cell text by default (truncate with ellipsis, hover to see full)
- Tables with mixed text alignment per column (numbers right-aligned, text left-aligned, status centered — pick a system)

### 7.4 Modals

Standard modal pattern:

```
[Overlay: black 50% opacity]
[Modal box: white, rounded-md (8px), shadow-lg, max-width 600px]
  [Header: title + close X]
  [Body: padding 24px]
  [Footer: secondary button + primary button, right-aligned]
```

**Required:**
- Escape key closes
- Click on overlay closes (unless the modal has unsaved data — then ask)
- Focus trapped within modal while open
- Focus restored to trigger on close
- Body scroll prevented while open
- ARIA `role="dialog"` and `aria-labelledby` linking to the title
- Title is concrete and specific ("Cancel booking — confirm" not just "Confirm")

**Forbidden:**
- Modals without close affordance
- Modals that auto-dismiss
- Modals without focus management
- Modals stacked on modals (use a wizard or page navigation instead)

### 7.5 Cards

Standard card pattern:

```
[White background, border, rounded-md, padding 24px]
  [Header: title + optional action button]
  [Body]
  [Footer: optional, separated by border-top]
```

**Required:**
- Border (`border border-border`), not shadow as the only delimiter
- Consistent radius (8px for default cards, 12px for elevated)
- If interactive (clickable as a unit), full-card hover state with cursor pointer
- If a list of cards, identical card height in the row (use `flex` with `items-stretch`)

**Forbidden:**
- Random gradients on cards (anti-trust signal #1)
- Three different shadows on one screen
- Cards with too much padding making the page look sparse (use 24px not 48px)

---

## 8. States that are required, not optional

Every list, form, and async screen has all four states:

### Loading
- For lists: skeleton rows (gray placeholders matching row height) — not a spinner over a blank page
- For forms: submit button shows spinner — page does not lock
- For full-page navigation: skeleton of the page structure within 200ms

### Empty
- Concrete, encouraging copy. Examples that pass:
  - "No bookings yet. Book your first service →"
  - "Your inbox is clear. We'll notify you when there's news."
  - "No disputes filed. Customers and providers are happy."
- Examples that fail:
  - "No data" (Anti-trust signal #15 in `VISUAL-UX-AUDIT-PROTOCOL.md`)
  - "Empty"
  - "0 results"
- Pair the copy with a relevant illustration (32px or 48px lucide icon, not emoji) and an action button if applicable

### Error
- User-friendly error message (NEVER stack traces, NEVER raw API errors)
- "Retry" button when retry is meaningful
- Sentry-logged with context (user ID, action, request ID)
- Examples that pass:
  - "We couldn't load your bookings. Check your connection and try again." [Retry]
  - "Payment failed. Your card was declined. Try a different payment method or contact support."
- Examples that fail:
  - "Error: 500 Internal Server Error"
  - "TypeError: Cannot read property 'data' of undefined"
  - "Network error" (too generic — say what action failed)

### Success
- Brief, clear confirmation (toast for transient, page state change for permanent)
- Toast position: bottom-right (admin), top-center (mobile)
- Toast duration: 4 seconds, dismissable
- Toast variants: info, success, warning, error — using status palette

---

## 9. Motion (locked, conservative)

Motion exists to communicate causality, not to entertain.

| Element | Duration | Easing |
|---|---|---|
| Page transitions | 200ms | `ease-out` |
| Modal open | 200ms | `ease-out` (overlay fade) + `ease-out` (modal slide-up 8px) |
| Modal close | 150ms | `ease-in` |
| Hover state | 100ms | `ease-out` |
| Toast enter | 250ms | `ease-out` (slide from edge + fade) |
| Toast exit | 200ms | `ease-in` |
| Skeleton shimmer | 1500ms | `ease-in-out` infinite |
| Spinner | 800ms | `linear` infinite |

**Forbidden:**
- Bouncy easing (`cubic-bezier(0.68, -0.55, 0.27, 1.55)`) — use `ease-out`
- Animations longer than 400ms (anything more is theater)
- Decorative animations on mount (cards fading in one by one is a portfolio piece, not a product)
- Parallax scrolling
- Hover animations on touch devices (use `@media (hover: hover)`)

---

## 10. Layout (locked)

### Admin layout (single shell, every page)

```
┌──────────────────────────────────────────────────────────┐
│ Header: 56px tall, white bg, border-bottom               │
│   [Logo]  [Search cmd+K]      [Date]  [Notif]  [Avatar]  │
├──────────────────────────────────────────────────────────┤
│ Sidebar: 240px, dark    │ Content area: fluid, max-1600px │
│   [Dashboard]            │   [Page title + breadcrumbs]    │
│   [Providers]            │   [Sticky filter bar if list]   │
│   [Customers]            │   [Page content]                │
│   ...                    │   [Pagination if list]          │
│   [Settings]             │                                 │
└──────────────────────────────────────────────────────────┘
```

**Required:**
- Sidebar in dark variant (background `neutral.900`, text `neutral.0`, hover `neutral.800`, active `brand.primary`)
- Header on `neutral.0` background
- Active sidebar item has a 3px `brand.primary` accent on the left edge AND a `brand.primary` background tint at 10% opacity
- Search opens with `cmd+K` (or `ctrl+K`) — global, fuzzy across providers/customers/bookings/disputes
- Date/time displays Asia/Manila timezone, not user's local
- Avatar dropdown: profile, settings, logout

**Forbidden:**
- Sidebar in light variant (this was V1 default; V2 standardizes on dark)
- Multi-row sidebar items
- Sidebar items that are bare emoji (Bug 1331 area — Phase 02 should have fixed this)
- A header without breadcrumbs on detail pages

### Mobile layout

Three contexts:
1. **Auth/onboarding** — full-bleed screens, no nav
2. **Tabs (5 tabs)** — bottom tab bar (`Home`, `Bookings`, `Wallet`, `Profile`, plus context-dependent fifth)
3. **Stack pages** — nav bar with back button, title, optional action

**Bottom tab bar:**
- 64px tall (with safe area inset)
- 5 items max, never 4 or 6
- Active state: `brand.primary` icon + label, inactive: `neutral.400`
- Lucide icons at 24px, label at 12/500 below

**Top nav bar (stack pages):**
- 44px tall (plus safe area)
- Back button (lucide ChevronLeft) at 24px on left
- Title centered, 16/600
- Action button on right (icon only, with aria-label)

---

## 11. The one allowed gradient

The active-booking card on the customer home screen may use a subtle linear gradient from `brand.primary` (top-left) to `brand.primary-hover` (bottom-right). This is the only place. Everywhere else: solid color.

Reasoning: the active booking is the most important thing on the customer home; a subtle gradient draws the eye without screaming. We're not Apple Music.

---

## 12. Accessibility (locked, WCAG AA minimum)

### Color contrast
Every text-on-background pair must meet WCAG AA 4.5:1 minimum. Verified by `verify-color-contrast.sh` (added in Dispatch 07). Combinations that fail:
- `neutral.400` text on `neutral.50` background (3.4:1 — only use as decorative or paired with sufficient size)
- `brand.secondary` text on white (3.1:1 — never as text; only as accent line, focus ring)

### Focus
Every interactive element shows a visible focus ring on keyboard focus:
- 2px outline using `brand.secondary` `#00B4D8`
- 2px offset from the element
- Not just `:hover` styled — keyboard users need it

### Screen readers
- Every form field has a programmatically associated label
- Every button has accessible text (label or aria-label)
- Every image has alt text (or `alt=""` if decorative)
- Every status change announces via `aria-live` (e.g., "Booking confirmed" toast triggers a live region)
- Every modal traps focus, has `role="dialog"`, restores focus on close

### Keyboard
- Every interactive thing is keyboard accessible
- Tab order follows visual order
- Escape closes modals and cancels in-progress actions
- Enter on a button activates it; Space on a button activates it; Enter on a link activates it

### Touch targets (mobile)
- Minimum 44×44px tap area for any tappable element
- 8px gap between adjacent tap targets

---

## 13. Anti-trust signals — what makes this look "AI-generated" (forbidden)

These are the patterns that scream "prototype" or "AI-generated." Every one is forbidden in committed code:

1. ✗ Random gradients on every card
2. ✗ Three icon styles mixed (outline + filled + duotone)
3. ✗ Inconsistent corner radius (4 / 8 / 12 / 16 mixed on the same screen with no rationale)
4. ✗ Buttons in 5 different sizes
5. ✗ Mismatched font weights on similar elements (one heading 600, the next 700)
6. ✗ Drop shadows on everything OR nothing
7. ✗ Stacked emojis as decoration
8. ✗ "Lorem ipsum" or placeholder copy
9. ✗ Centered everything (looks like a marketing landing page when it's an admin)
10. ✗ Cards with too much padding making the page feel sparse
11. ✗ Tables with column widths that don't match data
12. ✗ Empty states that just say "No data"
13. ✗ Loading states that are blank instead of skeletons
14. ✗ Error states that show JSON or stack traces
15. ✗ "Coming Soon" labels on shipped product
16. ✗ Spinners that hang (no timeout or retry path)
17. ✗ Dead buttons that do nothing on click
18. ✗ Broken images (always have a fallback)
19. ✗ Horizontal scrollbars on desktop content
20. ✗ Mismatched form field heights (some 36px, some 40px, some 48px)

---

## 14. Component checklist (every screen verifies all)

Before claiming a screen is done, the AI coder verifies all of these. The verification produces an artifact that the visual gate (Gate D) reads.

```
[ ] Uses tokens from tokens.json — no hex literals
[ ] Uses lucide icons via @/components/icons — no emoji
[ ] Spacing on the 4-based scale only
[ ] Border radius from {4, 8, 12, 16, full}
[ ] Buttons follow the 5-variant + 3-size system
[ ] Forms have labels, validation, helper text, required markers
[ ] Tables paginate, have empty/loading/error states
[ ] Modals trap focus, escape-close, restore focus
[ ] Loading state has skeleton (not blank)
[ ] Empty state has concrete copy + illustration
[ ] Error state has user-friendly message + retry
[ ] Success state has confirmation
[ ] Color contrast WCAG AA on all text
[ ] Focus rings visible on keyboard
[ ] Touch targets >= 44px (mobile)
[ ] Screen renders correctly at 1920, 1440, 1280, 768, 414, 375
[ ] Network tab shows no failed requests in console
[ ] Console is empty (no warnings, no errors)
[ ] Sentry has not received any error from this screen during testing
[ ] Lucide-only icons; no inline SVG; no emoji
[ ] Asia/Manila timezone everywhere a date displays
[ ] All currency uses formatCurrency() helper
[ ] No "Coming Soon" / "Not Implemented" / "TODO" labels
[ ] Real data shown (or accurate fixture, never lorem ipsum)
```

If any item fails, the screen is not done. The visual gate fails and the dispatch fails.

---

## 15. The "$100K UX" test

After every UI change, the AI coder asks itself two questions and writes the answer in `quality-reasoning.md`:

**Q1 — If a paying customer used this for the first time, would they trust the platform with ₱5,000 in escrow for a plumbing job?**

Pass criteria: the answer is "yes, because [list 3 specific trust signals]."
Fail signal: the answer is "yes, I think so" or "yes, the design tokens are correct."

**Q2 — If a designer at a $100K-budget agency in Kyiv saw this screen, would they say "this is shippable" or "this is a prototype"?**

Pass criteria: the answer is "shippable, because [list 2 polish details that wouldn't exist on a prototype]."
Fail signal: the answer is "shippable, the basic patterns are followed."

Vague answers fail. Specific answers pass. Both questions and answers go in the visual report.

---

## 16. Hiring a designer later

Ken has asked whether to hire a UX/UI design firm. The answer for now: **not yet.**

Reasoning:
- Three brand colors disagree across docs and code (Bug 1324). A designer walking in today would charge to fix what is fundamentally a discipline problem.
- The routes registry doesn't match the filesystem (Bug 1185-1188). Half the screens listed in any wireframing doc would be ghost references.
- Four cancellation policies coexist (Bug 1170/1198). Whichever one a designer designs against, three are wrong.
- SiguradoShield has six UI surfaces with no backend (Bug 538). A designer would design more surfaces and the gap would grow.

After Phase 14 dispatches 02 (sources of truth) and 04 (SiguradoShield decision), the foundation is stable enough for designer engagement. A good designer can then redesign the dashboard, the checkout flow, the dispute experience, and the SiguradoShield trust pages on top of locked tokens, locked components, and accurate routes.

When that time comes, the brief is:
- Read this Design Contract V2 — these are the constraints
- Read `SCREEN-CATALOG.md` — these are the screens
- The design tokens are locked; the design is not
- Output: Figma file with auto-layout components matching the lucide icon set, Inter typography, and the 4-based spacing scale; tested against the 6 viewport widths; covering loading/empty/error/success for every screen
- Budget: $30K-50K USD for a 4-week engagement covering admin redesign + mobile redesign + handoff
- Avoid: agencies that want to introduce their own design system, agencies that want to use Figma plugins for design tokens, agencies that don't speak Tailwind

This contract makes their job tractable. Without it, you're paying them to build the contract.

---

**Document version:** V2
**Locked by:** Ken (pending sign-off on this document)
**Supersedes:** `docs/architecture/DESIGN-CONTRACT.md` (V1) on Ken's approval
**Enforcement:** `scripts/verify-design-tokens.sh` + Gate A + visual screenshot gate
