# PHASE 02 — ICON REPLACEMENT

**Goal:** Replace every emoji used as iconography with lucide icons. After this phase, the admin sidebar, dashboard, all admin pages, and the mobile app use real iconography. The "looks like a toy" complaint is resolved.


> **⚠️ READ FIRST:** Before starting this phase, read `.ai-coder/phases/PHASE-HEADER.md`. After every meaningful change in this phase you must run the after-every-change sanity ritual and log to `.ai-coder/checkpoints/logs/PHASE-NN/sanity-checks.log`. `verify-master.sh` checks this at end of phase.


**Branch:** `phase/02-icon-replacement`
**Estimated time:** 3 hours
**Dependencies:** Phase 01 complete and merged
**Risk:** Medium — touches many files but each change is mechanical

---

## Step 1 — Pre-flight

```bash
git checkout main && git pull
git checkout -b phase/02-icon-replacement
bash .ai-coder/checkpoints/verify-phase.sh PHASE-02-preflight
```

## Step 2 — The Sidebar (most important)

Edit `apps/admin/src/components/Sidebar.tsx`. Replace the emoji icons array with lucide components.

Current code:
```tsx
{ to: '/', icon: '📊', label: 'Dashboard' },
{ to: '/providers', icon: '🔧', label: 'Providers' },
{ to: '/customers', icon: '👥', label: 'Customers' },
// ... all 18 items
```

New code:
```tsx
import {
  LayoutDashboard, Wrench, Users, ClipboardList, Package, TrendingUp,
  Scale, Coins, Banknote, Megaphone, Repeat, Building2, MapPin, LineChart,
  Search, Ticket, User, Settings,
} from '@/components/icons';

const navItems = [
  { to: '/', Icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/providers', Icon: Wrench, label: 'Providers' },
  { to: '/customers', Icon: Users, label: 'Customers' },
  { to: '/bookings', Icon: ClipboardList, label: 'Bookings' },
  { to: '/catalog', Icon: Package, label: 'Catalog' },
  { to: '/pricing-rules', Icon: TrendingUp, label: 'Pricing Rules' },
  { to: '/disputes', Icon: Scale, label: 'Disputes' },
  { to: '/financials', Icon: Coins, label: 'Financials' },
  { to: '/payouts', Icon: Banknote, label: 'Payouts' },
  { to: '/notification-templates', Icon: Megaphone, label: 'Templates' },
  { to: '/recurring', Icon: Repeat, label: 'Recurring' },
  { to: '/business-accounts', Icon: Building2, label: 'Business' },
  { to: '/service-areas', Icon: MapPin, label: 'Service Areas' },
  { to: '/analytics', Icon: LineChart, label: 'Analytics' },
  { to: '/audit-log', Icon: Search, label: 'Audit Log' },
  { to: '/support-tickets', Icon: Ticket, label: 'Support' },
  { to: '/staff', Icon: User, label: 'Staff & Roles' },
  { to: '/settings', Icon: Settings, label: 'Settings' },
];
```

Render as:
```tsx
{navItems.map((item) => (
  <NavLink key={item.to} to={item.to} className={...}>
    <item.Icon size={18} className="shrink-0" />
    <span>{item.label}</span>
  </NavLink>
))}
```

## Step 3 — The Dashboard KPI cards

Edit `apps/admin/src/pages/DashboardPage.tsx`.

Replace each KpiCard's emoji prop with a lucide icon component:

