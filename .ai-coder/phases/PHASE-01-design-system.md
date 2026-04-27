# PHASE 01 — DESIGN SYSTEM

**Goal:** Build the design contract — install lucide icon libraries, create reusable component primitives, document the icon catalog mapping every existing emoji to a lucide replacement.


> **⚠️ READ FIRST:** Before starting this phase, read `.ai-coder/phases/PHASE-HEADER.md`. After every meaningful change in this phase you must run the after-every-change sanity ritual and log to `.ai-coder/checkpoints/logs/PHASE-NN/sanity-checks.log`. `verify-master.sh` checks this at end of phase.


**Branch:** `phase/01-design-system`
**Estimated time:** 4 hours
**Dependencies:** Phase 00 complete and merged
**Risk:** Low — adds new code, doesn't modify existing screens

---

## Step 1 — Pre-flight

```bash
git checkout main
git pull
git checkout -b phase/01-design-system
bash .ai-coder/checkpoints/verify-phase.sh PHASE-01-preflight
```

## Step 2 — Install icon libraries

```bash
# Admin
cd apps/admin
npm install --save-exact lucide-react@0.456.0

# Mobile
cd ../mobile
npm install --save-exact lucide-react-native@0.456.0
npm install --save-exact react-native-svg@15.8.0   # peer dep of lucide-react-native

cd ../..
```

Verify:

```bash
grep "lucide-react" apps/admin/package.json
grep "lucide-react-native" apps/mobile/package.json
```

Both must show the exact pinned versions.

## Step 3 — Build the icon catalog

Create `docs/design-system/icon-catalog.md` listing every emoji currently in the codebase and its lucide replacement.

