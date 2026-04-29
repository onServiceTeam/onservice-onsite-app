# BUG REMEDIATION MANUAL — Part 3 (continued)
## Dispatches 09 and 10

This installment addresses two operationally-critical gaps. Dispatch 09 fixes the provider onboarding pipeline so v1.0 can launch with manual admin approval as the verification mechanism (replacing the unwired vendor integration). Dispatch 10 wires up the admin dispatch console buttons that currently fire `window.alert` stubs.

---

# DISPATCH 09 — Provider onboarding v1.0 path

## Goal

The audit found 14 bugs in the 10-screen provider onboarding flow plus the admin approval pipeline that processes those applications. The most critical:

- **Bug 162** — identity verification endpoint 404s are silently swallowed → providers can complete onboarding with NO ID verification.
- **Bug 1193** — NBI document upload uses base64 in JSON body for files >100KB → bandwidth cost + payload limit failures.
- **Bug 1194/1195** — selfie liveness vendor not wired → the screen captures photos but no verification happens.
- **Bug 1199** — onboarding timeline not surfaced → providers don't know how long admin review takes.
- **Bug 1200** — submitted application cannot be edited → typos require contacting support.
- **Bug 1268** — service area change has no pending state UX → providers see stale area while admin reviews.

Plus 8 supporting bugs in onboarding state management, document re-upload, and admin reviewer tooling.

**The architectural decision for v1.0:** as called out in Phase 14 Part 2C section 8, no real liveness vendor (Onfido / Persona / similar) is contracted. v1.0 ships with **manual admin approval workflow** — every provider's documents and selfie are reviewed by a human admin before activation. v1.1+ wires automated liveness when business case warrants.

This dispatch implements that path:
1. Multipart document uploads to S3 (Bug 1193).
2. Identity verification endpoint that always returns success but creates a `pending_admin_review` row (Bug 162 fix — no silent bypass).
3. Admin "Provider Review Queue" UI for processing applications.
4. Resumable / editable onboarding (Bug 1200).
5. Visible timeline and progress (Bug 1199).
6. Service area change with pending state (Bug 1268).

**Branch:** `phase/14-d09-provider-onboarding-v1`
**Tag at end:** `v0.14.0-d09-complete`

---

## Schema additions

```sql
-- packages/api/migrations/081_provider_onboarding_progress.sql

-- Per-provider progress through onboarding steps (Bug 1199 + 1200 fix)
CREATE TABLE provider_onboarding_progress (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current_step TEXT NOT NULL CHECK (current_step IN (
    'role_select', 'terms', 'categories', 'service_area',
    'documents', 'selfie', 'identity_verification',
    'background_check', 'review_pending', 'completed'
  )),
  steps_completed JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- e.g., ['role_select', 'terms', 'categories']
  data_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- accumulated form data per step
  submitted_for_review_at TIMESTAMPTZ,
  -- After submission, current_step locked unless admin sends back
  admin_review_started_at TIMESTAMPTZ,
  admin_reviewer_id UUID REFERENCES admin_users(id),
  admin_decision TEXT CHECK (admin_decision IN ('approved', 'rejected', 'sent_back')),
  admin_decision_at TIMESTAMPTZ,
  admin_decision_reason TEXT,
  estimated_review_hours INTEGER NOT NULL DEFAULT 72,  -- 1-3 business days
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_onboarding_pending_review ON provider_onboarding_progress(submitted_for_review_at)
  WHERE submitted_for_review_at IS NOT NULL AND admin_decision IS NULL;
```

```sql
-- packages/api/migrations/082_provider_documents.sql

-- Documents replaces the legacy approach of storing URLs in provider_profile JSONB
CREATE TABLE provider_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_kind TEXT NOT NULL CHECK (document_kind IN (
    'nbi_clearance', 'government_id_front', 'government_id_back',
    'proof_of_address', 'professional_certification', 'business_permit',
    'tax_certificate', 'selfie_liveness'
  )),
  s3_key TEXT NOT NULL,
  s3_bucket TEXT NOT NULL,
  thumbnail_s3_key TEXT,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  page_number INTEGER,         -- for multi-page documents
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN (
    'uploaded', 'pending_review', 'approved', 'rejected', 'expired', 'replaced'
  )),
  expires_at TIMESTAMPTZ,       -- NBI: 1 year from issuance
  reviewed_by UUID REFERENCES admin_users(id),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  replaced_by UUID REFERENCES provider_documents(id)
);

CREATE INDEX idx_provider_documents_user_kind ON provider_documents(user_id, document_kind, status);
CREATE INDEX idx_provider_documents_pending_review ON provider_documents(uploaded_at) WHERE status = 'pending_review';
```

```sql
-- packages/api/migrations/083_service_area_change_requests.sql
-- Bug 1268 fix: pending state for area changes
CREATE TABLE service_area_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES users(id),
  current_area_id UUID REFERENCES service_areas(id),
  requested_area_id UUID NOT NULL REFERENCES service_areas(id),
  current_radius_km INTEGER,
  requested_radius_km INTEGER NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by UUID REFERENCES admin_users(id),
  reviewed_at TIMESTAMPTZ,
  decision_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_area_change_pending ON service_area_change_requests(created_at) WHERE status = 'pending';
```

---

## Bug 162 — Identity verification 404 silently swallowed

**File:** `apps/mobile/app/provider-onboarding/identity-verification.tsx:162-172`

### Current code

```ts
try {
  await api.post('/provider-onboarding/identity', payload);
} catch (err) {
  if (err.status === 404) {
    // "Endpoint not yet available — proceed silently"
    router.push('/provider-onboarding/background-check-status');
    return;
  }
  throw err;
}
```

If the endpoint doesn't exist (deploy gap, env mismatch, route not registered), the provider moves to next step with NO record of identity verification. Customer gets matched with provider whose identity was never confirmed.

### Exact fix

**Step 1.** The endpoint always exists. It's no longer optional:

```ts
// packages/api/src/routes/provider/onboarding.ts
router.post(
  '/provider-onboarding/identity-verification',
  requireAuth,
  requireRole('provider_intent'),  // user has expressed intent to be provider but not yet active
  async (req, res) => {
    const { signatureId, fullName, governmentIdFrontDocId, governmentIdBackDocId, selfieDocId } = z.object({
      signatureId: z.string().uuid(),
      fullName: z.string().min(2).max(100),
      governmentIdFrontDocId: z.string().uuid(),
      governmentIdBackDocId: z.string().uuid().optional(),  // optional for passport
      selfieDocId: z.string().uuid(),
    }).parse(req.body);

    // Verify all uploads belong to this user
    const docs = await db.selectFrom('provider_documents')
      .select(['id', 'document_kind', 'user_id', 'status'])
      .where('id', 'in', [governmentIdFrontDocId, ...(governmentIdBackDocId ? [governmentIdBackDocId] : []), selfieDocId])
      .execute();

    if (docs.length !== (governmentIdBackDocId ? 3 : 2)) {
      throw new BadRequestError('document_not_found', 'One or more uploaded documents not found');
    }
    for (const d of docs) {
      if (d.user_id !== req.user!.id) throw new ForbiddenError('document_not_yours');
      if (d.status !== 'uploaded') {
        throw new BadRequestError('document_already_processed', `Document ${d.id} status is ${d.status}`);
      }
    }

    // Verify signature belongs to this user (signatures from Dispatch 07)
    const sig = await db.selectFrom('signature_artifacts')
      .select(['signer_id'])
      .where('id', '=', signatureId)
      .executeTakeFirstOrThrow();
    if (sig.signer_id !== req.user!.id) throw new ForbiddenError('signature_not_yours');

    return db.transaction().execute(async (trx) => {
      // Move documents from 'uploaded' to 'pending_review'
      await trx.updateTable('provider_documents')
        .set({ status: 'pending_review' })
        .where('id', 'in', docs.map(d => d.id))
        .execute();

      // Update onboarding progress
      await trx.updateTable('provider_onboarding_progress')
        .set({
          current_step: 'background_check',
          steps_completed: sql`steps_completed || '"identity_verification"'::jsonb`,
          data_snapshot: sql`data_snapshot || ${JSON.stringify({ identity_verification: { signatureId, fullName, completed_at: new Date() } })}::jsonb`,
          updated_at: new Date(),
        })
        .where('user_id', '=', req.user!.id)
        .execute();

      // Persist identity record
      await trx.insertInto('provider_identity_records').values({
        user_id: req.user!.id,
        full_name: fullName,
        signature_artifact_id: signatureId,
        government_id_front_id: governmentIdFrontDocId,
        government_id_back_id: governmentIdBackDocId ?? null,
        selfie_id: selfieDocId,
        submitted_at: new Date(),
        status: 'pending_admin_review',
      }).execute();

      res.json({ data: { ok: true, step: 'background_check' } });
    });
  },
);
```

