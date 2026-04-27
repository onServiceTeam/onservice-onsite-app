# Icon Catalog — Emoji to Lucide Mapping

The 73 emoji icons currently used in the codebase, mapped to their lucide-react equivalents. Phase 02 replaces every emoji using this table.

The AI coder MUST use `import { IconName } from '@/components/icons'` — never import directly from `lucide-react`. The centralized icon module enforces consistency and lets us swap libraries if needed.

---

## Admin Sidebar (18 icons)

| Current emoji | Used for | lucide-react replacement | Import name |
|---|---|---|---|
| 📊 | Dashboard | LayoutDashboard | `Dashboard` |
| 👥 | Customers | Users | `Customers` |
| 👷 | Providers | HardHat | `Providers` |
| 📅 | Bookings | Calendar | `Bookings` |
| ⚖️ | Disputes | Scale | `Disputes` |
| 💰 | Financials | Wallet | `Financials` |
| 🛒 | Service Catalog | ShoppingBag | `Catalog` |
| 🗺️ | Service Areas | Map | `Areas` |
| 💵 | Pricing Rules | DollarSign | `Pricing` |
| 📈 | Analytics | TrendingUp | `Analytics` |
| 📜 | Audit Log | ScrollText | `AuditLog` |
| 👤 | Staff & Roles | UserCog | `Staff` |
| 📨 | Templates | Mail | `Templates` |
| ⚙️ | Settings | Settings | `Settings` |
| 🎫 | Support Tickets | TicketCheck | `Support` |
| 🚀 | Dispatch | Rocket | `Dispatch` |
| 📣 | Marketing | Megaphone | `Marketing` |
| 🛡️ | Compliance | ShieldCheck | `Compliance` |

## Dashboard KPI cards (8 icons)

| Current emoji | Used for | lucide replacement | Import name |
|---|---|---|---|
| 💸 | Revenue | TrendingUp | `Revenue` |
| 📦 | GMV | Package | `GMV` |
| 🔧 | Active Bookings | Wrench | `ActiveJobs` |
| ⚠️ | Pending Disputes | AlertTriangle | `Pending` |
| 🆕 | New Signups | UserPlus | `NewUsers` |
| ✅ | Approvals | CheckCircle2 | `Approval` |
| 📋 | Today's Bookings | ClipboardList | `Today` |
| ⭐ | Avg Rating | Star | `Rating` |

## Status indicators (12 icons)

| Current emoji | Used for | lucide replacement | Import name |
|---|---|---|---|
| ✅ | Success / approved | CheckCircle2 | `Success` |
| ❌ | Error / rejected | XCircle | `Error` |
| ⚠️ | Warning | AlertTriangle | `Warning` |
| ℹ️ | Info | Info | `Info` |
| ⏳ | Pending | Clock | `Pending` |
| ⏰ | Time-sensitive | AlarmClock | `Urgent` |
| 🔄 | In progress | RotateCw | `Processing` |
| 🚫 | Blocked / suspended | Ban | `Blocked` |
| 🔒 | Locked | Lock | `Locked` |
| 🔓 | Unlocked | Unlock | `Unlocked` |
| 👁️ | View / public | Eye | `View` |
| 🙈 | Hide / private | EyeOff | `Hidden` |

## Action buttons (10 icons)

| Current emoji | Used for | lucide replacement | Import name |
|---|---|---|---|
| ✏️ | Edit | Pencil | `Edit` |
| 🗑️ | Delete | Trash2 | `Delete` |
| ➕ | Add | Plus | `Add` |
| ➖ | Remove | Minus | `Remove` |
| 💾 | Save | Save | `Save` |
| 📥 | Download / import | Download | `Download` |
| 📤 | Upload / export | Upload | `Upload` |
| 📋 | Copy | Copy | `Copy` |
| 🔍 | Search | Search | `Search` |
| 🎯 | Filter | Filter | `Filter` |

## Communication (8 icons)

| Current emoji | Used for | lucide replacement | Import name |
|---|---|---|---|
| 💬 | Chat / message | MessageCircle | `Chat` |
| 📞 | Phone call | Phone | `Phone` |
| 📧 | Email | Mail | `Email` |
| 📱 | SMS | Smartphone | `SMS` |
| 🔔 | Notification | Bell | `Notification` |
| 📢 | Broadcast | Megaphone | `Broadcast` |
| 🤝 | Customer service | Handshake | `Service` |
| 💡 | Tip / hint | Lightbulb | `Tip` |

## Money & finance (8 icons)

| Current emoji | Used for | lucide replacement | Import name |
|---|---|---|---|
| 💰 | Money / wallet | Wallet | `Wallet` |
| 💳 | Card payment | CreditCard | `Card` |
| 🏦 | Bank | Landmark | `Bank` |
| 📉 | Loss / decline | TrendingDown | `Decline` |
| 💱 | Exchange | ArrowLeftRight | `Exchange` |
| 🧾 | Receipt | Receipt | `Receipt` |
| 💎 | Premium | Gem | `Premium` |
| 🪙 | Token / coin | Coins | `Token` |

