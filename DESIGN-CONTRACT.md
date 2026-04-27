# DESIGN CONTRACT

The visual identity of onService PH. Locked. AI coder cannot change without Ken approval.

---

## Brand identity

**Name:** onService
**Tagline:** "Trusted Home Services" (English) / "Maaasahang Serbisyo sa Bahay" (Tagalog secondary)
**Voice:** Direct, friendly, professional. Not bro-y. Not corporate. The voice of someone who shows up on time and does the job.
**Positioning:** "The home services platform that guarantees the work."

## Color palette

Source of truth: `docs/design-system/tokens.json`

### Primary brand
- **Primary blue** `#0F62FE` — sidebar accent, primary buttons, links
- **Primary hover** `#0353E9`
- **Primary active** `#002D9C`

### Status colors (semantic, used consistently)
- **Success green** `#24A148` — completed bookings, success messages, positive trends
- **Warning amber** `#F1C21B` — pending states, soft warnings, expiring documents
- **Danger red** `#DA1E28` — disputes, errors, suspended states, critical alerts
- **Info blue** `#0043CE` — informational messages, neutral status badges

### Neutral grays (Carbon-inspired)
- `#FFFFFF` (background)
- `#F4F4F4` (background secondary, page bg)
- `#E0E0E0` (border default)
- `#C6C6C6` (border strong)
- `#525252` (text secondary)
- `#161616` (text primary)

### Don't use
- Gradients (except the active booking card spec'd in old audit)
- Multiple shades of the same color in one screen
- Color combinations failing WCAG AA contrast (4.5:1 minimum)
- Brand colors of competitors (Lazada orange, Shopee orange, Grab green)

## Typography

**Sans:** Inter — primary UI font
**Mono:** JetBrains Mono — code, IDs, monospace data

### Scale
- 11px — captions, hint text
- 12px — secondary text, table cell text
- 14px — body, button labels (admin)
- 16px — body, button labels (mobile, larger touch targets)
- 18px — section headings
- 20px — page subtitles
- 24px — page titles (H1)
- 30px — KPI numbers (big stats)
- 36px — hero numbers (dashboard wallet balances)

### Weights
- 400 (regular) — body
- 500 (medium) — labels, emphasis
- 600 (semibold) — button text, table headers
- 700 (bold) — headings, KPIs

## Iconography

**Library:** lucide-react (admin) and lucide-react-native (mobile). NO OTHER ICON LIBRARIES.

### Usage rules
1. Always import from `@/components/icons` — never directly from `lucide-react`.
2. Default size: 16px (admin), 20-24px (mobile).
3. Color comes from semantic class (`text-success`, `text-danger`, etc.) — not inline.
4. Always pair with text or aria-label. No icon-only buttons unless the icon's meaning is universally understood (close X on modals, hamburger ≡ on nav).

### Icon categories
See `docs/design-system/icon-catalog.md` for the full mapping table.

## Spacing scale

4-based scale (Tailwind default):
- 0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96px

Use spacing tokens, never magic numbers.

## Border radius
- `none` (0) — borderless containers
- `sm` (4px) — input fields, badges
- `md` (8px) — buttons, small cards
- `lg` (12px) — large cards, dialogs
- `xl` (16px) — page-level containers
- `full` (9999px) — pills, avatars

## Shadows
Use sparingly:
- `sm` — subtle card lift (most cards)
- `md` — modals, dropdowns
- `lg` — popovers, tooltips

## Components — specifications

### KpiCard
```
┌─────────────────┐
│ Title       icon│
│                 │
│ ₱42,580         │
│ ↑ 12% vs y'day  │
└─────────────────┘
```
Padding: 20px. Border-radius: 12px. Border: 1px solid neutral-100. Background: white. Title 14px secondary. Number 30px bold. Trend 12px colored.

### Button (variants: default, destructive, outline, secondary, ghost, link)
```
[ Primary action ]    bg blue, white text
[ Destructive    ]    bg red, white text
[ Outline        ]    border, no fill
[ Secondary      ]    bg gray, dark text
[   Ghost        ]    no border no fill
[ Link            ]    blue underlined text
```
Sizes: default (h-9), sm (h-8), lg (h-10), icon (h-9 w-9).

### Badge
```
[ Active ]    [ Pending ]    [ Suspended ]
green bg     amber bg       red bg
```
12px text, 4px py, 8px px, rounded-full.

### Tabs
```
┌─Profile─┬─Jobs─┬─Financials─┬─...─┐
│ active  │      │            │     │
│ blue    │      │            │     │
│ underln │      │            │     │
└─────────┴──────┴────────────┴─────┘
```
Active tab: blue underline, blue text. Inactive: gray text, no underline.

### Card with header
```
┌────────────────────┐
│ Card Title         │
├────────────────────┤
│ Card content here  │
│ ...                │
└────────────────────┘
```
Border 1px neutral-100. Radius 12px. Title 16px semibold. Header padding 16px. Content padding 20px.

### DataTable
- Striped rows: alternate white / neutral-50
- Header: neutral-50 bg, 12px semibold dark text
- Cell padding: 12px x 16px
- Hover: neutral-50 bg
- Sort indicators: small arrow icons next to header text

### Empty State
```
┌────────────────────┐
│      [icon]        │
│                    │
│   "No data yet"    │
│                    │
│   [ Take action ]  │
└────────────────────┘
```
Centered. Lucide icon 48px gray. Heading 18px medium. CTA button below.

### Loading State
- Use Skeleton primitive (gray placeholder rectangles)
- Match the shape of the eventual content
- No spinners on full pages — only on inline actions (button submit)

### Error State
```
┌────────────────────┐
│  ⚠ icon (red)      │
│                    │
│  Something went    │
│  wrong loading X.  │
│                    │
│  [ Try again ]     │
└────────────────────┘
```

## Mobile-specific

### Touch targets
- Minimum 44x44 px hit area (Apple HIG, Material guidance)
- Buttons height 48px on mobile (vs 36-40px admin)

### Screens hierarchy
- Tab bar at bottom (5 tabs max, with lucide icons + label)
- Header at top (back button, title, optional action)
- Content area scrollable

### Cards on mobile
- Full-width with 16px horizontal padding from screen edge
- 12-16px vertical spacing between cards
- Touch-feedback ripple/highlight on tap

### Bottom sheets vs modals
- Bottom sheets for choices, filters, quick actions
- Full modals for forms with multiple fields
- Both dismissible by swipe down + tap outside + close button

## Accessibility (non-negotiable)

- WCAG AA contrast (4.5:1 for body text, 3:1 for large text)
- All interactive elements keyboard-navigable
- All images have alt text or aria-hidden
- All icons paired with text labels OR aria-label
- All form inputs paired with `<label>` tags
- All status updates announced to screen readers (aria-live)
- All errors associated with the field that caused them
- No reliance on color alone (always pair with text or icon)

## Animation

Subtle and purposeful. Never decorative.

- 150-200ms for hover/focus transitions
- 200-300ms for modal/sheet open
- 300-400ms for page transitions (mobile)
- Respect prefers-reduced-motion (disable all animation)

## What NOT to do

- Don't use emoji as iconography (constitution Article 4.6)
- Don't use multiple typefaces (Inter only)
- Don't use bright accent colors not in the palette
- Don't put gradients on text
- Don't skip empty/error/loading states
- Don't use heading levels for visual style — use them semantically
- Don't override component variants with !important