**Step 2.** Mobile client — no more silent 404 swallow:

```diff
// apps/mobile/app/provider-onboarding/identity-verification.tsx
  try {
-   await api.post('/provider-onboarding/identity', payload);
+   await api.post('/api/v1/provider-onboarding/identity-verification', payload);
+   router.push(Routes.PROVIDER.ONBOARDING.BACKGROUND_CHECK);
  } catch (err) {
-   if (err.status === 404) {
-     router.push('/provider-onboarding/background-check-status');
-     return;
-   }
-   throw err;
+   // Surface real errors to user — DO NOT silently bypass
+   showToast(err.message ?? 'Identity verification failed. Please try again.', 'error');
+   logger.error('identity_verification_failed', { error: err });
+   return;
  }
```

### Test signature

```ts
describe('Identity verification (Bug 162)', () => {
  it('does NOT silently bypass when endpoint fails', async () => {
    // Force endpoint to throw
    jest.spyOn(provider_onboarding_service, 'submitIdentity').mockRejectedValueOnce(new Error('database error'));
    
    const result = await render(<IdentityVerificationScreen />);
    fireEvent.press(result.getByText('Sign and submit'));
    await waitFor(() => {
      expect(result.getByText(/Identity verification failed/)).toBeTruthy();
    });
    // Should NOT have navigated
    expect(mockRouter.push).not.toHaveBeenCalledWith(expect.stringContaining('background-check'));
  });

  it('endpoint creates pending_admin_review row on success', async () => {
    const res = await request(app)
      .post('/api/v1/provider-onboarding/identity-verification')
      .set('Authorization', `Bearer ${providerIntentToken}`)
      .send({ signatureId, fullName: 'Juan dela Cruz', governmentIdFrontDocId, selfieDocId });
    expect(res.status).toBe(200);
    
    const record = await db.selectFrom('provider_identity_records').selectAll()
      .where('user_id', '=', providerIntentUser.id).executeTakeFirstOrThrow();
    expect(record.status).toBe('pending_admin_review');
  });
});
```

---

## Bug 1193 — NBI document upload uses base64 in JSON body

**File:** `apps/mobile/app/provider-onboarding/documents.tsx`

### Current state

The current code converts each uploaded image to base64 and sends as a JSON field. A 5MB NBI scan becomes a 7MB base64 string in a JSON body. Express body limit (default 1MB) drops large uploads silently.

### Exact fix

Reuse the multipart pattern established in Dispatch 07 (Bug 461 fix). Provider documents endpoint mirrors the booking photo endpoint:

```ts
// packages/api/src/routes/provider/documents.ts
import { uploadProviderDocumentSchema } from '../../validators/provider/documents.validator';

router.post(
  '/provider-onboarding/documents',
  requireAuth,
  requireRole('provider_intent'),
  upload.single('document'),
  async (req, res) => {
    const { documentKind, pageNumber } = uploadProviderDocumentSchema.parse(req.body);
    if (!req.file) throw new BadRequestError('no_file');

    // NBI clearance has expiry; require it
    let expiresAt: Date | null = null;
    if (documentKind === 'nbi_clearance') {
      const { issuedDate } = z.object({ issuedDate: z.string().datetime() }).parse(req.body);
      expiresAt = new Date(new Date(issuedDate).getTime() + 365 * 24 * 3600 * 1000);
    }

    // Compress images; PDFs pass through
    let buffer = req.file.buffer;
    let mimeType = req.file.mimetype;
    if (mimeType.startsWith('image/')) {
      const compressed = await sharp(buffer)
        .rotate()
        .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
      buffer = compressed;
      mimeType = 'image/jpeg';
    }

    const s3Key = `provider-documents/${req.user!.id}/${documentKind}/${uuid()}.${mimeType === 'application/pdf' ? 'pdf' : 'jpg'}`;
    await uploadToS3({ key: s3Key, body: buffer, contentType: mimeType });

    // If replacing existing document of same kind, mark old as 'replaced'
    const existing = await db.selectFrom('provider_documents')
      .select('id')
      .where('user_id', '=', req.user!.id)
      .where('document_kind', '=', documentKind)
      .where('status', 'in', ['uploaded', 'pending_review', 'rejected'])
      .execute();

    return db.transaction().execute(async (trx) => {
      const newDoc = await trx.insertInto('provider_documents').values({
        user_id: req.user!.id,
        document_kind: documentKind,
        s3_key: s3Key,
        s3_bucket: process.env.S3_BUCKET!,
        mime_type: mimeType,
        size_bytes: buffer.length,
        page_number: pageNumber ?? null,
        status: 'uploaded',
        expires_at: expiresAt,
      }).returning(['id', 's3_key']).executeTakeFirstOrThrow();

      if (existing.length > 0) {
        await trx.updateTable('provider_documents')
          .set({ status: 'replaced', replaced_by: newDoc.id })
          .where('id', 'in', existing.map(e => e.id))
          .execute();
      }

      res.json({ data: { documentId: newDoc.id, url: await getSignedS3Url(newDoc.s3_key, 3600) } });
    });
  },
);
```

Mobile client mirrors `uploadJobPhoto` from Dispatch 07:

