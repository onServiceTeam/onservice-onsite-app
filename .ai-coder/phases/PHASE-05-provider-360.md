# PHASE 05 — PROVIDER 360

**Goal:** Build the missing provider detail page with 7 tabs (Profile, Jobs, Financials, Reviews, Disputes, Activity Log, Notes). The current admin has a list page but no drill-down — this phase fixes that.


> **⚠️ READ FIRST:** Before starting this phase, read `.ai-coder/phases/PHASE-HEADER.md`. After every meaningful change in this phase you must run the after-every-change sanity ritual and log to `.ai-coder/checkpoints/logs/PHASE-NN/sanity-checks.log`. `verify-master.sh` checks this at end of phase.


**Branch:** `phase/05-provider-360`
**Estimated time:** 12 hours
**Dependencies:** Phase 04 complete and merged
**Risk:** Medium — large new page, many endpoints

---

## Step 1 — Pre-flight

```bash
git checkout main && git pull
git checkout -b phase/05-provider-360
bash .ai-coder/checkpoints/verify-phase.sh PHASE-05-preflight
```

## Step 2 — Backend endpoints

Add to `packages/api/src/routes/admin.routes.ts` (or split into `provider-admin.routes.ts`):

```
GET  /api/v1/admin/providers/:id                    Full profile + verification docs
GET  /api/v1/admin/providers/:id/jobs               Bookings paginated
GET  /api/v1/admin/providers/:id/financials         Lifetime stats, recent payouts
GET  /api/v1/admin/providers/:id/financials/2307    BIR Form 2307 PDF for tax year
GET  /api/v1/admin/providers/:id/reviews            All reviews
GET  /api/v1/admin/providers/:id/disputes           All disputes
GET  /api/v1/admin/providers/:id/activity           Admin actions + login history
GET  /api/v1/admin/providers/:id/notes              Internal notes
POST /api/v1/admin/providers/:id/notes              Add note
PUT  /api/v1/admin/providers/:id/notes/:noteId      Update note (pin/unpin/edit)
DELETE /api/v1/admin/providers/:id/notes/:noteId    Delete note (super admin)
POST /api/v1/admin/providers/:id/wallet/adjust      Manual wallet adjustment (super admin only)
POST /api/v1/admin/providers/:id/payout/manual      Trigger manual payout
POST /api/v1/admin/providers/:id/message            Send platform message
POST /api/v1/admin/providers/:id/request-documents  Request specific docs (e.g., new NBI)
PUT  /api/v1/admin/providers/:id/profile            Edit profile fields (super admin)
```

Each endpoint requires admin auth + appropriate role check. All write actions go through audit log.

## Step 3 — Add the route

In `apps/admin/src/App.tsx`, add:

```tsx
const ProviderDetailPage = lazy(() => import('@/pages/ProviderDetailPage'));
// ...
<Route path="/providers/:id" element={<ProviderDetailPage />} />
```

## Step 4 — Create migration 052

Migration `052_provider_admin_notes.sql`:

```sql
CREATE TABLE provider_admin_notes (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id),
    category VARCHAR(20) NOT NULL DEFAULT 'general'
        CHECK (category IN ('general', 'quality', 'financial', 'legal')),
    body TEXT NOT NULL,
    pinned BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_provider_notes_provider ON provider_admin_notes(provider_id, pinned DESC, created_at DESC);
```

## Step 5 — Build ProviderDetailPage

Create `apps/admin/src/pages/ProviderDetailPage.tsx`. Structure:

```tsx
import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, Phone, Mail, MapPin, Calendar, Star, Wrench, Coins,
  AlertTriangle, FileText, MessageSquare, Edit, Lock, RefreshCw,
} from '@/components/icons';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
// ... (all the other imports)

const TABS = ['profile', 'jobs', 'financials', 'reviews', 'disputes', 'activity', 'notes'] as const;
type TabId = typeof TABS[number];

export default function ProviderDetailPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<TabId>('profile');

  const provider = useQuery({
    queryKey: ['admin-provider', id],
    queryFn: async () => (await api.get(`/api/v1/admin/providers/${id}`)).data.data,
  });

  // Loading / error states with proper components

  return (
    <div className="p-6">
      {/* Back link */}
      <Link to="/providers" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline mb-4">
        <ArrowLeft size={14} /> Back to Providers
      </Link>

      {/* Header card with photo, name, status, tier, rating, quick actions */}
      <ProviderHeader provider={provider.data} />

      {/* Tab nav */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabId)}>
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="jobs">Jobs</TabsTrigger>
          <TabsTrigger value="financials">Financials</TabsTrigger>
          <TabsTrigger value="reviews">Reviews</TabsTrigger>
          <TabsTrigger value="disputes">Disputes</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="profile"><ProfileTab providerId={id!} /></TabsContent>
        <TabsContent value="jobs"><JobsTab providerId={id!} /></TabsContent>
        <TabsContent value="financials"><FinancialsTab providerId={id!} /></TabsContent>
        <TabsContent value="reviews"><ReviewsTab providerId={id!} /></TabsContent>
        <TabsContent value="disputes"><DisputesTab providerId={id!} /></TabsContent>
        <TabsContent value="activity"><ActivityTab providerId={id!} /></TabsContent>
        <TabsContent value="notes"><NotesTab providerId={id!} /></TabsContent>
      </Tabs>
    </div>
  );
}
```