```tsx
// BEFORE
<KpiCard title="Today's Revenue" value={formatCurrency(data.todayRevenue)} icon="💰" />

// AFTER
import { Coins, ClipboardList, AlertTriangle, UserPlus, Wrench, Calendar, AlertCircle, Clock } from '@/components/icons';

<KpiCard
  title="Today's Revenue"
  value={formatCurrency(data.todayRevenue)}
  icon={<Coins className="text-green-600" size={20} />}
/>
<KpiCard
  title="Active Bookings"
  value={data.activeBookings}
  icon={<ClipboardList className="text-blue-600" size={20} />}
/>
<KpiCard
  title="Pending Disputes"
  value={data.pendingDisputes}
  icon={<AlertTriangle className={data.pendingDisputes > 0 ? "text-red-600" : "text-gray-400"} size={20} />}
/>
<KpiCard
  title="New Signups Today"
  value={data.newSignupsToday}
  icon={<UserPlus className="text-blue-600" size={20} />}
/>
<KpiCard
  title="Provider Approvals Queue"
  value={data.pendingProviderApprovals}
  icon={<Wrench className="text-blue-600" size={20} />}
/>
<KpiCard
  title="Today's Bookings"
  value={data.todayBookings}
  icon={<Calendar className="text-blue-600" size={20} />}
/>
<KpiCard
  title="Escalated Disputes"
  value={data.alerts.escalatedDisputes}
  icon={<AlertCircle className={data.alerts.escalatedDisputes > 0 ? "text-red-600" : "text-gray-400"} size={20} />}
/>
<KpiCard
  title="Stale Disputes (48h+)"
  value={data.alerts.staleDisputes}
  icon={<Clock className={data.alerts.staleDisputes > 0 ? "text-amber-600" : "text-gray-400"} size={20} />}
/>
```

Update `apps/admin/src/components/ui/KpiCard.tsx` to accept a ReactNode icon (not just string):

```tsx
interface KpiCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: { value: number; direction: 'up' | 'down' };
}

export function KpiCard({ title, value, icon, trend }: KpiCardProps): React.ReactElement {
  return (
    <div className="bg-white rounded-xl border border-[var(--color-border)] p-5">
      <div className="flex items-start justify-between mb-3">
        <span className="text-sm text-[var(--color-text-secondary)]">{title}</span>
        <div className="text-2xl">{icon}</div>
      </div>
      <p className="text-3xl font-bold text-[var(--color-text)]">{value}</p>
      {trend && (
        <p className={`text-xs mt-1 ${trend.direction === 'up' ? 'text-green-600' : 'text-red-600'}`}>
          {trend.direction === 'up' ? '↑' : '↓'} {trend.value}% vs yesterday
        </p>
      )}
    </div>
  );
}
```

## Step 4 — The remaining 18 admin pages

For each admin page that uses emoji icons, replace them. Search systematically:

```bash
for file in apps/admin/src/pages/*.tsx; do
  if grep -lE '🧹|🔧|⚡|🏠|💰|📋|⚠️|👤|🎨|🚿|📊|👥|📦|💹|⚖️|💸|📣|🔄|🏢|📍|📈|🔍|🎫|⚙️|🚨|⏰|📅|🎉|📁|🔒|🛠️|🚀|✅|❌' "$file"; then
    echo "=== $file ==="
    grep -nE '🧹|🔧|⚡|🏠|💰|📋|⚠️|👤|🎨|🚿|📊|👥|📦|💹|⚖️|💸|📣|🔄|🏢|📍|📈|🔍|🎫|⚙️|🚨|⏰|📅|🎉|📁|🔒|🛠️|🚀|✅|❌' "$file"
  fi
done
```

For each emoji found, look at the icon catalog and replace with the corresponding lucide component.

**Specific files known to have emoji** (from baseline audit):
- `PricingRulesPage.tsx` line 41 (`'⚡ Rush'`)
- `FinancialsPage.tsx` line 140
- `DashboardPage.tsx` lines 66, 73, 75, 76 (handled in Step 3)

**The pattern:** Replace the emoji in JSX with `<Icon size={N} className="..." />` and the emoji in object literals/labels with a separate icon component prop.

## Step 5 — Mobile screens

Search the mobile app:

```bash
for file in apps/mobile/app/**/*.tsx apps/mobile/src/**/*.tsx; do
  if grep -lE '🧹|🔧|⚡|🏠|💰|📋|⚠️|👤|🎨|🚿|📊|👥|📦|💹|⚖️|💸|📣|🔄|🏢|📍|📈|🔍|🎫|⚙️|🚨|⏰|📅|🎉|📁|🔒|🛠️|🚀|✅|❌' "$file" 2>/dev/null; then
    echo "=== $file ==="
  fi
done
```