```ts
// apps/mobile/src/services/document-upload.service.ts
export async function uploadProviderDocument(params: {
  localUri: string;
  documentKind: string;
  pageNumber?: number;
  issuedDate?: string;
}): Promise<{ documentId: string; url: string }> {
  const formData = new FormData();
  formData.append('document', { uri: params.localUri, name: 'document.jpg', type: 'image/jpeg' } as unknown as Blob);
  formData.append('documentKind', params.documentKind);
  if (params.pageNumber) formData.append('pageNumber', String(params.pageNumber));
  if (params.issuedDate) formData.append('issuedDate', params.issuedDate);

  const response = await fetch(`${API_BASE}/api/v1/provider-onboarding/documents`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await secureStorage.getString('access_token')}` },
    body: formData,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? 'document_upload_failed');
  }

  const { data } = await response.json();
  return data;
}
```

### Test signature

```ts
describe('POST /provider-onboarding/documents (Bug 1193)', () => {
  it('rejects base64 in JSON body (multipart required)', async () => {
    const res = await request(app)
      .post('/api/v1/provider-onboarding/documents')
      .set('Authorization', `Bearer ${providerIntentToken}`)
      .set('Content-Type', 'application/json')
      .send({ documentKind: 'nbi_clearance', base64Data: 'iVBORw0...' });
    expect(res.status).toBe(400);
  });

  it('accepts multipart upload, compresses image, persists row', async () => {
    const res = await request(app)
      .post('/api/v1/provider-onboarding/documents')
      .set('Authorization', `Bearer ${providerIntentToken}`)
      .field('documentKind', 'nbi_clearance')
      .field('issuedDate', '2026-01-15T00:00:00.000Z')
      .attach('document', testNbiScanBytes, 'nbi.jpg');
    expect(res.status).toBe(200);
    
    const row = await db.selectFrom('provider_documents').selectAll()
      .where('id', '=', res.body.data.documentId).executeTakeFirstOrThrow();
    expect(row.expires_at).toBeDefined();  // NBI gets 1-year expiry
    expect(row.size_bytes).toBeLessThan(testNbiScanBytes.length);  // compressed
  });

  it('marks old document as replaced when uploading same kind', async () => {
    const first = await uploadDocument({ kind: 'nbi_clearance' });
    const second = await uploadDocument({ kind: 'nbi_clearance' });
    
    const oldRow = await db.selectFrom('provider_documents').selectAll().where('id', '=', first.documentId).executeTakeFirstOrThrow();
    expect(oldRow.status).toBe('replaced');
    expect(oldRow.replaced_by).toBe(second.documentId);
  });
});
```

---

## Bug 1199 — Onboarding timeline not surfaced

**File:** `apps/mobile/app/provider-onboarding/review-pending.tsx`

### Current state

After submission, the screen shows "Almost there!" with no estimate of how long admin review takes.

### Exact fix

Server returns `estimated_review_hours` per the `provider_onboarding_progress` table (default 72h):

```tsx
// apps/mobile/app/provider-onboarding/review-pending.tsx
const { data: progress } = useQuery({
  queryKey: ['provider-onboarding-progress'],
  queryFn: () => api.get<{ data: OnboardingProgress }>('/api/v1/provider-onboarding/progress'),
  refetchInterval: 60_000,
});

return (
  <ScrollView>
    <Hero icon={<Clock size={64} color={colors.brand.primary} />} title="Almost there!" />
    <Text style={styles.subhead}>
      Our team is reviewing your application. We'll notify you within {progress?.data.estimated_review_hours ?? 72} hours
      ({Math.ceil((progress?.data.estimated_review_hours ?? 72) / 24)} business {Math.ceil((progress?.data.estimated_review_hours ?? 72) / 24) === 1 ? 'day' : 'days'}).
    </Text>
    
    {progress?.data.submitted_for_review_at && (
      <Text style={styles.timestamp}>
        Submitted: {formatRelative(new Date(progress.data.submitted_for_review_at))}
      </Text>
    )}
    
    {/* ... summary view, edit link ... */}
  </ScrollView>
);
```

The estimated hours can be tuned globally via admin SystemSettingsPage (Part 2A section 28).

---

## Bug 1200 — Submitted application cannot be edited

### Exact fix

Until the admin starts review (i.e., `admin_review_started_at IS NULL`), the provider can return to any prior step and edit:

```ts
// packages/api/src/routes/provider/onboarding.ts
router.post('/provider-onboarding/return-to-step', requireAuth, async (req, res) => {
  const { step } = z.object({
    step: z.enum(['categories', 'service_area', 'documents', 'selfie', 'identity_verification']),
  }).parse(req.body);

  const progress = await db.selectFrom('provider_onboarding_progress')
    .selectAll().where('user_id', '=', req.user!.id).executeTakeFirstOrThrow();

  if (progress.admin_review_started_at) {
    throw new BadRequestError('review_in_progress', 'Your application is under active review. Contact support to make changes.');
  }

  await db.updateTable('provider_onboarding_progress').set({
    current_step: step,
    submitted_for_review_at: null,  // unsubmit so it doesn't appear in admin queue
    updated_at: new Date(),
  }).where('user_id', '=', req.user!.id).execute();

  res.json({ data: { step } });
});
```

Mobile review-pending screen has an "Edit my submission" button that calls this endpoint and routes to the requested step. Once at that step, the standard onboarding flow re-applies.

---

## Bug 1268 — Service area change has no pending state

### Exact fix

Provider's edit-area screen creates a `service_area_change_requests` row instead of directly updating `provider_profile.service_area_id`. UI shows "Pending admin review" until decided.

```ts
// packages/api/src/routes/provider/service-area.ts
router.post('/provider/service-area/change', requireAuth, requireRole('provider'), async (req, res) => {
  const { areaId, radiusKm, reason } = z.object({
    areaId: z.string().uuid(),
    radiusKm: z.number().int().min(1).max(25),  // Bug 1191 chain
    reason: z.string().max(500).optional(),
  }).parse(req.body);

  const provider = await db.selectFrom('provider_profile').select(['service_area_id', 'service_radius_km'])
    .where('user_id', '=', req.user!.id).executeTakeFirstOrThrow();

  // Reject if a pending request already exists
  const existing = await db.selectFrom('service_area_change_requests')
    .select('id')
    .where('provider_id', '=', req.user!.id)
    .where('status', '=', 'pending')
    .executeTakeFirst();
  if (existing) {
    throw new ConflictError('change_request_pending', 'You already have a pending area change request.');
  }

  return db.transaction().execute(async (trx) => {
    const reqRow = await trx.insertInto('service_area_change_requests').values({
      provider_id: req.user!.id,
      current_area_id: provider.service_area_id,
      requested_area_id: areaId,
      current_radius_km: provider.service_radius_km,
      requested_radius_km: radiusKm,
      reason: reason ?? null,
      status: 'pending',
    }).returning('id').executeTakeFirstOrThrow();

    await trx.insertInto('admin_inbox').values({
      kind: 'service_area_change_request',
      target_id: reqRow.id,
      created_at: new Date(),
    }).execute();

    res.json({ data: { requestId: reqRow.id, status: 'pending' } });
  });
});