Each tab is its own component file in `apps/admin/src/components/provider-360/`:

### ProfileTab — `apps/admin/src/components/provider-360/ProfileTab.tsx`

Sections:
- **Verification Documents:** Government ID (image viewer), NBI (image + expiry date), Selfie, Other docs. Click to enlarge. "Request New Document" button.
- **Service Categories:** List of categories provider works in. Add/remove categories (super admin).
- **Service Areas:** Map view of areas covered, with primary marked. Add/remove areas (super admin).
- **Contact:** Phone (clickable to dial), email (clickable), address.
- **Bank Details:** Masked GCash/Maya/bank info with verification status.
- **Tier Progression:** Current tier, requirements to next tier, % progress (jobs done / required, rating / required, etc).
- **Status & Tier Actions:** Suspend / Reactivate / Change Tier / Reject (with reason field, all go to audit log).

### JobsTab — `apps/admin/src/components/provider-360/JobsTab.tsx`

Stats row: Total Jobs · Completion Rate · Avg Rating · On-Time Rate · No-Show Rate
Filters: Status, Date range, Service category, Min/max amount, Has dispute (boolean)
Table columns: Date, Customer (link to customer 360), Service, Amount, Provider Earned, Status badge, Rating, GPS Verified, Actions (link to booking 360)
Pagination, export to CSV.

### FinancialsTab — `apps/admin/src/components/provider-360/FinancialsTab.tsx`

Top stats: Total Earned · Total Commission Paid · Current Wallet Balance · Pending Escrow
Charts: Monthly earnings (last 12 months bar) · Commission rate over time (line, shows tier progression)
Recent payouts table (last 20)
Tax section: BIR Form 2307 generation for current/last tax year (PDF download)
Manual actions panel (super admin only):
- Adjust wallet (with reason; creates ledger entry; audited)
- Trigger manual payout
- Hold all payouts (toggle with reason)

### ReviewsTab

All reviews with: customer name (or anonymous), rating, text, photos, provider's response, related booking link.
Filter by: rating, has response, has photo, dispute-related, flagged.
Flagged reviews surface to top.
Actions per review: Hide (with reason), Flag for moderation. Super admin can respond on behalf.

### DisputesTab

All disputes. Pattern analysis at top: "5 disputes in 90 days, 60% in customer's favor — concern" or similar plain-language interpretation.
Filter by outcome, status, age.
Click any dispute → dispute detail (Phase 07).

### ActivityTab

Three sub-sections:
- **Admin Actions:** Every admin action taken on this provider (status changes, tier changes, suspensions, manual adjustments, document requests). Reason and admin name shown.
- **Login History:** Date, IP, device. Last 50.
- **Status Changes:** Tier promotions/demotions, with reason and timestamp.

Filter by date range, action type.

### NotesTab

Internal notes (NOT visible to provider). Pinned at top.
Add note: textarea, category dropdown (general/quality/financial/legal), pin checkbox.
Edit/delete own notes; super admin can edit/delete any.
@mentions of other admin staff trigger notification.

## Step 6 — Update ProvidersPage list to link to detail

In `apps/admin/src/pages/ProvidersPage.tsx`, make each row clickable:

```tsx
<Link to={`/providers/${provider.id}`} className="...">
  {provider.fullName}
</Link>
```

Add column show/hide toggle. Add CSV export button. Add map view toggle.

## Step 7 — Tests

For each new endpoint, write at least:
- Happy path test (200, expected shape)
- Auth fail test (401 for no token)
- Auth fail test (403 for wrong role on super-admin-only endpoints)
- Audit log entry created for write actions

Add to `packages/api/__tests__/provider-admin.test.ts`.

## Step 8 — Verify

```bash
bash .ai-coder/checkpoints/verify-phase.sh PHASE-05
```

Visual: navigate to /providers, click a provider, all 7 tabs load, every action that should go through audit log creates an audit row, manual wallet adjust shows in financials tab.

## Step 9 — Commit and report. STOP.