For each match:
- If it's an icon position (button, tab bar, list item leading icon), replace with lucide-react-native
- If it's user-facing text content (notification body, review text, chat message), leave it (those are content, not icons)

Common patterns to fix:
- Home screen category grid (`(tabs)/home.tsx` likely has 🧹🔧⚡ etc)
- Tab bar icons (`(tabs)/_layout.tsx`)
- Provider tab bar (`(provider-tabs)/_layout.tsx`)
- Onboarding category selection
- Dashboard headers

## Step 6 — Run the no-emoji checkpoint

```bash
bash .ai-coder/checkpoints/verify-no-emoji.sh
```

Expected: `PASS: No emoji-as-iconography found.`

If it shows any FAIL lines, fix those files and re-run. Do NOT proceed to commit until this passes.

## Step 7 — Visual check

```bash
# Admin
cd apps/admin && npm run dev &

# Mobile
cd apps/mobile && npm run start &
```

Open the admin in browser. Click through every page in the sidebar. Confirm:
- Sidebar nav has lucide icons, not emoji
- Dashboard KPI cards have lucide icons
- All other pages — no emoji as icon
- All icons render at the right size and color
- No console errors

Open the mobile app (Expo Go on phone or simulator). Click through:
- Customer home screen — category icons
- Customer tab bar
- Provider home — category icons
- Provider tab bar
- Onboarding screens
- Service detail screens

Take screenshots and put them in `.ai-coder/checkpoints/logs/PHASE-02-screenshots/` for Ken's review.

## Step 8 — Run full verification

```bash
bash .ai-coder/checkpoints/verify-phase.sh PHASE-02
```

All checks must pass. Especially `verify-no-emoji.sh`.

## Step 9 — Commit

```bash
git add -A
git commit -m "phase 02: replace 73 emoji icons with lucide-react across admin and mobile

The 'looks like a toy' problem is resolved. The admin sidebar, dashboard KPI cards,
and every page now use professional iconography from lucide-react. Mobile screens
use lucide-react-native for the same.

Files changed:
- apps/admin/src/components/Sidebar.tsx: 18 emoji → lucide components
- apps/admin/src/pages/DashboardPage.tsx: 8 KPI emoji → lucide
- apps/admin/src/pages/PricingRulesPage.tsx, FinancialsPage.tsx, others: emoji → lucide
- apps/admin/src/components/ui/KpiCard.tsx: accept ReactNode icon, not string
- apps/mobile/app/(tabs)/_layout.tsx: tab bar icons → lucide-react-native
- apps/mobile/app/(provider-tabs)/_layout.tsx: same
- apps/mobile/app/(tabs)/home.tsx: category grid icons → lucide-react-native
- ~30 other mobile screens: emoji icons replaced

Verified by .ai-coder/checkpoints/verify-no-emoji.sh — zero emoji-as-icon remaining.

Checkpoints: see .ai-coder/checkpoints/logs/PHASE-02.log
"
```

## Step 10 — Phase report

```
**Phase 02 — Icon Replacement**
Status: PASS

Summary: Replaced 73 emoji icons with lucide-react components across the admin and mobile apps. The admin sidebar nav (18 items), dashboard KPIs (8 items), and 47 other emoji uses are gone. The 'looks like a toy' problem is resolved.

Files changed: ~50 files modified, 0 added.

Checkpoint log: .ai-coder/checkpoints/logs/PHASE-02.log

Screens to review (please click through and confirm):
1. Admin sidebar (any page) — should show lucide icons next to nav labels
2. Admin Dashboard — KPI cards have icons in upper right of each card
3. Customer mobile home screen — service categories show lucide icons (Sparkles, Wrench, Zap, Paintbrush, etc.)
4. Customer mobile tab bar — bottom tabs show lucide icons
5. Provider mobile home — same expectations

Screenshots: .ai-coder/checkpoints/logs/PHASE-02-screenshots/

Open questions: None.

Next phase: PHASE-03 (Runtime Config) — pending your approval.
```

STOP. Wait for approval.