router.get('/provider/service-area', requireAuth, requireRole('provider'), async (req, res) => {
  const provider = await db.selectFrom('provider_profile').selectAll()
    .where('user_id', '=', req.user!.id).executeTakeFirstOrThrow();
  const pendingChange = await db.selectFrom('service_area_change_requests')
    .selectAll().where('provider_id', '=', req.user!.id).where('status', '=', 'pending')
    .executeTakeFirst();

  res.json({
    data: {
      currentAreaId: provider.service_area_id,
      currentRadiusKm: provider.service_radius_km,
      pendingChange: pendingChange ? {
        requestId: pendingChange.id,
        requestedAreaId: pendingChange.requested_area_id,
        requestedRadiusKm: pendingChange.requested_radius_km,
        submittedAt: pendingChange.created_at,
        status: pendingChange.status,
      } : null,
    },
  });
});
```

Mobile UI (`/provider/service-area`) shows a banner "Change pending admin review — submitted [time ago]" when `pendingChange !== null`.

---

## Admin Provider Review Queue (new admin functionality)

The admin needs a queue to process pending applications. Per Part 2A section 3 (ProvidersPage) the existing approval flow handles already-active providers; this dispatch adds the pre-activation queue.

```tsx
// apps/admin/src/pages/ProviderReviewQueuePage.tsx (new)
// Routed at /provider-review-queue, RBAC: requireAdmin

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export default function ProviderReviewQueuePage() {
  const { data, isLoading } = useQuery({
    queryKey: ['provider-review-queue'],
    queryFn: () => api.get<{ data: PendingReview[] }>('/admin/provider-review-queue'),
    refetchInterval: 30_000,
  });

  return (
    <PageLayout title="Provider Review Queue">
      <FilterBar>
        <Filter label="Submitted" type="date-range" />
        <Filter label="Categories" type="multi-select" />
        <Filter label="Area" type="single-select" />
      </FilterBar>

      {isLoading ? <SkeletonList /> : (
        <DataTable
          columns={[
            { header: 'Submitted', accessor: 'submittedAt', sortable: true, formatter: relativeTime },
            { header: 'Name', accessor: 'fullName' },
            { header: 'Phone', accessor: 'phone', formatter: maskPhone },
            { header: 'Categories', accessor: 'categories', formatter: (cats: string[]) => cats.join(', ') },
            { header: 'Area', accessor: 'areaName' },
            { header: 'Documents', accessor: 'documentCount', formatter: count => `${count} uploaded` },
            { header: 'Action', formatter: row => (
              <Button onClick={() => navigate(`/provider-review/${row.userId}`)}>Review</Button>
            )},
          ]}
          data={data?.data ?? []}
        />
      )}
    </PageLayout>
  );
}
```

Detail page `apps/admin/src/pages/ProviderReviewDetailPage.tsx`:

```tsx
export default function ProviderReviewDetailPage() {
  const { id } = useParams();
  const { data } = useQuery({ queryKey: ['provider-review', id], queryFn: () => api.get(`/admin/provider-review/${id}`) });

  if (!data) return <Skeleton />;

  return (
    <PageLayout title={`Review: ${data.fullName}`}>
      <ReviewSection title="Identity">
        <DocumentViewer kind="nbi_clearance" url={data.documents.nbiClearance.signedUrl} />
        <DocumentViewer kind="government_id_front" url={data.documents.governmentIdFront.signedUrl} />
        <DocumentViewer kind="government_id_back" url={data.documents.governmentIdBack?.signedUrl} />
        <DocumentViewer kind="selfie" url={data.documents.selfie.signedUrl} />
        <SignatureViewer url={data.signatureUrl} />
      </ReviewSection>

      <ReviewSection title="Service plan">
        <Field label="Categories">{data.categories.join(', ')}</Field>
        <Field label="Service area">{data.areaName} (radius {data.radiusKm}km)</Field>
        <Field label="Schedule">{data.scheduleSummary}</Field>
      </ReviewSection>

      <ReviewSection title="Background check">
        <Field label="NBI status">
          {data.nbi.expiresAt && new Date(data.nbi.expiresAt) > new Date() ? (
            <Badge variant="success">Valid until {formatDate(data.nbi.expiresAt)}</Badge>
          ) : (
            <Badge variant="warning">Expired or unverified</Badge>
          )}
        </Field>
      </ReviewSection>

      <ActionPanel>
        <ApproveButton onClick={() => approve(id)} />
        <SendBackButton onClick={() => sendBack(id)} />
        <RejectButton onClick={() => reject(id)} />
      </ActionPanel>

      <Modal name="approve">
        <ApprovalForm onSubmit={async (note) => {
          await api.post(`/admin/provider-review/${id}/approve`, { note });
          // ...
        }} />
      </Modal>

      <Modal name="send-back">
        <SendBackForm onSubmit={async (step, reason) => {
          // reason >= 30 chars; sends provider back to a specific step with explanation
          await api.post(`/admin/provider-review/${id}/send-back`, { step, reason });
        }} />
      </Modal>

      <Modal name="reject">
        <RejectForm onSubmit={async (reason) => {
          // reason >= 30 chars; permanent rejection
          await api.post(`/admin/provider-review/${id}/reject`, { reason });
        }} />
      </Modal>
    </PageLayout>
  );
}
```

Server endpoints follow Dispatch 06's transactional pattern. Approval activates the provider and creates the audit trail:

```ts
// packages/api/src/services/admin/provider-review.service.ts
export async function approveProviderApplication(userId: string, adminId: string, note: string | null) {
  return db.transaction().execute(async (trx) => {
    // Mark progress completed
    await trx.updateTable('provider_onboarding_progress').set({
      current_step: 'completed',
      admin_review_started_at: new Date(),
      admin_reviewer_id: adminId,
      admin_decision: 'approved',
      admin_decision_at: new Date(),
      admin_decision_reason: note,
    }).where('user_id', '=', userId).execute();

    // Mark provider documents as approved
    await trx.updateTable('provider_documents').set({
      status: 'approved',
      reviewed_by: adminId,
      reviewed_at: new Date(),
    }).where('user_id', '=', userId).where('status', '=', 'pending_review').execute();

    // Activate provider
    await trx.updateTable('provider_profile').set({
      status: 'active',
      approved_at: new Date(),
      approved_by: adminId,
    }).where('user_id', '=', userId).execute();

    // Audit
    await trx.insertInto('admin_actions').values({
      actor_id: adminId,
      action_type: 'provider_application_approved',
      target_type: 'user',
      target_id: userId,
      reason: note?.slice(0, 500) ?? 'Approved',
      full_notes: note ?? '',
      details: '{}',
    }).execute();

    // Notify provider
    await trx.insertInto('notifications').values({
      user_id: userId,
      type: 'provider_application_approved',
      payload: JSON.stringify({ approved_at: new Date() }),
    }).execute();
  });
}
```

---

## Dispatch 09 closeout

**Bugs claimed fixed (14):**
- Bug 162 — identity verification cannot be silently bypassed
- Bug 1191 — service area radius capped at 25km client+server (encompassed)
- Bug 1192 — Boracay in city autocomplete (already covered in Dispatch 02)
- Bug 1193 — multipart document upload, no base64-in-JSON
- Bug 1194/1195 — selfie liveness deferred to manual admin review (documented in LAUNCH-LIMITATIONS §24)
- Bug 1199 — onboarding review timeline visible (server-driven estimated_review_hours)
- Bug 1200 — provider can edit submission before review starts
- Bug 1268 — service area change with pending state
- Bug 1196 — IC agreement saved to provider profile (encompassed in Dispatch 07 signature work)
- Bug 1197 — background check polling interval 60s (already covered)
- Bug 1198 — manual recheck button (already covered)
- Plus 3 supporting state-machine bugs

**Files added:**
- `packages/api/migrations/081_provider_onboarding_progress.sql`
- `packages/api/migrations/082_provider_documents.sql`
- `packages/api/migrations/083_service_area_change_requests.sql`
- `packages/api/src/routes/provider/onboarding.ts`
- `packages/api/src/routes/provider/documents.ts`
- `packages/api/src/routes/provider/service-area.ts`
- `packages/api/src/routes/admin/provider-review.ts`
- `packages/api/src/services/admin/provider-review.service.ts`
- `apps/mobile/src/services/document-upload.service.ts`
- `apps/admin/src/pages/ProviderReviewQueuePage.tsx`
- `apps/admin/src/pages/ProviderReviewDetailPage.tsx`
- ~12 test files

**Files modified:**
- `apps/mobile/app/provider-onboarding/identity-verification.tsx` (no silent bypass)
- `apps/mobile/app/provider-onboarding/documents.tsx` (multipart upload)
- `apps/mobile/app/provider-onboarding/review-pending.tsx` (timeline + edit)
- `apps/mobile/app/provider/service-area.tsx` (pending state UI)
- `apps/admin/src/components/AdminLayout.tsx` (add nav for review queue)

**Documentation updates:**
- `LAUNCH-LIMITATIONS.md` §24 added: "Selfie liveness vendor not contracted for v1.0. Manual admin review of all provider applications. Estimated review SLA: 1-3 business days. Vendor integration planned for v1.1+."
- `docs/PROVIDER-ONBOARDING-RUNBOOK.md` (new): operational runbook for admin reviewers — what to look for in NBI clearance, what makes a selfie pass/fail, escalation paths.

**Decision points for Ken:**
- v1.0 review SLA is 1-3 business days. To meet this you need a person dedicated to reviewing applications. Either Ken (early stages) or hire a part-time reviewer at ~₱20k/month for 4 hours/day. Without this person, providers wait days, attrition happens.
- Provider review training takes ~2 hours. Cover: NBI clearance verification (real vs fake), government ID matching, selfie comparison, red flags (suspicious addresses, mismatched names). Document in `docs/PROVIDER-REVIEWER-TRAINING.md`.
- Provider rejection is rare but happens (~5% per industry baseline). Have a clear rejection reason taxonomy: ID didn't match selfie, NBI expired, fake documents, location not yet served, prior platform ban. Each gets a templated rejection email.

---

# DISPATCH 10 — Admin dispatch console wire-up

## Goal

The audit found 9 bugs centering on Bug 272 (per Phase 10 docs): the admin DispatchConsole's Reassign / Cancel / Message buttons are `window.alert()` stubs. Buttons appear to work but invoke nothing. Compounded by LAUNCH-LIMITATIONS §1 (reassign provider eligibility not filtered) and §2 (cancel doesn't show real-time refund preview).

This dispatch wires the buttons to real backend mutations with proper validation, eligibility filtering, refund preview, and audit trails.

**Branch:** `phase/14-d10-dispatch-console`
**Tag at end:** `v0.14.0-d10-complete`

---

## Bug 272.A — Reassign button window.alert stub

**Files:** `apps/admin/src/pages/DispatchConsolePage.tsx`, server `dispatch.service.ts`

### Current state

```tsx
const handleReassign = (bookingId: string) => {
  window.alert(`Would reassign booking ${bookingId} (not implemented)`);
};
```

### Exact fix

**Step 1.** Server endpoint that filters eligibility (LAUNCH-LIMITATIONS §1):

```ts
// packages/api/src/routes/admin/dispatch.ts
router.get(
  '/admin/bookings/:id/reassign-candidates',
  requireAdmin,
  async (req, res) => {
    const booking = await db.selectFrom('bookings as b')
      .innerJoin('subcategories as s', 's.id', 'b.subcategory_id')
      .select([
        'b.id', 'b.subcategory_id', 'b.address_id', 'b.scheduled_at',
        'b.duration_minutes', 'b.provider_id as current_provider_id',
        's.service_category_id',
      ])
      .where('b.id', '=', req.params.id).executeTakeFirstOrThrow();

    const address = await db.selectFrom('addresses').selectAll()
      .where('id', '=', booking.address_id).executeTakeFirstOrThrow();

    // Find providers matching:
    // 1. Same service area
    // 2. Has matching service category
    // 3. Active
    // 4. Online OR has accepted similar bookings recently
    // 5. No conflicting booking at scheduled_at±duration
    // 6. Not the currently-assigned provider

    const candidates = await db.selectFrom('users as u')
      .innerJoin('provider_profile as pp', 'pp.user_id', 'u.id')
      .innerJoin('provider_categories as pc', 'pc.user_id', 'u.id')
      .leftJoin('provider_availability as pa', 'pa.user_id', 'u.id')
      .select([
        'u.id', 'u.first_name', 'u.last_name', 'u.profile_photo_url',
        'pp.tier', 'pp.rating_avg', 'pp.rating_count',
        'pp.last_active_at', 'pp.service_area_id', 'pp.service_radius_km',
      ])
      .where('pp.status', '=', 'active')
      .where('pc.service_category_id', '=', booking.service_category_id)
      .where('u.id', '!=', booking.current_provider_id)
      // Service area match (or radius covers the booking address)
      .where(eb => eb.or([
        eb('pp.service_area_id', '=', address.service_area_id),
        // distance check via PostGIS
        sql<boolean>`ST_DWithin(
          ST_MakePoint(${address.lng}, ${address.lat})::geography,
          (SELECT ST_MakePoint(center_lng, center_lat)::geography FROM service_areas WHERE id = pp.service_area_id),
          pp.service_radius_km * 1000
        )`,
      ]))
      // No conflicting booking within scheduled window
      .where(eb => eb.not(eb.exists(
        sql`SELECT 1 FROM bookings b2 WHERE b2.provider_id = u.id
            AND b2.status IN ('confirmed','provider_en_route','provider_arrived','in_progress')
            AND tstzrange(b2.scheduled_at, b2.scheduled_at + (b2.duration_minutes || ' minutes')::interval)
              && tstzrange(${booking.scheduled_at}, ${booking.scheduled_at} + (${booking.duration_minutes} || ' minutes')::interval)`
      )))
      .orderBy(sql`pp.last_active_at DESC NULLS LAST`)
      .limit(5)
      .execute();

    res.json({
      data: {
        bookingId: booking.id,
        currentProviderId: booking.current_provider_id,
        candidates: await Promise.all(candidates.map(async c => ({
          id: c.id,
          firstName: c.first_name,
          lastName: c.last_name,
          photoUrl: c.profile_photo_url,
          tier: c.tier,
          rating: c.rating_avg,
          ratingCount: c.rating_count,
          jobsToday: await getJobsTodayCount(c.id),
          distanceKm: await getDistanceKm({ providerId: c.id, addressId: booking.address_id }),
          lastActiveAt: c.last_active_at,
        }))),
      },
    });
  },
);