The 73 emojis to replace are documented in `docs/design-system/icon-catalog.md` (you'll create this — see template below).

Run this to generate the starting list:

```bash
grep -rnE '🧹|🔧|⚡|🏠|💰|📋|⚠️|👤|🎨|🚿|📊|👥|📦|💹|⚖️|💸|📣|🔄|🏢|📍|📈|🔍|🎫|⚙️|🚨|⏰|📅|🎉|📁|🔒|🛠️|🚀|✅|❌' apps/admin/src apps/mobile/app 2>/dev/null > /tmp/emoji-uses.txt
wc -l /tmp/emoji-uses.txt
```

Expected: ~73 lines.

Use this canonical mapping (paste into `docs/design-system/icon-catalog.md`):

```markdown
# Icon Catalog

The icon library for onService PH is **lucide-react** (admin) and **lucide-react-native** (mobile). No other icon libraries. No emoji as iconography.

## Mapping table

| Emoji | Context | lucide-react component | Notes |
|---|---|---|---|
| 🧹 | Cleaning category | `Sparkles` | Use for all "clean" contexts |
| 🔧 | Plumbing / Provider | `Wrench` | |
| ⚡ | Electrical / Rush | `Zap` | |
| 🏠 | Home category | `Home` | |
| 💰 | Money / Revenue | `Coins` | Or `DollarSign` (but DollarSign for status, Coins for revenue) |
| 📋 | Bookings / Lists | `ClipboardList` | |
| ⚠️ | Warning / Alert | `AlertTriangle` | |
| 👤 | User / Profile | `User` | |
| 🎨 | Painting | `Paintbrush2` | |
| 🚿 | Plumbing alt | `ShowerHead` | |
| 📊 | Dashboard | `LayoutDashboard` | |
| 👥 | Customers | `Users` | |
| 📦 | Catalog / Services | `Package` | |
| 💹 | Pricing rules / charts | `TrendingUp` | |
| ⚖️ | Disputes | `Scale` | |
| 💸 | Payouts | `Banknote` | |
| 📣 | Notification templates | `Megaphone` | |
| 🔄 | Recurring | `Repeat` | |
| 🏢 | Business / B2B | `Building2` | |
| 📍 | Service Areas | `MapPin` | |
| 📈 | Analytics | `LineChart` | |
| 🔍 | Audit Log / Search | `Search` | |
| 🎫 | Support Tickets | `Ticket` | |
| ⚙️ | Settings | `Settings` | |
| 🚨 | Escalated alerts | `AlertCircle` | |
| ⏰ | Time / Schedule | `Clock` | |
| 📅 | Calendar | `Calendar` | |
| 🎉 | Celebration (KEEP — content) | n/a | OK in user-facing notification text |
| 📁 | Documents | `Folder` | |
| 🔒 | Security / Locked | `Lock` | |
| 🛠️ | Tools / Maintenance | `Hammer` | |
| 🚀 | Launch / Featured | `Rocket` | |
| ✅ | Success | `Check` or `CheckCircle2` | |
| ❌ | Error | `X` or `XCircle` | |

## Usage rules

1. Always import from the central icon module, never directly:
   ```ts
   // GOOD (admin)
   import { Coins, Wrench, Calendar } from '@/components/icons';

   // BAD
   import { Coins } from 'lucide-react';
   ```

2. Icon components must accept `className` prop for sizing.

3. Default size: 16px (1rem). Use `size={20}` for emphasis, `size={24}` for primary nav.

4. Always pair an icon with an aria-label or visible text. No icon-only buttons unless the button's purpose is universally understood (e.g., close X on a modal).

5. Status icons must use semantic colors from tokens.json:
   - Success: `text-success` (#24A148)
   - Warning: `text-warning` (#F1C21B)
   - Danger: `text-danger` (#DA1E28)
   - Info: `text-info` (#0043CE)

## Where emoji ARE allowed

- User-generated content (chat messages, reviews)
- Notification BODY text (not icon slot): "🎉 You earned a tier upgrade!" is OK
- Admin notes (free-text)

NOT allowed in:
- Sidebar navigation
- Dashboard KPI cards
- Mobile tab bar
- Badge labels
- Empty state illustrations (use `lucide-react` icons or SVG)
```

## Step 4 — Build the icon component module (admin)

Create `apps/admin/src/components/icons/index.ts`:

```ts
/**
 * Centralized icon module for the admin panel.
 * All icons must be imported FROM this file, not directly from lucide-react.
 *
 * To add a new icon: import it from lucide-react and re-export here with a
 * descriptive name. Document semantic intent in docs/design-system/icon-catalog.md.
 */

export {
  // Navigation
  LayoutDashboard,
  Users,
  Wrench,
  ClipboardList,
  Package,
  TrendingUp,
  Scale,
  Coins,
  Banknote,
  Megaphone,
  Repeat,
  Building2,
  MapPin,
  LineChart,
  Search,
  Ticket,
  Settings,

  // Service categories
  Sparkles,        // Cleaning
  Zap,             // Electrical / Rush
  ShowerHead,      // Plumbing alt
  Paintbrush2,     // Painting
  Home,            // Home category
  Hammer,          // Carpentry / Tools

  // Status & alerts
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  X,
  XCircle,
  Info,
  Clock,
  Calendar,

  // Profile & users
  User,
  UserCheck,
  UserX,
  UserPlus,
  Shield,
  Lock,

  // Files & docs
  Folder,
  FileText,
  Image as ImageIcon,
  Download,
  Upload,
  Eye,
  EyeOff,

  // Charts (for dashboard)
  BarChart,
  BarChart3,
  PieChart,
  Activity,
  TrendingDown,

  // Actions
  Plus,
  Minus,
  Edit,
  Trash2,
  Save,
  Send,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  MoreHorizontal,
  MoreVertical,
  Filter,
  SortAsc,
  SortDesc,
  ExternalLink,
  Copy,

  // Communication
  Phone,
  Mail,
  MessageSquare,
  Bell,
  BellOff,

  // Misc
  Rocket,
  Star,
  Heart,
  Flag,
  Tag,
  Tags,
  Globe,
  Map,
  Navigation,
  Truck,
  CreditCard,
  Receipt,
  Wallet,
  HelpCircle,
} from 'lucide-react';
```

## Step 5 — Build the icon component module (mobile)

Create `apps/mobile/src/components/icons/index.ts`:

```ts
/**
 * Centralized icon module for the mobile app.
 * Re-exports from lucide-react-native.
 * Same structure as admin/src/components/icons.
 */

export {
  Sparkles,
  Wrench,
  Zap,
  ShowerHead,
  Paintbrush2,
  Home,
  Hammer,
  Bell,
  BellOff,
  User,
  UserCheck,
  Users,
  ClipboardList,
  Calendar,
  Clock,
  MapPin,
  Map as MapIcon,
  Navigation,
  Phone,
  Mail,
  MessageSquare,
  Star,
  Heart,
  Camera,
  Image as ImageIcon,
  Upload,
  Download,
  Eye,
  EyeOff,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  Search,
  Filter,
  Plus,
  Minus,
  X,
  Check,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  ArrowLeft,
  Coins,
  Banknote,
  CreditCard,
  Wallet,
  Receipt,
  Tag,
  Settings,
  HelpCircle,
  LogOut,
  Lock,
  Shield,
  Repeat,
  Refresh as RefreshIcon,
} from 'lucide-react-native';
```

## Step 6 — Build the reusable component primitives

These already partially exist (`Badge`, `DataTable`, `KpiCard`, `Pagination`). Audit and standardize them.

Create `apps/admin/src/components/ui/Button.tsx`:

```tsx
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-blue-600 text-white hover:bg-blue-700',
        destructive: 'bg-red-600 text-white hover:bg-red-700',
        outline: 'border border-gray-300 bg-white hover:bg-gray-50',
        secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300',
        ghost: 'hover:bg-gray-100',
        link: 'text-blue-600 underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-10 px-6',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant, size, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`${buttonVariants({ variant, size })} ${className}`}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
```

Add `class-variance-authority` to admin:

```bash
cd apps/admin
npm install --save-exact class-variance-authority@0.7.1
cd ../..
```

Continue creating these primitives in `apps/admin/src/components/ui/`:
- `Card.tsx` (with CardHeader, CardContent, CardFooter)
- `Dialog.tsx` (uses @radix-ui/react-dialog)
- `Tabs.tsx` (uses @radix-ui/react-tabs)
- `Select.tsx` (uses @radix-ui/react-select)
- `Input.tsx`
- `Label.tsx`
- `Textarea.tsx`
- `Checkbox.tsx` (uses @radix-ui/react-checkbox)
- `Switch.tsx` (uses @radix-ui/react-switch)
- `Tooltip.tsx` (uses @radix-ui/react-tooltip)
- `Skeleton.tsx`
- `EmptyState.tsx`
- `LoadingState.tsx`
- `ErrorState.tsx`
- `Chart.tsx` (wrapper around recharts with consistent theming)

For each primitive, follow the existing `Badge.tsx` style: small focused component, accepts className, uses tokens from CSS variables.

Install Radix:

```bash
cd apps/admin
npm install --save-exact @radix-ui/react-dialog@1.1.2 @radix-ui/react-tabs@1.1.1 @radix-ui/react-select@2.1.2 @radix-ui/react-checkbox@1.1.2 @radix-ui/react-switch@1.1.1 @radix-ui/react-tooltip@1.1.4 @radix-ui/react-label@2.1.0
cd ../..
```

## Step 7 — Tailwind config update

Update `apps/admin/tailwind.config.js` to use the design tokens. The tokens.json values get mirrored as CSS custom properties or directly in tailwind config.

Update `apps/admin/src/index.css` to define CSS variables from tokens:

```css
:root {
  /* Brand */
  --color-primary: #0F62FE;
  --color-primary-hover: #0353E9;
  --color-primary-active: #002D9C;
  --color-secondary: #6F6F6F;
  --color-accent: #FA4D56;

  /* Status */
  --color-success: #24A148;
  --color-success-bg: #DEFBE6;
  --color-warning: #F1C21B;
  --color-warning-bg: #FCF4D6;
  --color-danger: #DA1E28;
  --color-danger-bg: #FFF1F1;
  --color-info: #0043CE;
  --color-info-bg: #EDF5FF;

  /* Neutral */
  --color-text: #161616;
  --color-text-secondary: #525252;
  --color-text-tertiary: #8D8D8D;
  --color-background: #FFFFFF;
  --color-background-secondary: #F4F4F4;
  --color-border: #E0E0E0;
  --color-border-strong: #C6C6C6;

  /* Typography */
  --font-sans: Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', Menlo, monospace;

  /* Spacing scale already in Tailwind defaults */
}

body {
  font-family: var(--font-sans);
  color: var(--color-text);
  background-color: var(--color-background);
}
```

## Step 8 — Verify

```bash
bash .ai-coder/checkpoints/verify-phase.sh PHASE-01
```

Expected: PASS.

Visual check:

```bash
cd apps/admin
npm run dev
```

Open http://localhost:5173. The existing pages should still work (no functional changes yet). Console should show zero errors.

## Step 9 — Commit

```bash
git add docs/design-system/icon-catalog.md
git add apps/admin/src/components/icons/
git add apps/admin/src/components/ui/
git add apps/admin/src/index.css
git add apps/admin/package.json apps/admin/package-lock.json
git add apps/mobile/src/components/icons/
git add apps/mobile/package.json apps/mobile/package-lock.json

git commit -m "phase 01: design system — install lucide, build component primitives, define tokens

Adds:
- lucide-react@0.456.0 (admin) and lucide-react-native@0.456.0 (mobile)
- @radix-ui primitives (dialog, tabs, select, checkbox, switch, tooltip, label)
- class-variance-authority for variant-based component styling
- Centralized icon modules at apps/*/src/components/icons/index.ts
- Reusable component primitives: Button, Card, Dialog, Tabs, Select, Input, Label, Textarea, Checkbox, Switch, Tooltip, Skeleton, EmptyState, LoadingState, ErrorState, Chart
- CSS variables in apps/admin/src/index.css mirroring tokens.json
- Icon catalog at docs/design-system/icon-catalog.md mapping every emoji to lucide

This phase does NOT modify any existing screen. Existing emoji icons remain in place
and will be replaced in Phase 02.

Checkpoints: see .ai-coder/checkpoints/logs/PHASE-01.log
"
```

## Step 10 — Phase report

```
**Phase 01 — Design System**
Status: PASS

Summary: Installed lucide-react and lucide-react-native at version 0.456.0. Added Radix UI primitives. Created centralized icon modules. Built 16 reusable component primitives in apps/admin/src/components/ui/. Defined CSS variables from design tokens.

Files changed: ~25 files added, 0 modified.

Checkpoint log: .ai-coder/checkpoints/logs/PHASE-01.log

Screens to review: None — this phase adds infrastructure but doesn't change visible UI yet. Phase 02 will replace all emoji icons with the new lucide system.

Open questions: None.

Next phase: PHASE-02 (Icon Replacement) — pending your approval.
```

STOP. Wait for "approved, proceed to Phase 02."