## People & roles (5 icons)

| Current emoji | Used for | lucide replacement | Import name |
|---|---|---|---|
| 🛡️ | Security / admin | Shield | `Admin` |
| 🔑 | Auth / key | Key | `Auth` |
| 👨‍💼 | Manager | UserCheck | `Manager` |
| 🎓 | Training / certified | GraduationCap | `Certified` |
| 🧑‍⚕️ | Verified provider | BadgeCheck | `Verified` |

## Location & map (4 icons)

| Current emoji | Used for | lucide replacement | Import name |
|---|---|---|---|
| 📍 | Pin / location | MapPin | `Pin` |
| 🗺️ | Map | Map | `Map` |
| 🧭 | Navigate | Compass | `Navigate` |
| 🚗 | En route | Car | `Route` |

---

## Implementation: the centralized icons module

Create `apps/admin/src/components/icons.tsx`:

```tsx
// Single source of truth for icons across the admin panel.
// Phases: 02 (initial), 04+ (additions).
// Replace 73 emoji icons with semantic lucide icons.

import {
  LayoutDashboard, Users, HardHat, Calendar, Scale, Wallet,
  ShoppingBag, Map, DollarSign, TrendingUp, ScrollText, UserCog,
  Mail, Settings, TicketCheck, Rocket, Megaphone, ShieldCheck,
  Package, Wrench, AlertTriangle, UserPlus, CheckCircle2,
  ClipboardList, Star, XCircle, Info, Clock, AlarmClock,
  RotateCw, Ban, Lock, Unlock, Eye, EyeOff,
  Pencil, Trash2, Plus, Minus, Save, Download, Upload,
  Copy, Search, Filter, MessageCircle, Phone, Smartphone,
  Bell, Handshake, Lightbulb, CreditCard, Landmark,
  TrendingDown, ArrowLeftRight, Receipt, Gem, Coins,
  Shield, Key, UserCheck, GraduationCap, BadgeCheck,
  MapPin, Compass, Car
} from 'lucide-react';

// Export with semantic names (the names used throughout app code)
export { LayoutDashboard as Dashboard };
export { Users as Customers };
export { HardHat as Providers };
export { Calendar as Bookings };
export { Scale as Disputes };
export { Wallet as Financials };
export { ShoppingBag as Catalog };
export { Map as Areas };
export { DollarSign as Pricing };
export { TrendingUp as Analytics, TrendingUp as Revenue };
export { ScrollText as AuditLog };
export { UserCog as Staff };
export { Mail as Templates, Mail as Email };
export { Settings };
export { TicketCheck as Support };
export { Rocket as Dispatch };
export { Megaphone as Marketing, Megaphone as Broadcast };
export { ShieldCheck as Compliance };
export { Package as GMV };
export { Wrench as ActiveJobs };
export { AlertTriangle as Warning, AlertTriangle as Pending };
export { UserPlus as NewUsers };
export { CheckCircle2 as Approval, CheckCircle2 as Success };
export { ClipboardList as Today };
export { Star as Rating };
export { XCircle as Error };
export { Info };
export { Clock };
export { AlarmClock as Urgent };
export { RotateCw as Processing };
export { Ban as Blocked };
export { Lock as Locked };
export { Unlock as Unlocked };
export { Eye as View };
export { EyeOff as Hidden };
export { Pencil as Edit };
export { Trash2 as Delete };
export { Plus as Add };
export { Minus as Remove };
export { Save };
export { Download };
export { Upload };
export { Copy };
export { Search };
export { Filter };
export { MessageCircle as Chat };
export { Phone };
export { Smartphone as SMS };
export { Bell as Notification };
export { Handshake as Service };
export { Lightbulb as Tip };
export { Wallet };
export { CreditCard as Card };
export { Landmark as Bank };
export { TrendingDown as Decline };
export { ArrowLeftRight as Exchange };
export { Receipt };
export { Gem as Premium };
export { Coins as Token };
export { Shield as Admin };
export { Key as Auth };
export { UserCheck as Manager };
export { GraduationCap as Certified };
export { BadgeCheck as Verified };
export { MapPin as Pin };
export { Compass as Navigate };
export { Car as Route };
```

For mobile (`apps/mobile/components/icons.tsx`), use `lucide-react-native` instead of `lucide-react` with the same export names.

## Usage

```tsx
// Old (forbidden after Phase 02):
<button>📊 Dashboard</button>

// New:
import { Dashboard } from '@/components/icons';
<button><Dashboard size={20} /> Dashboard</button>
```

## Verification

After Phase 02, run:
```bash
bash .ai-coder/checkpoints/verify-no-emoji.sh
```

Should return PASS.