router.post(
  '/admin/bookings/:id/reassign',
  requireAdmin,
  requireAdminCsrf,
  async (req, res) => {
    const { newProviderId, reason } = z.object({
      newProviderId: z.string().uuid(),
      reason: z.string().min(30).max(2000),
    }).parse(req.body);

    return db.transaction().execute(async (trx) => {
      const booking = await trx.selectFrom('bookings').selectAll()
        .where('id', '=', req.params.id).executeTakeFirstOrThrow();

      if (!['confirmed', 'provider_en_route'].includes(booking.status)) {
        throw new BadRequestError('booking_state_invalid', 'Cannot reassign booking in this state');
      }

      const oldProviderId = booking.provider_id;

      // Verify new provider eligibility
      const candidates = await fetchEligibleCandidates(trx, booking);
      if (!candidates.find(c => c.id === newProviderId)) {
        throw new BadRequestError('provider_not_eligible', 'Selected provider does not match booking eligibility criteria');
      }

      await trx.updateTable('bookings').set({
        provider_id: newProviderId,
        reassigned_at: new Date(),
        reassigned_from: oldProviderId,
        reassigned_by: req.user!.id,
        reassignment_reason: reason,
      }).where('id', '=', booking.id).execute();

      await trx.insertInto('admin_actions').values({
        actor_id: req.user!.id,
        action_type: 'booking_reassigned',
        target_type: 'booking',
        target_id: booking.id,
        reason: reason.slice(0, 500),
        full_notes: reason,
        details: JSON.stringify({ from_provider_id: oldProviderId, to_provider_id: newProviderId }),
      }).execute();

      // Notify both providers + customer
      await trx.insertInto('notifications').values([
        { user_id: oldProviderId, type: 'booking_reassigned_away', payload: JSON.stringify({ booking_id: booking.id, reason: reason.slice(0, 200) }) },
        { user_id: newProviderId, type: 'booking_reassigned_to_you', payload: JSON.stringify({ booking_id: booking.id }) },
        { user_id: booking.customer_id, type: 'booking_provider_changed', payload: JSON.stringify({ booking_id: booking.id }) },
      ]).execute();

      res.json({ data: { ok: true, oldProviderId, newProviderId } });
    });
  },
);
```

**Step 2.** Admin frontend modal (per Part 2A section 9 spec):

```tsx
// apps/admin/src/components/dispatch/ReassignModal.tsx
export function ReassignModal({ bookingId, currentProviderId, onClose }: Props) {
  const { data: candidates, isLoading } = useQuery({
    queryKey: ['reassign-candidates', bookingId],
    queryFn: () => api.get<{ data: { candidates: Candidate[] } }>(`/admin/bookings/${bookingId}/reassign-candidates`),
  });
  const [selectedProviderId, setSelectedProviderId] = useState<string>();
  const [reason, setReason] = useState('');
  const [confirmStep, setConfirmStep] = useState<'select' | 'confirm'>('select');

  const reassignMutation = useMutation({
    mutationFn: () => api.post(`/admin/bookings/${bookingId}/reassign`, {
      newProviderId: selectedProviderId,
      reason,
    }),
    onSuccess: () => { toast.success('Booking reassigned'); onClose(); },
    onError: (err: ApiError) => toast.error(err.body?.error?.message ?? 'Reassign failed'),
  });

  if (isLoading) return <Modal title="Reassign Booking"><Skeleton /></Modal>;

  if (confirmStep === 'select') {
    return (
      <Modal title="Reassign Booking" onClose={onClose}>
        <Subhead>Choose a new provider:</Subhead>
        {candidates?.data.candidates.length === 0 ? (
          <EmptyState icon={<UserX />} title="No eligible providers" body="No providers in this area + category are currently available at the booking time. Consider cancelling instead." />
        ) : (
          <CandidateList>
            {candidates?.data.candidates.map(c => (
              <CandidateRow
                key={c.id}
                candidate={c}
                selected={selectedProviderId === c.id}
                onSelect={() => setSelectedProviderId(c.id)}
              />
            ))}
          </CandidateList>
        )}

        <FormField label="Reason (≥30 chars)" required>
          <TextArea value={reason} onChange={setReason} minLength={30} maxLength={2000} rows={3} />
          <CharCount value={reason} min={30} max={2000} />
        </FormField>

        <ActionRow>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!selectedProviderId || reason.length < 30}
            onClick={() => setConfirmStep('confirm')}
          >Continue →</Button>
        </ActionRow>
      </Modal>
    );
  }

  // Confirmation step
  return (
    <Modal title="Confirm Reassignment" onClose={onClose}>
      <ConfirmationDetails>
        <Field label="From">{currentProvider?.fullName}</Field>
        <Field label="To">{selectedProvider?.fullName}</Field>
        <Field label="Reason">{reason}</Field>
      </ConfirmationDetails>

      <Warning>This action cannot be undone. Both providers will be notified.</Warning>

      <ActionRow>
        <Button variant="ghost" onClick={() => setConfirmStep('select')}>Back</Button>
        <Button variant="danger" onClick={() => reassignMutation.mutate()} loading={reassignMutation.isLoading}>
          Confirm Reassignment
        </Button>
      </ActionRow>
    </Modal>
  );
}
```

### Test signature

```ts
describe('Reassign booking (Bug 272.A + LAUNCH-LIMITATIONS §1)', () => {
  it('GET /reassign-candidates returns providers matching area + category', async () => {
    const booking = await seedBookingNeedingReassignment();
    const eligibleProvider = await seedActiveProvider({ areaId: booking.areaId, categoryIds: [booking.categoryId] });
    const ineligibleProvider = await seedActiveProvider({ areaId: 'other-area', categoryIds: [booking.categoryId] });

    const res = await request(app).get(`/api/v1/admin/bookings/${booking.id}/reassign-candidates`)
      .set('Authorization', `Bearer ${adminToken}`);
    
    expect(res.body.data.candidates.map((c: any) => c.id)).toContain(eligibleProvider.id);
    expect(res.body.data.candidates.map((c: any) => c.id)).not.toContain(ineligibleProvider.id);
  });

  it('POST /reassign rejects ineligible provider', async () => {
    const booking = await seedBookingNeedingReassignment();
    const ineligibleProvider = await seedActiveProvider({ areaId: 'other-area', categoryIds: ['other-category'] });

    const res = await request(app).post(`/api/v1/admin/bookings/${booking.id}/reassign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-CSRF-Token', csrfToken)
      .send({ newProviderId: ineligibleProvider.id, reason: 'because i said so '.repeat(3) });
    
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('provider_not_eligible');
  });

  it('POST /reassign rejects reason < 30 chars', async () => {
    const res = await request(app).post(`/api/v1/admin/bookings/${booking.id}/reassign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-CSRF-Token', csrfToken)
      .send({ newProviderId: validProviderId, reason: 'short reason' });
    
    expect(res.status).toBe(400);
  });

  it('POST /reassign creates audit row + notifies all 3 parties', async () => {
    // ...
    const audit = await db.selectFrom('admin_actions').selectAll()
      .where('action_type', '=', 'booking_reassigned')
      .where('target_id', '=', booking.id).executeTakeFirstOrThrow();
    expect(audit.full_notes).toContain('reason text...');

    const notifs = await db.selectFrom('notifications').selectAll()
      .where('payload', 'like', `%${booking.id}%`).execute();
    expect(notifs).toHaveLength(3);  // old provider, new provider, customer
  });
});
```

---

## Bug 272.B — Cancel button window.alert stub + LAUNCH-LIMITATIONS §2 (no refund preview)

### Exact fix

The cancel-preview endpoint computes refund using Dispatch 02's `calculateCancellation` (which reads from the canonical `cancellation_policies` table):

```ts
// packages/api/src/routes/admin/dispatch.ts
router.post(
  '/admin/bookings/:id/cancel-preview',
  requireAdmin,
  async (req, res) => {
    const booking = await db.selectFrom('bookings').selectAll()
      .where('id', '=', req.params.id).executeTakeFirstOrThrow();

    if (!['confirmed', 'provider_en_route', 'provider_arrived', 'in_progress'].includes(booking.status)) {
      throw new BadRequestError('booking_state_invalid', `Cannot cancel from status ${booking.status}`);
    }

    const calculation = await calculateCancellation(booking.id);  // from Dispatch 02
    res.json({ data: calculation });
  },
);

router.post(
  '/admin/bookings/:id/cancel',
  requireAdmin,
  requireAdminCsrf,
  async (req, res) => {
    const { reason } = z.object({ reason: z.string().min(30).max(2000) }).parse(req.body);
    const result = await cancelBookingAsAdmin(req.params.id, req.user!.id, reason);  // from Dispatch 06
    res.json({ data: result });
  },
);
```

Admin modal:

```tsx
export function CancelBookingModal({ bookingId, onClose }: Props) {
  const [reason, setReason] = useState('');
  const [typedConfirmation, setTypedConfirmation] = useState('');
  const { data: preview } = useQuery({
    queryKey: ['cancel-preview', bookingId],
    queryFn: () => api.post<{ data: CancellationCalculation }>(`/admin/bookings/${bookingId}/cancel-preview`),
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.post(`/admin/bookings/${bookingId}/cancel`, { reason }),
    onSuccess: () => { toast.success('Booking cancelled'); onClose(); },
  });

  return (
    <Modal title="Cancel Booking" onClose={onClose}>
      <RefundPreview>
        <Heading>Refund preview (per current cancellation policy)</Heading>
        {preview ? (
          <>
            <Field label="Tier">{preview.data.tier_label}</Field>
            <Field label="Refund to customer">{formatCurrency(preview.data.refund_amount_cents)}</Field>
            <Field label="Charged (kept)">{formatCurrency(preview.data.fee_amount_cents)}</Field>
            <Field label="Total billed">{formatCurrency(preview.data.total_charged_cents)}</Field>
            <Caption>Policy version {preview.data.policy_version}</Caption>
          </>
        ) : <Skeleton />}
      </RefundPreview>

      <FormField label="Cancellation reason (≥30 chars)" required>
        <TextArea value={reason} onChange={setReason} minLength={30} rows={4} />
      </FormField>

      <FormField label={`Type "${bookingId.slice(0,8)}" to confirm`}>
        <TextInput value={typedConfirmation} onChange={setTypedConfirmation} />
      </FormField>

      <ActionRow>
        <Button variant="ghost" onClick={onClose}>Back</Button>
        <Button
          variant="danger"
          disabled={reason.length < 30 || typedConfirmation !== bookingId.slice(0, 8)}
          onClick={() => cancelMutation.mutate()}
          loading={cancelMutation.isLoading}
        >
          Cancel Booking
        </Button>
      </ActionRow>
    </Modal>
  );
}
```

Per Part 2A section 8, the typed-confirmation step prevents accidental cancellation. The preview shows the canonical refund (not a client-computed estimate).

---

## Bug 272.C — Message button window.alert stub

### Exact fix

```ts
// packages/api/src/routes/admin/dispatch.ts
router.post(
  '/admin/bookings/:id/message',
  requireAdmin,
  requireAdminCsrf,
  async (req, res) => {
    const { recipients, message } = z.object({
      recipients: z.array(z.enum(['customer', 'provider'])).min(1),
      message: z.string().min(10).max(500),
    }).parse(req.body);

    const booking = await db.selectFrom('bookings').selectAll()
      .where('id', '=', req.params.id).executeTakeFirstOrThrow();

    return db.transaction().execute(async (trx) => {
      const userIds = [];
      if (recipients.includes('customer')) userIds.push(booking.customer_id);
      if (recipients.includes('provider')) userIds.push(booking.provider_id);

      // Insert in-app notification for each recipient
      for (const userId of userIds) {
        await trx.insertInto('notifications').values({
          user_id: userId,
          type: 'admin_message',
          payload: JSON.stringify({ booking_id: booking.id, message, from: 'admin' }),
        }).execute();
      }

      // Audit
      await trx.insertInto('admin_actions').values({
        actor_id: req.user!.id,
        action_type: 'admin_message_sent',
        target_type: 'booking',
        target_id: booking.id,
        reason: `Message to ${recipients.join('+')}`,
        full_notes: message,
        details: JSON.stringify({ recipients, message_length: message.length }),
      }).execute();

      res.json({ data: { ok: true, sentTo: userIds.length } });
    });
  },
);
```

Admin frontend modal:

```tsx
export function AdminMessageModal({ bookingId, onClose }: Props) {
  const [message, setMessage] = useState('');
  const [recipients, setRecipients] = useState<('customer' | 'provider')[]>(['customer', 'provider']);

  const sendMutation = useMutation({
    mutationFn: () => api.post(`/admin/bookings/${bookingId}/message`, { recipients, message }),
    onSuccess: () => { toast.success('Message sent'); onClose(); },
  });

  return (
    <Modal title="Send Message" onClose={onClose}>
      <FormField label="Recipients">
        <CheckboxGroup
          options={[{ value: 'customer', label: 'Customer' }, { value: 'provider', label: 'Provider' }]}
          value={recipients}
          onChange={setRecipients}
          minSelected={1}
        />
      </FormField>

      <FormField label="Message" required>
        <TextArea value={message} onChange={setMessage} maxLength={500} rows={5} />
        <CharCount value={message} max={500} />
      </FormField>

      <ActionRow>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          disabled={message.length < 10 || recipients.length === 0}
          onClick={() => sendMutation.mutate()}
        >Send</Button>
      </ActionRow>
    </Modal>
  );
}
```

---

## Bug 309 — Payout approve has no confirmation/audit reason

**File:** `apps/admin/src/pages/PayoutsPage.tsx`

### Current state

Click "Approve" → instant approve. Money moves. No audit reason captured.

### Exact fix (per Part 2A section 16):

```tsx
// PayoutsPage.tsx — approve action
const handleApprove = (payout: Payout) => {
  openModal(<ApprovePayoutModal payout={payout} onClose={() => closeModal()} />);
};

// ApprovePayoutModal
export function ApprovePayoutModal({ payout, onClose }: Props) {
  const [reason, setReason] = useState('Routine payout — verified');

  const approveMutation = useMutation({
    mutationFn: () => api.post(`/admin/payouts/${payout.id}/approve`, { reason }),
    onSuccess: () => { toast.success('Payout approved'); onClose(); },
  });

  return (
    <Modal title="Approve Payout" onClose={onClose}>
      <PayoutSummary>
        <Field label="Provider">{payout.providerName}</Field>
        <Field label="Amount">{formatCurrency(payout.amountCents)}</Field>
        <Field label="Method">{payout.method} {payout.maskedAccount}</Field>
      </PayoutSummary>

      <Preview>
        <Text>Will move {formatCurrency(payout.amountCents)} from platform wallet to provider wallet, then trigger PayMongo transfer to {payout.method} {payout.maskedAccount}.</Text>
      </Preview>

      <FormField label="Reason" required>
        <TextArea value={reason} onChange={setReason} minLength={10} rows={3} />
      </FormField>

      <ActionRow>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          disabled={reason.length < 10}
          onClick={() => approveMutation.mutate()}
          loading={approveMutation.isLoading}
        >Approve</Button>
      </ActionRow>
    </Modal>
  );
}
```

Server endpoint follows Dispatch 06's transactional pattern — audit row inside same transaction as money movement.

---

## Bug 357/358/360 — TOTP setup secret leak risk

**Files:** `apps/admin/src/pages/LoginPage.tsx` 2FA setup view + `StaffRolesPage.tsx`

### Current state

TOTP setup shows secret as plain `<code>` text. Screen-record leak risk. No backup codes generated.

### Exact fix

Per Part 2A section 27 spec:

```tsx
// apps/admin/src/components/TwoFactorSetup.tsx
export function TwoFactorSetup({ secret, otpauthUri, onConfirm }: Props) {
  const [showRevealConfirm, setShowRevealConfirm] = useState(false);
  const qrCodeDataUri = useMemo(() => generateQrCode(otpauthUri), [otpauthUri]);

  const copySecret = async () => {
    await navigator.clipboard.writeText(secret);
    toast.success('Secret copied. Clipboard will clear in 30 seconds.');
    // Bug 357 fix: clear clipboard
    setTimeout(() => navigator.clipboard.writeText(''), 30_000);
  };

  return (
    <div>
      <h2>Set up 2FA</h2>
      <p>Scan this QR code with Google Authenticator, Authy, or similar:</p>
      <img src={qrCodeDataUri} alt="2FA QR code" width={240} height={240} />

      <details>
        <summary>Can't scan? Show secret manually</summary>
        {showRevealConfirm ? (
          <>
            <CodeBox secret={secret} masked={false} />
            <Button onClick={copySecret}>Copy to clipboard</Button>
            <Caption>Clipboard clears in 30 seconds.</Caption>
          </>
        ) : (
          <>
            <Warning>Make sure no one is looking at your screen.</Warning>
            <Button onClick={() => setShowRevealConfirm(true)}>I'm alone — show secret</Button>
          </>
        )}
      </details>

      <FormField label="Enter the 6-digit code from your authenticator app" required>
        <OtpInput onComplete={async (code) => {
          const result = await api.post('/admin/auth/2fa/enable', { totp: code });
          if (result.data.backupCodes) {
            // Bug 360 fix: show backup codes once
            openModal(<BackupCodesModal codes={result.data.backupCodes} onConfirm={onConfirm} />);
          }
        }} />
      </FormField>
    </div>
  );
}
```

Backup codes:

```tsx
export function BackupCodesModal({ codes, onConfirm }: Props) {
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <Modal title="Save your backup codes" closeable={false}>
      <Warning>
        These codes will be shown <strong>only once</strong>. Save them somewhere safe — a password manager is ideal.
        Each code works once if you lose access to your authenticator.
      </Warning>

      <BackupCodeList>
        {codes.map(code => <BackupCode key={code} value={code} />)}
      </BackupCodeList>

      <ActionRow>
        <Button onClick={() => downloadAsTxt(codes, 'onservice-2fa-backup-codes.txt')}>Download as .txt</Button>
        <Button onClick={() => copyAllToClipboard(codes)}>Copy all</Button>
        <Button onClick={() => printCodes(codes)}>Print</Button>
      </ActionRow>

      <Checkbox checked={acknowledged} onChange={setAcknowledged}>
        I have saved these codes. I understand I won't see them again.
      </Checkbox>

      <Button disabled={!acknowledged} onClick={onConfirm}>Continue</Button>
    </Modal>
  );
}
```

Server generates backup codes and stores hashed:

```ts
router.post('/admin/auth/2fa/enable', requireAuth, async (req, res) => {
  const { totp } = z.object({ totp: z.string().regex(/^\d{6}$/) }).parse(req.body);
  
  // Verify TOTP against pending secret
  const setup = await db.selectFrom('admin_2fa_setup').selectAll()
    .where('admin_user_id', '=', req.adminUser!.id).executeTakeFirstOrThrow();
  
  if (!verifyTotp(setup.secret_encrypted_at_rest, totp)) {
    throw new BadRequestError('totp_invalid');
  }

  // Generate 8 backup codes
  const backupCodes = Array.from({ length: 8 }, () => generateBackupCode());
  const hashedCodes = await Promise.all(backupCodes.map(c => hashBackupCode(c)));

  return db.transaction().execute(async (trx) => {
    await trx.updateTable('admin_users').set({
      totp_secret: setup.secret_encrypted_at_rest,
      totp_enabled: true,
    }).where('id', '=', req.adminUser!.id).execute();

    await trx.insertInto('admin_backup_codes').values(
      hashedCodes.map((hash, idx) => ({
        admin_user_id: req.adminUser!.id,
        code_hash: hash,
        created_at: new Date(),
      }))
    ).execute();

    await trx.deleteFrom('admin_2fa_setup').where('admin_user_id', '=', req.adminUser!.id).execute();

    res.json({ data: { backupCodes } });  // Returned ONCE
  });
});
```

---

## Bug 1244 — Auto-refresh polling not respecting visibility

**File:** `apps/admin/src/pages/DashboardPage.tsx`

### Current state

Dashboard uses `setInterval` regardless of tab visibility. Polls every 60s while tab hidden — wasted bandwidth, drained battery.

### Exact fix

```tsx
function useVisibilityAwarePolling(callback: () => void, interval: number) {
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      timer = setInterval(callback, interval);
    };
    const stop = () => {
      if (timer) { clearInterval(timer); timer = null; }
    };

    if (document.visibilityState === 'visible') start();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        callback();  // immediate refresh on becoming visible
        start();
      } else {
        stop();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      stop();
    };
  }, [callback, interval]);
}

// In DashboardPage
useVisibilityAwarePolling(() => queryClient.invalidateQueries(['dashboard']), 60_000);
```

---

## Bug 1257 — Real-time status badges missing

### Exact fix

Subscribe to socket.io `admin:bookings` room from BookingsPage.tsx, update individual rows when `booking:status_changed` event arrives:

```tsx
import { useSocketRoom } from '@/lib/socket';

useSocketRoom('admin:bookings', {
  'booking:status_changed': (event: { bookingId: string; status: string }) => {
    queryClient.setQueryData(['bookings'], (old: any) => {
      if (!old) return old;
      return {
        ...old,
        data: old.data.map((b: any) => b.id === event.bookingId ? { ...b, status: event.status } : b),
      };
    });
  },
});
```

---

## Dispatch 10 closeout

**Bugs claimed fixed (9):**
- Bug 272.A — Reassign window.alert → real mutation with eligibility filter
- Bug 272.B — Cancel window.alert → real mutation with refund preview
- Bug 272.C — Message window.alert → real mutation
- Bug 309 — Payout approve confirmation modal + reason
- Bug 357 — TOTP secret reveal-with-warning + clipboard auto-clear
- Bug 358 — same chain
- Bug 360 — backup codes generated + downloadable
- Bug 1244 — visibility-aware polling
- Bug 1257 — real-time status badges via socket
- LAUNCH-LIMITATIONS §1 → resolved (eligibility filter)
- LAUNCH-LIMITATIONS §2 → resolved (refund preview)

**Files added:**
- `packages/api/src/routes/admin/dispatch.ts`
- `apps/admin/src/components/dispatch/ReassignModal.tsx`
- `apps/admin/src/components/dispatch/CancelBookingModal.tsx`
- `apps/admin/src/components/dispatch/AdminMessageModal.tsx`
- `apps/admin/src/components/dispatch/ApprovePayoutModal.tsx`
- `apps/admin/src/components/auth/TwoFactorSetup.tsx`
- `apps/admin/src/components/auth/BackupCodesModal.tsx`
- `apps/admin/src/hooks/useVisibilityAwarePolling.ts`
- `packages/api/migrations/084_admin_backup_codes.sql`
- `packages/api/migrations/085_admin_2fa_setup.sql`
- ~9 test files

**Files modified:**
- `apps/admin/src/pages/DispatchConsolePage.tsx` (replaces window.alert with modals)
- `apps/admin/src/pages/PayoutsPage.tsx`
- `apps/admin/src/pages/LoginPage.tsx`
- `apps/admin/src/pages/StaffRolesPage.tsx`
- `apps/admin/src/pages/DashboardPage.tsx` (visibility-aware polling)
- `apps/admin/src/pages/BookingsPage.tsx` (socket real-time)

**Documentation updates:**
- `LAUNCH-LIMITATIONS.md`: §1 and §2 marked resolved
- `docs/SECURITY-POSTURE.md` SEC-011: TOTP backup codes, 2FA enrollment requirements

**Decision points for Ken:**
- The reassign eligibility filter requires PostGIS extension on Postgres. If not already enabled, add `CREATE EXTENSION IF NOT EXISTS postgis;` in an early migration (or verify present in the existing setup).
- Real-time status updates depend on socket.io room subscriptions being healthy. Add Sentry breadcrumbs in production for socket disconnects so you can see frequency.
- Backup codes are stored as bcrypt hashes. Once generated and shown to user, originals are unrecoverable. Document in admin handbook that lost backup codes + lost authenticator = super_admin must reset.

---

# What's next: Dispatches 11–14

This installment covered Dispatches 09 (provider onboarding v1.0) and 10 (admin dispatch console wire-up). After these merge, the admin tooling is operationally complete: providers can be approved through a real workflow, dispatch operators can intervene on real bookings with proper validation, and 2FA is launchable.

Coming next:

- **Dispatch 11 — Mobile customer screen polish (86 bugs)**: per-screen polish from the audit findings I cataloged in Part 2B sections 1–43. Mostly mechanical: missing pull-to-refresh, empty state CTAs, accessibility labels, keyboard handling, validation messages, error boundaries. I'll group by screen type (auth, tabs, booking flow, account screens) and worked-example a few; the rest will be a table format since the patterns repeat.

- **Dispatch 12 — Mobile provider screen polish (64 bugs)**: same shape as 11 but for the 39 provider screens covered in Part 2C. Includes provider-specific patterns like haptic feedback on status transitions, GPS lifecycle management, NBI banner system.

- **Dispatch 13 — A/B testing + promo redemption decision**: Bugs 44 and 45 — wire end-to-end OR pull from product per Phase 14 decision document. If pulled, hide A/B Tests admin tab and remove promo input from checkout. If wired, build the experiment assignment service + redemption pipeline.

- **Dispatch 14 — Final smoke + production cutover**: 12 operational launch blockers (mostly NOT code changes — NPC DPO registration, BIR invoice series allocation, DTI/Mayor's permit verification, hCaptcha contract, Sentry production DSN, PayMongo merchant onboarding, S3 BIR bucket Object Lock, Postgres PITR, DNS+TLS, admin SSO if applicable, server-side BIR e-receipt issuance verification, plus a final smoke test sweep).

After Part 3 is complete:
- **Part 4** — Gate Hardening (the shell + CI scripts already shown across Dispatches 01-10, organized into reference)
- **Part 5** — Ken Handbook (review process for non-developer)

Say continue for Dispatches 11 and 12.
