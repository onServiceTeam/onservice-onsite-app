# BUG REMEDIATION MANUAL — Part 3 (continued)
## Dispatches 07 and 08

This installment covers provider trust integrity and regulatory compliance. Dispatch 07 fixes the broken provider job-completion pipeline (photos never uploaded, checklist hardcoded for cleaning, signature not actually captured). Dispatch 08 closes 18 NPC RA 10173 compliance gaps spanning DSR queue, consent versioning, breach notification, marketing opt-out, and audit-log PII masking.

After Dispatches 07 and 08 merge, a customer can review a job and trust that the photos they're seeing are real S3-uploaded evidence; an NPC investigator can audit DSR fulfillment with reason text ≥30 chars on every status change; and your DPO has a working compliance dashboard.

---

# DISPATCH 07 — Provider job execution trust

## Goal

The audit found that the provider's job-completion flow is broken end-to-end:

- **Bug 36 + 38** — Provider photos uploaded via ImagePicker get `file://` device URIs sent to the API. Server stores the URIs, can't fetch them. Customer reviewing the job sees broken images. Server has no proof work was done.
- **Bug 37** — IC agreement signature: only `signedAt` timestamp is sent. The actual signature bitmap is captured in state but never persisted. Audit-trail claim "signature was captured" is unverifiable.
- **Bug 460** — Checklist hardcoded for cleaning services. An aircon repair provider sees "Vacuum floor" / "Wipe kitchen counter" — irrelevant to their job. Customer evidence trail is meaningless.
- **Bug 461** — Provider checklist photos: same `file://` URI problem as Bug 36/38. Photos in the checklist (e.g., "before kitchen", "after bathroom") never reach S3.
- **Bug 463** — Server has no record the checklist was even shown. Provider can mark a job complete without the client app having presented any checklist.

These five bugs together break the entire trust model:
- Customer pays.
- Provider says "done."
- No photos, no checklist proof, no signature.
- Customer disputes.
- Admin reviews — finds nothing in S3, nothing in checklist tables, no signature artifact.
- Decision falls back to "he said / she said."

This dispatch restores integrity. After it lands: provider can't mark complete without ≥2 after-photos in S3; checklist items are server-defined per service category; checklist completion is server-recorded; signature is captured as PNG and stored in S3.

**Branch:** `phase/14-d07-provider-job-trust`
**Tag at end:** `v0.14.0-d07-complete`
**Gates that must pass:** all five A–E.

---

## Bug 460 — Checklist hardcoded for cleaning services

**File:** `apps/mobile/app/provider/job/[id]/checklist.tsx:39-82` + `packages/api/src/services/checklist.service.ts` (does not yet exist)

### Current state

The mobile checklist screen has a hardcoded array `CLEANING_CHECKLIST_SECTIONS` that includes Living Room / Kitchen / Bathroom / Bedrooms with cleaning-specific items. Every provider sees this regardless of service category.

### Exact fix

**Architecture:** server stores checklist templates per subcategory in a new table. When provider opens the checklist screen, fetch the template via `GET /api/v1/jobs/:id/checklist`. Server returns the appropriate sections + items.

**Step 1.** Create migration `076_checklist_templates`:

```sql
-- packages/api/migrations/076_checklist_templates.sql

-- Template — defines what the checklist looks like for a subcategory
CREATE TABLE checklist_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subcategory_id UUID NOT NULL REFERENCES subcategories(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES admin_users(id),
  UNIQUE (subcategory_id, version)
);

CREATE TABLE checklist_template_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL,
  title TEXT NOT NULL,
  -- e.g., 'Pre-inspection', 'Cleaning', 'Refrigerant check', 'Test run'
  is_required BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE checklist_template_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES checklist_template_sections(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  photo_required BOOLEAN NOT NULL DEFAULT false,
  is_required BOOLEAN NOT NULL DEFAULT true
);

-- Per-job instance — records what was actually shown + completed
CREATE TABLE booking_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES checklist_templates(id),
  template_version INTEGER NOT NULL,                  -- snapshot version
  shown_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (booking_id)
);

CREATE TABLE booking_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_checklist_id UUID NOT NULL REFERENCES booking_checklists(id) ON DELETE CASCADE,
  template_item_id UUID NOT NULL REFERENCES checklist_template_items(id),
  -- Snapshot of item title at time of checklist creation, in case template changes
  title_snapshot TEXT NOT NULL,
  description_snapshot TEXT,
  photo_required BOOLEAN NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  photo_id UUID REFERENCES booking_photos(id),
  notes TEXT
);

CREATE INDEX idx_bcl_items_booking ON booking_checklist_items(booking_checklist_id);

-- Seed initial templates for the launch service categories
-- Cleaning subcategory
WITH ck_template AS (
  INSERT INTO checklist_templates (subcategory_id) VALUES (
    (SELECT id FROM subcategories WHERE slug = 'house-cleaning')
  ) RETURNING id
),
ck_section_pre AS (
  INSERT INTO checklist_template_sections (template_id, display_order, title)
  SELECT id, 1, 'Pre-service walk-through' FROM ck_template RETURNING id
),
ck_section_living AS (
  INSERT INTO checklist_template_sections (template_id, display_order, title)
  SELECT id, 2, 'Living room' FROM ck_template RETURNING id
),
ck_section_kitchen AS (
  INSERT INTO checklist_template_sections (template_id, display_order, title)
  SELECT id, 3, 'Kitchen' FROM ck_template RETURNING id
),
ck_section_bathroom AS (
  INSERT INTO checklist_template_sections (template_id, display_order, title)
  SELECT id, 4, 'Bathroom' FROM ck_template RETURNING id
),
ck_section_post AS (
  INSERT INTO checklist_template_sections (template_id, display_order, title)
  SELECT id, 5, 'Final walk-through' FROM ck_template RETURNING id
)
INSERT INTO checklist_template_items (section_id, display_order, title, photo_required, is_required)
VALUES
  ((SELECT id FROM ck_section_pre), 1, 'Inspect work area with customer', true, true),
  ((SELECT id FROM ck_section_pre), 2, 'Note any pre-existing damage', true, false),
  ((SELECT id FROM ck_section_living), 1, 'Vacuum / mop floor', false, true),
  ((SELECT id FROM ck_section_living), 2, 'Dust surfaces', false, true),
  ((SELECT id FROM ck_section_living), 3, 'Photo: living room after', true, true),
  ((SELECT id FROM ck_section_kitchen), 1, 'Wipe counters', false, true),
  ((SELECT id FROM ck_section_kitchen), 2, 'Clean stovetop', false, true),
  ((SELECT id FROM ck_section_kitchen), 3, 'Photo: kitchen after', true, true),
  ((SELECT id FROM ck_section_bathroom), 1, 'Scrub toilet', false, true),
  ((SELECT id FROM ck_section_bathroom), 2, 'Wipe sink + mirror', false, true),
  ((SELECT id FROM ck_section_bathroom), 3, 'Photo: bathroom after', true, true),
  ((SELECT id FROM ck_section_post), 1, 'Walk customer through completed work', false, true),
  ((SELECT id FROM ck_section_post), 2, 'Customer signs off', false, true);

-- Aircon repair template
-- ... (similar structure with Pre-inspection, Repair, Test run, Cleanup sections)

-- Plumbing template
-- ... (similar)

-- Beauty / massage / etc. templates
-- ... (similar)
```

**Step 2.** Server endpoint to create a booking_checklist when provider opens the screen:

```ts
// packages/api/src/routes/provider/checklist.ts
router.get('/jobs/:id/checklist', requireAuth, requireProviderRole, async (req, res) => {
  const bookingId = req.params.id;
  
  // Verify provider owns this booking
  const booking = await db.selectFrom('bookings')
    .select(['id', 'subcategory_id', 'provider_id', 'status'])
    .where('id', '=', bookingId)
    .where('provider_id', '=', req.user!.id)
    .executeTakeFirstOrThrow(() => new ForbiddenError('not_your_booking'));

  // Lookup or create the booking_checklist
  let checklist = await db.selectFrom('booking_checklists')
    .selectAll()
    .where('booking_id', '=', bookingId)
    .executeTakeFirst();

  if (!checklist) {
    checklist = await db.transaction().execute(async (trx) => {
      // Find active template for this subcategory
      const template = await trx.selectFrom('checklist_templates')
        .selectAll()
        .where('subcategory_id', '=', booking.subcategory_id)
        .where('is_active', '=', true)
        .orderBy('version', 'desc')
        .limit(1)
        .executeTakeFirstOrThrow(() => new InternalError(
          'no_template_for_subcategory',
          `No active checklist template for subcategory ${booking.subcategory_id}`,
        ));

      const newChecklist = await trx.insertInto('booking_checklists')
        .values({
          booking_id: bookingId,
          template_id: template.id,
          template_version: template.version,
        })
        .returning(['id', 'template_id', 'template_version'])
        .executeTakeFirstOrThrow();

      // Snapshot all items into booking_checklist_items
      const items = await trx.selectFrom('checklist_template_items as i')
        .innerJoin('checklist_template_sections as s', 's.id', 'i.section_id')
        .select(['i.id as template_item_id', 'i.title', 'i.description', 'i.photo_required', 's.display_order as sec_order', 'i.display_order as item_order'])
        .where('s.template_id', '=', template.id)
        .orderBy(['s.display_order', 'i.display_order'])
        .execute();

      if (items.length > 0) {
        await trx.insertInto('booking_checklist_items').values(
          items.map(item => ({
            booking_checklist_id: newChecklist.id,
            template_item_id: item.template_item_id,
            title_snapshot: item.title,
            description_snapshot: item.description,
            photo_required: item.photo_required,
          }))
        ).execute();
      }

      return newChecklist;
    });
  }

  // Return assembled checklist with sections and items
  const sections = await db.selectFrom('checklist_template_sections as s')
    .innerJoin('checklist_template_items as i', 'i.section_id', 's.id')
    .innerJoin('booking_checklist_items as bi', 'bi.template_item_id', 'i.id')
    .select([
      's.id as section_id', 's.title as section_title', 's.display_order',
      'bi.id as item_id', 'bi.title_snapshot as title', 'bi.description_snapshot as description',
      'bi.photo_required', 'bi.is_completed', 'bi.completed_at', 'bi.photo_id', 'bi.notes',
    ])
    .where('s.template_id', '=', checklist.template_id)
    .where('bi.booking_checklist_id', '=', checklist.id)
    .orderBy(['s.display_order', 'i.display_order'])
    .execute();

  // Group by section
  const grouped = groupBySectionId(sections);

  res.json({ data: { booking_checklist_id: checklist.id, sections: grouped } });
});
```

**Step 3.** Mobile checklist screen reads from server, no hardcoded array:

```tsx
// apps/mobile/app/provider/job/[id]/checklist.tsx
import { useQuery, useMutation } from '@tanstack/react-query';

export default function JobChecklistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['job-checklist', id],
    queryFn: () => api.get<{ data: { booking_checklist_id: string; sections: ChecklistSection[] } }>(`/api/v1/jobs/${id}/checklist`),
  });

  const toggleItem = useMutation({
    mutationFn: (params: { itemId: string; completed: boolean; photoId?: string }) =>
      api.patch(`/api/v1/jobs/${id}/checklist/items/${params.itemId}`, params),
    onSuccess: () => refetch(),
  });

  if (isLoading) return <ChecklistSkeleton />;
  if (error || !data) return <RetryBanner onRetry={refetch} />;

  // ... render data.data.sections ...
}
```

**Step 4.** Server-side toggle endpoint with photo validation (Bug 463 fix):

```ts
router.patch('/jobs/:id/checklist/items/:item_id', requireAuth, requireProviderRole, async (req, res) => {
  const { completed, photoId } = z.object({
    completed: z.boolean(),
    photoId: z.string().uuid().optional(),
  }).parse(req.body);

  const item = await db.selectFrom('booking_checklist_items as bi')
    .innerJoin('booking_checklists as bc', 'bc.id', 'bi.booking_checklist_id')
    .innerJoin('bookings as b', 'b.id', 'bc.booking_id')
    .select([
      'bi.id', 'bi.photo_required', 'b.provider_id',
      'bi.title_snapshot', 'bc.booking_id',
    ])
    .where('bi.id', '=', req.params.item_id)
    .executeTakeFirstOrThrow(() => new NotFoundError('item_not_found'));

  if (item.provider_id !== req.user!.id) throw new ForbiddenError('not_your_booking');

  if (completed && item.photo_required && !photoId) {
    throw new BadRequestError('photo_required', `"${item.title_snapshot}" requires a photo before marking complete.`);
  }

  // If photoId provided, verify it exists and belongs to this booking
  if (photoId) {
    const photo = await db.selectFrom('booking_photos').select(['id', 'booking_id', 'storage_url'])
      .where('id', '=', photoId).executeTakeFirstOrThrow(() => new BadRequestError('photo_not_found'));
    if (photo.booking_id !== item.booking_id) throw new BadRequestError('photo_wrong_booking');
  }

  await db.updateTable('booking_checklist_items').set({
    is_completed: completed,
    completed_at: completed ? new Date() : null,
    photo_id: photoId ?? null,
  }).where('id', '=', req.params.item_id).execute();

  res.json({ data: { ok: true } });
});
```

### Test signature

`packages/api/__tests__/services/checklist.service.test.ts`:

```ts
describe('Checklist (Bug 460 — service-category-driven)', () => {
  it('returns aircon checklist for aircon subcategory', async () => {
    const booking = await seedBooking({ subcategorySlug: 'aircon-repair' });
    const checklist = await getChecklist(booking.id);
    expect(checklist.sections.find(s => s.title === 'Pre-inspection')).toBeDefined();
    expect(checklist.sections.find(s => s.title === 'Living room')).toBeUndefined();
  });

  it('returns cleaning checklist for cleaning subcategory', async () => {
    const booking = await seedBooking({ subcategorySlug: 'house-cleaning' });
    const checklist = await getChecklist(booking.id);
    expect(checklist.sections.find(s => s.title === 'Kitchen')).toBeDefined();
    expect(checklist.sections.find(s => s.title === 'Refrigerant check')).toBeUndefined();
  });
});

describe('Checklist completion (Bug 463 — server validates)', () => {
  it('rejects completion when photo required and not provided', async () => {
    const item = await seedChecklistItem({ photoRequired: true });
    await expect(toggleItem(item.id, { completed: true }))
      .rejects.toThrow(/photo_required/);
  });

  it('persists completion to booking_checklist_items table', async () => {
    const item = await seedChecklistItem({ photoRequired: false });
    await toggleItem(item.id, { completed: true });
    const fresh = await db.selectFrom('booking_checklist_items')
      .selectAll().where('id', '=', item.id).executeTakeFirstOrThrow();
    expect(fresh.is_completed).toBe(true);
    expect(fresh.completed_at).toBeInstanceOf(Date);
  });
});
```

---

## Bug 461 + Bug 36 + Bug 38 — Photos never uploaded to S3

**Files:** `apps/mobile/app/provider/job/[id]/photos.tsx` + `apps/mobile/app/provider/job/[id]/complete.tsx` + `packages/api/src/routes/uploads.ts`

### Current state

Mobile picks photos via Expo `ImagePicker`. The result has `uri: 'file:///var/mobile/.../IMG_1234.jpg'`. Code passes the URI string straight to API. Server stores `file://` URI. Customer's photo viewer fetches `file://` → broken image.

### Exact fix

**Architecture:** photo upload is a 2-step flow:
1. Mobile compresses + resizes the image client-side.
2. Mobile POSTs `multipart/form-data` to `/api/v1/uploads/photos` with the file.
3. Server uploads to S3 (KMS-encrypted per Dispatch 01 Bug 1325) and inserts a `booking_photos` row with the S3 URL + thumbnail URL.
4. Server returns `{ photo_id, s3_url, thumbnail_url }`.
5. Mobile uses the `photo_id` for any subsequent API call (e.g., attaching to a checklist item via Bug 460/463 fix).

**Step 1.** Server upload endpoint:

```ts
// packages/api/src/routes/uploads.ts
import multer from 'multer';
import sharp from 'sharp';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },     // 10MB max
});

const s3 = new S3Client({});

router.post('/uploads/photos', requireAuth, upload.single('photo'), async (req, res) => {
  const file = req.file;
  if (!file) throw new BadRequestError('photo_missing', 'No photo in request');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
    throw new BadRequestError('photo_invalid_type', 'Only JPEG, PNG, WebP are accepted');
  }

  const { bookingId, photoType } = z.object({
    bookingId: z.string().uuid(),
    photoType: z.enum(['before', 'during', 'after', 'issue', 'checklist', 'identity', 'portfolio']),
  }).parse(req.body);

  // Verify caller has access to this booking (provider or customer)
  const booking = await db.selectFrom('bookings').select(['id', 'customer_id', 'provider_id'])
    .where('id', '=', bookingId).executeTakeFirstOrThrow();
  if (![booking.customer_id, booking.provider_id].includes(req.user!.id)) {
    throw new ForbiddenError('not_your_booking');
  }

  // Resize: max 1920px on longer side, 85% quality JPEG
  const fullBuffer = await sharp(file.buffer)
    .rotate()
    .resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();

  // Thumbnail: 256px on longer side
  const thumbBuffer = await sharp(file.buffer)
    .rotate()
    .resize(256, 256, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 75 })
    .toBuffer();

  const photoId = crypto.randomUUID();
  const fullKey = `bookings/${bookingId}/photos/${photoId}.jpg`;
  const thumbKey = `bookings/${bookingId}/photos/${photoId}_thumb.jpg`;

  // Upload both with KMS encryption
  await Promise.all([
    s3.send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_BOOKING_PHOTOS!,
      Key: fullKey,
      Body: fullBuffer,
      ContentType: 'image/jpeg',
      ServerSideEncryption: 'aws:kms',
      SSEKMSKeyId: process.env.S3_KMS_KEY_ID,
      Metadata: { uploaded_by: req.user!.id, booking_id: bookingId, photo_type: photoType },
    })),
    s3.send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_BOOKING_PHOTOS!,
      Key: thumbKey,
      Body: thumbBuffer,
      ContentType: 'image/jpeg',
      ServerSideEncryption: 'aws:kms',
      SSEKMSKeyId: process.env.S3_KMS_KEY_ID,
    })),
  ]);

  // Insert DB row
  const row = await db.insertInto('booking_photos').values({
    id: photoId,
    booking_id: bookingId,
    uploaded_by: req.user!.id,
    uploaded_by_role: req.user!.role,
    photo_type: photoType,
    storage_key: fullKey,
    thumbnail_key: thumbKey,
    original_size_bytes: file.size,
    stored_size_bytes: fullBuffer.length,
    mime_type: 'image/jpeg',
    uploaded_at: new Date(),
  }).returning(['id']).executeTakeFirstOrThrow();

  // Return signed URLs (expire in 1 hour for the response; consumers re-fetch as needed)
  const fullUrl = await getSignedUrl({ Bucket: process.env.S3_BUCKET_BOOKING_PHOTOS, Key: fullKey, expiresIn: 3600 });
  const thumbUrl = await getSignedUrl({ Bucket: process.env.S3_BUCKET_BOOKING_PHOTOS, Key: thumbKey, expiresIn: 3600 });

  res.json({ data: { photo_id: row.id, s3_url: fullUrl, thumbnail_url: thumbUrl } });
});
```

**Step 2.** Mobile upload helper:

```ts
// apps/mobile/src/services/photo-upload.ts
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { api } from './api';

export async function pickAndUploadPhoto(opts: {
  bookingId: string;
  photoType: 'before' | 'during' | 'after' | 'issue' | 'checklist' | 'identity' | 'portfolio';
  source: 'camera' | 'gallery';
}): Promise<{ photoId: string; s3Url: string; thumbnailUrl: string }> {
  // Permissions
  if (opts.source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('camera_permission_denied');
  } else {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) throw new Error('media_permission_denied');
  }

  // Pick
  const launcher = opts.source === 'camera'
    ? ImagePicker.launchCameraAsync
    : ImagePicker.launchImageLibraryAsync;
  const result = await launcher({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.7,
    allowsEditing: false,
    exif: false,
  });

  if (result.canceled || !result.assets?.[0]) throw new Error('cancelled');
  const asset = result.assets[0];

  // Compress further client-side (Bug 1216 fix in Part 2C)
  const compressed = await ImageManipulator.manipulateAsync(
    asset.uri,
    [{ resize: { width: 1920 } }],
    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG },
  );

  // Build multipart form
  const formData = new FormData();
  formData.append('photo', {
    uri: compressed.uri,
    type: 'image/jpeg',
    name: `photo_${Date.now()}.jpg`,
  } as unknown as Blob);
  formData.append('bookingId', opts.bookingId);
  formData.append('photoType', opts.photoType);

  // Upload — fetch wrapper because we don't use axios anymore (Bug 1271)
  const response = await fetch(`${API_BASE}/api/v1/uploads/photos`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await secureStorage.getString('access_token')}`,
      // NOTE: NO Content-Type header — browser sets multipart boundary automatically
    },
    body: formData,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(`upload_failed: ${body.error?.code ?? response.status}`);
  }

  const { data } = await response.json();
  return { photoId: data.photo_id, s3Url: data.s3_url, thumbnailUrl: data.thumbnail_url };
}
```

**Step 3.** Update `apps/mobile/app/provider/job/[id]/photos.tsx` to use the helper. Display state per photo: uploading / uploaded / failed (retry button).

```tsx
// apps/mobile/app/provider/job/[id]/photos.tsx
const [photos, setPhotos] = useState<Photo[]>([]);

const handleAddPhoto = async (source: 'camera' | 'gallery', photoType: PhotoType) => {
  const tempId = `temp-${Date.now()}`;
  setPhotos(prev => [...prev, { tempId, status: 'uploading', photoType }]);
  try {
    const result = await pickAndUploadPhoto({ bookingId: id, photoType, source });
    setPhotos(prev => prev.map(p =>
      p.tempId === tempId ? { ...p, photoId: result.photoId, thumbnailUrl: result.thumbnailUrl, status: 'uploaded' } : p
    ));
  } catch (err) {
    setPhotos(prev => prev.map(p =>
      p.tempId === tempId ? { ...p, status: 'failed', error: String(err) } : p
    ));
  }
};
```

**Step 4.** Update `apps/mobile/app/provider/job/[id]/complete.tsx` to verify photo count via server, not client:

```ts
// In server's complete endpoint:
router.post('/jobs/:id/complete', requireAuth, requireProviderRole, async (req, res) => {
  const booking = await db.selectFrom('bookings').selectAll()
    .where('id', '=', req.params.id).executeTakeFirstOrThrow();
  if (booking.provider_id !== req.user!.id) throw new ForbiddenError();

  // Bug 1220 fix + Bug 461 verification
  const afterPhotoCount = await db.selectFrom('booking_photos')
    .select(({ fn }) => fn.count<number>('id').as('c'))
    .where('booking_id', '=', booking.id)
    .where('photo_type', '=', 'after')
    .executeTakeFirstOrThrow();
  if (afterPhotoCount.c < 2) {
    throw new BadRequestError('insufficient_photos', 'At least 2 "after" photos are required');
  }

  // Bug 463 verification: checklist must be 100% complete
  const checklistStatus = await db.selectFrom('booking_checklists as bc')
    .innerJoin('booking_checklist_items as bi', 'bi.booking_checklist_id', 'bc.id')
    .select(({ fn }) => [
      fn.count<number>('bi.id').as('total'),
      fn.sum<number>(sql`CASE WHEN bi.is_completed THEN 1 ELSE 0 END`).as('completed'),
    ])
    .where('bc.booking_id', '=', booking.id)
    .executeTakeFirst();
  if (!checklistStatus || checklistStatus.total === 0) {
    throw new BadRequestError('checklist_not_started', 'Open the checklist before marking complete');
  }
  if (checklistStatus.completed < checklistStatus.total) {
    throw new BadRequestError('checklist_incomplete', `Complete all ${checklistStatus.total} checklist items first`);
  }

  // Transition status (using transactional pattern from Dispatch 06)
  await db.transaction().execute(async (trx) => {
    await trx.updateTable('bookings').set({
      status: 'awaiting_customer_confirmation',
      provider_completed_at: new Date(),
    }).where('id', '=', booking.id).where('status', '=', 'in_progress').execute();

    await trx.insertInto('notifications').values({
      user_id: booking.customer_id,
      type: 'job_completed_by_provider',
      payload: JSON.stringify({ booking_id: booking.id }),
    }).execute();
  });

  res.json({ data: { ok: true } });
});
```

### Test signature

`packages/api/__tests__/routes/uploads.test.ts`:

```ts
describe('POST /uploads/photos (Bug 461)', () => {
  it('uploads photo to S3 with KMS encryption', async () => {
    const buffer = await fs.readFile('__fixtures__/sample.jpg');
    const response = await request(app)
      .post('/api/v1/uploads/photos')
      .set('Authorization', `Bearer ${providerToken}`)
      .field('bookingId', booking.id)
      .field('photoType', 'after')
      .attach('photo', buffer, 'sample.jpg');

    expect(response.status).toBe(200);
    expect(response.body.data.photo_id).toMatch(/^[0-9a-f-]+$/);
    expect(response.body.data.s3_url).toMatch(/^https:\/\/.+\.s3.+\.amazonaws\.com/);

    // Verify DB row
    const row = await db.selectFrom('booking_photos').selectAll()
      .where('id', '=', response.body.data.photo_id).executeTakeFirstOrThrow();
    expect(row.storage_key).toMatch(/^bookings\/.+\/photos\/.+\.jpg$/);
    expect(row.mime_type).toBe('image/jpeg');
  });

  it('rejects oversized files', async () => {
    const buffer = Buffer.alloc(11 * 1024 * 1024);
    const response = await request(app).post('/api/v1/uploads/photos')
      .set('Authorization', `Bearer ${providerToken}`)
      .field('bookingId', booking.id).field('photoType', 'after')
      .attach('photo', buffer, 'big.jpg');
    expect(response.status).toBe(413);
  });

  it('rejects non-image MIME types', async () => {
    const response = await request(app).post('/api/v1/uploads/photos')
      .set('Authorization', `Bearer ${providerToken}`)
      .field('bookingId', booking.id).field('photoType', 'after')
      .attach('photo', Buffer.from('PDF data'), { filename: 'doc.pdf', contentType: 'application/pdf' });
    expect(response.status).toBe(400);
  });

  it('rejects when caller is not a party to the booking', async () => {
    const otherProvider = await seedProvider();
    const response = await request(app).post('/api/v1/uploads/photos')
      .set('Authorization', `Bearer ${otherProvider.token}`)
      .field('bookingId', booking.id).field('photoType', 'after')
      .attach('photo', sampleBuffer, 'p.jpg');
    expect(response.status).toBe(403);
  });
});
```

---

## Bug 37 — IC agreement signature not actually captured

**File:** `apps/mobile/app/provider-onboarding/identity-verification.tsx:121` + `packages/api/src/routes/provider/ic-agreement.ts`

### Current state

The signature pad component captures stroke vectors in component state. On submit, only `signedAt: timestamp` is sent. The signature data is lost.

### Exact fix

**Step 1.** Use a real signature canvas component. `react-native-signature-canvas` produces a base64 PNG. Convert to multipart upload.

```tsx
// apps/mobile/app/provider-onboarding/identity-verification.tsx
import SignatureScreen from 'react-native-signature-canvas';
import { uploadSignature } from '@/services/signature-upload';

export default function ICAgreementScreen() {
  const [signaturePngBase64, setSignaturePngBase64] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const sigRef = useRef<SignatureScreen>(null);

  const handleSignature = (signatureBase64: string) => {
    // base64 string with 'data:image/png;base64,' prefix
    setSignaturePngBase64(signatureBase64);
  };

  const handleSubmit = async () => {
    if (!signaturePngBase64) return alert('Please sign before submitting');
    if (!fullName.trim()) return alert('Type your full name');

    try {
      const { signatureId } = await uploadSignature({ base64Png: signaturePngBase64 });
      await api.post('/api/v1/provider/onboarding/ic-agreement', {
        signatureId,
        fullName: fullName.trim(),
        agreementVersion: agreementVersion,
      });
      router.push(Routes.PROVIDER.ONBOARDING.BACKGROUND_CHECK);
    } catch (err) {
      alert(`Submit failed: ${err}`);
    }
  };

  return (
    <ScrollView>
      <Markdown content={agreementContent} />
      <View style={{ height: 200, borderWidth: 1, borderColor: '#ccc' }}>
        <SignatureScreen
          ref={sigRef}
          onOK={handleSignature}
          descriptionText="Sign here"
          clearText="Clear"
          confirmText="Save"
          webStyle={`.m-signature-pad--footer { display: none; } body, html { background: white; }`}
        />
      </View>
      <Button title="Capture signature" onPress={() => sigRef.current?.readSignature()} />
      <Input label="Type your full name" value={fullName} onChangeText={setFullName} />
      <Button title="Sign and submit" onPress={handleSubmit} disabled={!signaturePngBase64 || !fullName.trim()} />
    </ScrollView>
  );
}
```

**Step 2.** `uploadSignature` helper:

```ts
// apps/mobile/src/services/signature-upload.ts
export async function uploadSignature({ base64Png }: { base64Png: string }): Promise<{ signatureId: string }> {
  // Strip prefix
  const base64 = base64Png.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

  const formData = new FormData();
  formData.append('signature', new Blob([buffer], { type: 'image/png' }), 'signature.png');

  const response = await fetch(`${API_BASE}/api/v1/uploads/signature`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await secureStorage.getString('access_token')}` },
    body: formData,
  });
  if (!response.ok) throw new Error(`signature_upload_failed`);
  const body = await response.json();
  return { signatureId: body.data.signature_id };
}
```

**Step 3.** Server upload endpoint (similar to photo upload but PNG-only, separate bucket):

```ts
router.post('/uploads/signature', requireAuth, upload.single('signature'), async (req, res) => {
  if (!req.file) throw new BadRequestError('signature_missing');
  if (req.file.mimetype !== 'image/png') throw new BadRequestError('signature_must_be_png');

  const id = crypto.randomUUID();
  const key = `signatures/${req.user!.id}/${id}.png`;
  await s3.send(new PutObjectCommand({
    Bucket: process.env.S3_BUCKET_LEGAL_DOCS!,
    Key: key,
    Body: req.file.buffer,
    ContentType: 'image/png',
    ServerSideEncryption: 'aws:kms',
    SSEKMSKeyId: process.env.S3_KMS_KEY_ID,
  }));

  await db.insertInto('signatures').values({
    id, user_id: req.user!.id, storage_key: key, captured_at: new Date(),
    ip_address: req.ip, user_agent: req.header('user-agent') ?? null,
  }).execute();

  res.json({ data: { signature_id: id } });
});
```

**Step 4.** IC agreement endpoint links signature to consent_record:

```ts
router.post('/provider/onboarding/ic-agreement', requireAuth, async (req, res) => {
  const { signatureId, fullName, agreementVersion } = z.object({
    signatureId: z.string().uuid(),
    fullName: z.string().min(2).max(200),
    agreementVersion: z.number().int().min(1),
  }).parse(req.body);

  // Verify signature belongs to caller
  const sig = await db.selectFrom('signatures').selectAll()
    .where('id', '=', signatureId).executeTakeFirstOrThrow();
  if (sig.user_id !== req.user!.id) throw new ForbiddenError();

  await db.transaction().execute(async (trx) => {
    // Generate signed PDF (combines agreement text + signature image + name + timestamp)
    // ... uses pdfkit, uploads to S3 ...
    const signedPdfKey = `legal/ic-agreements/${req.user!.id}/v${agreementVersion}.pdf`;
    
    await trx.insertInto('consent_records').values({
      user_id: req.user!.id,
      consent_type: 'ic_agreement',
      version: agreementVersion,
      signature_id: sig.id,
      signed_pdf_key: signedPdfKey,
      acknowledged_at: new Date(),
      full_name_typed: fullName,
      ip_address: req.ip,
      user_agent: req.header('user-agent') ?? null,
    }).execute();

    await trx.updateTable('provider_profile').set({
      ic_agreement_signed_at: new Date(),
      onboarding_step: 'background_check',
    }).where('user_id', '=', req.user!.id).execute();
  });

  res.json({ data: { ok: true } });
});
```

### Test signature

```ts
describe('IC agreement (Bug 37)', () => {
  it('rejects submission without signatureId', async () => {
    const response = await request(app).post('/api/v1/provider/onboarding/ic-agreement')
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ fullName: 'Juan dela Cruz', agreementVersion: 1 });
    expect(response.status).toBe(400);
  });

  it('persists signature reference in consent_records', async () => {
    const sig = await uploadTestSignature(providerId);
    await request(app).post('/api/v1/provider/onboarding/ic-agreement')
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ signatureId: sig.id, fullName: 'Juan dela Cruz', agreementVersion: 1 });

    const consent = await db.selectFrom('consent_records').selectAll()
      .where('user_id', '=', providerId).where('consent_type', '=', 'ic_agreement').executeTakeFirstOrThrow();
    expect(consent.signature_id).toBe(sig.id);
    expect(consent.full_name_typed).toBe('Juan dela Cruz');
  });

  it('rejects when signatureId belongs to different user', async () => {
    const otherUserSig = await uploadTestSignature(otherUserId);
    const response = await request(app).post('/api/v1/provider/onboarding/ic-agreement')
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ signatureId: otherUserSig.id, fullName: 'X', agreementVersion: 1 });
    expect(response.status).toBe(403);
  });
});
```

---

## Bug 38 — Customer chat photos & messages broken

**File:** `apps/mobile/app/customer/chat/[id].tsx`

Per Part 2B section 38 — **Phase 14 decision: chat is not wired for v1.0.** This bug is resolved by:
- Removing chat icon from booking detail (Part 2B section 19)
- Removing chat icon from quote selection (Part 2B section 15)
- Replacing chat link with "Contact support" link
- Adding LAUNCH-LIMITATIONS §X documenting chat as v1.1 feature
- Keeping the chat screen file but routing it to a placeholder screen showing "Chat will be available in a future update"

After v1.0 launch, when chat is wired, this bug reopens and is addressed by completing the socket.io message rendering + photo upload integration.

---

## Dispatch 07 closeout

**Bugs claimed fixed (12):**
- Bug 36 — `provider/job/[id]/complete.tsx` photos via S3 upload
- Bug 37 — `provider-onboarding/identity-verification.tsx` signature captured to S3
- Bug 38 — chat deferred to v1.1 (LAUNCH-LIMITATIONS)
- Bug 460 — checklist server-driven per subcategory
- Bug 461 — checklist photos via S3 upload
- Bug 463 — checklist completion server-validated
- Bug 1216 — photo compression + resize client-side
- Bug 1220 — server validates ≥2 after photos before allowing complete
- Bug 1224 — earlier provider photos screen now uses upload helper
- Bug 944 — customer photo viewer save-to-device works (uses real S3 URL not file://)
- Bug 943 — customer photo viewer pinch-zoom works (real images, not broken)
- Bug 73 — admin photo display uses S3 URL (image_type renamed from caption)

**Files added (~12):**
- `packages/api/migrations/076_checklist_templates.sql`
- `packages/api/migrations/077_booking_photos_signatures.sql`
- `packages/api/src/routes/uploads.ts`
- `packages/api/src/routes/provider/checklist.ts`
- `packages/api/src/services/checklist.service.ts`
- `apps/mobile/src/services/photo-upload.ts`
- `apps/mobile/src/services/signature-upload.ts`
- ~6 test files

**Files modified:**
- 4 mobile screens (provider job/photos, complete, identity-verification, checklist)
- ~3 customer screens that view photos
- ~2 admin pages that show booking photos
- `apps/api/src/routes/jobs.ts` (complete validation)

**Documentation updates:**
- `LAUNCH-LIMITATIONS.md` §23 added (chat deferred to v1.1)
- `docs/SECURITY-POSTURE.md` SEC-008 added (booking photos + signatures encrypted at rest)

**Decision points for Ken:**
- Checklist templates ship for cleaning, aircon, plumbing, electrical, beauty, massage, pest control, gardening. **You and your operations lead need to validate each template** — does aircon repair template's "Refrigerant check" section match what your providers actually do? Wrong template = wasted time for providers. Phase 14 dispatch 07 ships starter templates; v1.0.x patches refine them based on real provider feedback.
- After this dispatch, every job has S3 storage cost. Estimate: 10 photos × 200KB compressed = 2MB per job. At 100 jobs/day in Boracay: 200MB/day, 6GB/month. KMS-encrypted S3 cost ≈ $0.02/GB/month. Negligible at this scale; revisit when volume grows 100×.
- Signature canvas adds a native dependency (`react-native-signature-canvas`). Required EAS rebuild on next mobile deploy after this dispatch.

---

# DISPATCH 08 — NPC compliance + DSR

## Goal

The audit found 18 bugs spanning RA 10173 (Data Privacy Act) compliance:

- **DSR queue**: rejection/escalation reasons not enforced (Bug 397, 398), audit log CSV export doesn't self-audit (Bug 401), searchConsent accessible to non-DPO admins (Bug 402).
- **Consent versioning**: `consent_records.consent_type` lacks CHECK constraint (Bug 117); typos slip through silently.
- **Breach notification**: 72h NPC notification SLA not surfaced anywhere — no timer, no banner, no escalation if not notified within window.
- **Marketing consent**: backend doesn't honor opt-out toggle from `notification-settings.tsx` (Bug 969 chain).
- **Audit log PII**: raw IPs and user-agents exposed to non-super-admins (Bug 66, 75, 76, 81, 331).
- **Misc compliance**: ToS/privacy version not snapshotted at booking time (Bug 158), publishConsentVersion has no changeSummary minimum length (Bug 399), DSR detail PATCH may not dispatch all 4 service functions (Bug 153 reinforced).

After this dispatch lands, the platform meets the practical NPC compliance bar for v1.0 launch:
- Every consent action recorded with version + IP + UA + signed artifact (where applicable)
- Every DSR transition reasoned ≥30 chars with audit trail
- Marketing opt-out actually stops marketing notifications
- Breach notification timer prominently surfaces in Compliance page
- DPO has a working dashboard to track DSR queue + breach SLA
- Audit log CSV exports are themselves audit-logged

**Branch:** `phase/14-d08-npc-compliance`
**Tag at end:** `v0.14.0-d08-complete`
**Gates that must pass:** all five A–E.

---

## Bug 117 — `consent_records.consent_type` lacks CHECK constraint

**File:** `packages/api/migrations/057_consent_records.sql` (existing, missing constraint)

### Current state

The migration intentionally omits CHECK on `consent_type` for "flexibility." Result: typos silently pass — `consent_type='priacy_policy'` (typo) accepted. Auditor query `WHERE consent_type='privacy_policy'` misses the typo'd records.

### Exact fix

Migration `078_consent_type_check`:

```sql
-- packages/api/migrations/078_consent_type_check.sql

-- First, fix any existing typos (defensive)
UPDATE consent_records SET consent_type = 'privacy_policy' WHERE consent_type IN ('priacy_policy', 'privecy_policy', 'privacy-policy');
UPDATE consent_records SET consent_type = 'terms_of_service' WHERE consent_type IN ('tos', 'terms-of-service', 'terms_service');

-- Add the constraint
ALTER TABLE consent_records
  ADD CONSTRAINT consent_records_type_valid CHECK (
    consent_type IN (
      'privacy_policy',
      'terms_of_service',
      'marketing_consent',
      'ic_agreement',
      'cookie_policy',
      'data_processing',
      'biometric_consent'   -- for selfie liveness if/when wired
    )
  );

-- Document the migration path for adding new types: drop/recreate constraint (with data audit first)
COMMENT ON CONSTRAINT consent_records_type_valid ON consent_records IS
  'Adding new consent types: 1) audit existing rows for typos; 2) DROP CONSTRAINT; 3) ALTER (add new value); 4) ADD CONSTRAINT with new list.';
```

The Zod validators that insert into this table also enforce the same enum:

```ts
// shared/types/consent.ts
export const ConsentType = z.enum([
  'privacy_policy',
  'terms_of_service',
  'marketing_consent',
  'ic_agreement',
  'cookie_policy',
  'data_processing',
  'biometric_consent',
]);
export type ConsentType = z.infer<typeof ConsentType>;
```

Tests assert that an unknown enum value triggers the constraint:

```ts
describe('consent_records (Bug 117)', () => {
  it('CHECK constraint rejects typo consent_type', async () => {
    await expect(
      db.insertInto('consent_records').values({
        user_id: userId,
        consent_type: 'priacy_policy', // typo
        version: 1,
      }).execute()
    ).rejects.toThrow(/check constraint/i);
  });
});
```

---

## Bug 397 — `rejectDsr` route accepts empty reason

**File:** `packages/api/src/routes/admin/dsr.ts:228`

### Current state

The route handler defaults to empty string when `reason` is missing in body. Service may enforce, but the route doesn't.

### Exact fix

```ts
// packages/api/src/validators/admin/dsr.validator.ts
export const rejectDsrSchema = z.object({
  reason: z.string().min(30, 'Reason must be at least 30 characters'),
}).strict();

export const escalateToNpcSchema = z.object({
  reason: z.string().min(30),
  npcReference: z.string().regex(/^NPC-\d{4}-[A-Z0-9]{6,}$/, 'Must match NPC reference format'),
}).strict();
```

```ts
// packages/api/src/routes/admin/dsr.ts
router.post('/admin/dsr/:id/reject', requireDpoRole, requireAdminCsrf, async (req, res) => {
  const { reason } = rejectDsrSchema.parse(req.body);
  const dsr = await db.selectFrom('dsr_requests').selectAll()
    .where('id', '=', req.params.id).executeTakeFirstOrThrow();

  await db.transaction().execute(async (trx) => {
    await trx.updateTable('dsr_requests').set({
      status: 'rejected',
      resolved_at: new Date(),
      resolution_reason: reason,
    }).where('id', '=', dsr.id).execute();

    await trx.insertInto('admin_actions').values({
      actor_id: req.adminUser!.id,
      action_type: 'dsr_rejected',
      target_type: 'dsr_request',
      target_id: dsr.id,
      reason: reason.slice(0, 500),
      full_notes: reason,
      details: JSON.stringify({ dsr_type: dsr.type, customer_id: dsr.user_id }),
    }).execute();

    // Notify customer
    await trx.insertInto('notifications').values({
      user_id: dsr.user_id,
      type: 'dsr_rejected',
      payload: JSON.stringify({ dsr_id: dsr.id, reason: reason.slice(0, 200) }),
    }).execute();
  });

  res.json({ data: { ok: true } });
});

router.post('/admin/dsr/:id/escalate-npc', requireDpoRole, requireAdminCsrf, async (req, res) => {
  const { reason, npcReference } = escalateToNpcSchema.parse(req.body);
  // ... similar transaction pattern with action_type: 'dsr_escalated_npc' ...
});
```

### Test signature

```ts
describe('POST /admin/dsr/:id/reject (Bug 397)', () => {
  it('rejects empty reason', async () => {
    const r = await request(app).post(`/api/v1/admin/dsr/${dsrId}/reject`)
      .set('Authorization', `Bearer ${dpoToken}`).send({ reason: '' });
    expect(r.status).toBe(400);
  });

  it('rejects reason < 30 chars', async () => {
    const r = await request(app).post(`/api/v1/admin/dsr/${dsrId}/reject`)
      .set('Authorization', `Bearer ${dpoToken}`).send({ reason: 'short' });
    expect(r.status).toBe(400);
  });

  it('accepts reason ≥ 30 chars and persists in admin_actions.full_notes', async () => {
    const reason = 'Insufficient documentation provided despite three follow-up requests.';
    const r = await request(app).post(`/api/v1/admin/dsr/${dsrId}/reject`)
      .set('Authorization', `Bearer ${dpoToken}`).send({ reason });
    expect(r.status).toBe(200);
    const audit = await db.selectFrom('admin_actions').selectAll()
      .where('target_id', '=', dsrId).where('action_type', '=', 'dsr_rejected').executeTakeFirstOrThrow();
    expect(audit.full_notes).toBe(reason);
  });
});
```

---

## Bug 398 — `escalateDsrToNpc` no NPC reference validation

**File:** Same as Bug 397 — fixed in the same `escalateToNpcSchema` enforcing NPC reference format above.

NPC complaint references in PH follow `NPC-YYYY-XXXXXX` format. Without one, escalation is just a status flip with no follow-through capability.

### Test signature (additional)

```ts
describe('POST /admin/dsr/:id/escalate-npc (Bug 398)', () => {
  it('rejects bare reason without NPC reference', async () => {
    const r = await request(app).post(`/api/v1/admin/dsr/${dsrId}/escalate-npc`)
      .set('Authorization', `Bearer ${dpoToken}`)
      .send({ reason: 'thirty char reason for testing only' });
    expect(r.status).toBe(400);
  });

  it('rejects malformed NPC reference', async () => {
    const r = await request(app).post(`/api/v1/admin/dsr/${dsrId}/escalate-npc`)
      .set('Authorization', `Bearer ${dpoToken}`)
      .send({ reason: 'thirty char reason for testing only', npcReference: 'INVALID-FORMAT' });
    expect(r.status).toBe(400);
  });

  it('accepts valid NPC-YYYY-XXXXXX reference', async () => {
    const r = await request(app).post(`/api/v1/admin/dsr/${dsrId}/escalate-npc`)
      .set('Authorization', `Bearer ${dpoToken}`)
      .send({ reason: 'thirty char reason for testing only', npcReference: 'NPC-2026-A1B2C3' });
    expect(r.status).toBe(200);
  });
});
```

---

## Bug 401 — Audit CSV export doesn't write its own audit row

**File:** `packages/api/src/routes/admin/audit-log.ts:export endpoint`

### Current state

Admin clicks "Export to CSV" in Audit Log page. Server streams CSV. No `admin_actions` row recorded.

### Exact fix

```ts
router.get('/admin/audit-log/export.csv', requireAuditLogViewRole, async (req, res) => {
  const { startDate, endDate, actorId, actionType } = parseQueryFilters(req.query);

  const rows = await db.selectFrom('admin_actions').selectAll()
    .where('created_at', '>=', startDate)
    .where('created_at', '<=', endDate)
    .$if(!!actorId, qb => qb.where('actor_id', '=', actorId!))
    .$if(!!actionType, qb => qb.where('action_type', '=', actionType!))
    .orderBy('created_at', 'desc')
    .execute();

  // Write the export's own audit row BEFORE streaming
  await db.insertInto('admin_actions').values({
    actor_id: req.adminUser!.id,
    action_type: 'audit_log_exported',
    target_type: 'system',
    target_id: null,
    reason: `CSV export: ${rows.length} rows`,
    full_notes: `Filter: startDate=${startDate}, endDate=${endDate}, actorId=${actorId ?? 'all'}, actionType=${actionType ?? 'all'}. Result count: ${rows.length}.`,
    details: JSON.stringify({
      filter: { startDate, endDate, actorId, actionType },
      row_count: rows.length,
      ip_address: req.ip,
      user_agent: req.header('user-agent'),
    }),
    created_at: new Date(),
  }).execute();

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="audit-log-${startDate.toISOString().slice(0, 10)}-to-${endDate.toISOString().slice(0, 10)}.csv"`);

  // Stream CSV
  const writer = csv.format({ headers: true });
  writer.pipe(res);
  for (const row of rows) {
    writer.write({
      timestamp: row.created_at.toISOString(),
      actor_id: row.actor_id,
      action_type: row.action_type,
      target_type: row.target_type,
      target_id: row.target_id,
      reason: row.reason,
      // PII masked in CSV unless requester is super_admin (Bug 66 fix)
      ...maskPiiForRole(row, req.adminUser!.role),
    });
  }
  writer.end();
});
```

### Test signature

```ts
describe('GET /admin/audit-log/export.csv (Bug 401)', () => {
  it('inserts admin_actions row for the export itself', async () => {
    await request(app).get('/api/v1/admin/audit-log/export.csv?startDate=2026-04-01&endDate=2026-04-30')
      .set('Authorization', `Bearer ${superAdminToken}`).expect(200);
    const audit = await db.selectFrom('admin_actions').selectAll()
      .where('action_type', '=', 'audit_log_exported')
      .where('actor_id', '=', superAdminId)
      .orderBy('created_at', 'desc').limit(1).executeTakeFirstOrThrow();
    expect(audit.full_notes).toMatch(/Filter:.*Result count:/);
  });
});
```

---

## Bug 402 — `searchConsent` accessible to all admins

**File:** `packages/api/src/routes/admin/consent.ts:search`

### Current state

Endpoint is gated only by `requireAdminAuth`. Any admin (support, dispatcher, finance) can query consent records by user ID — including marketing opt-in/out for any customer. NPC violation: only DPO + super_admin should see consent records.

### Exact fix

```ts
// packages/api/src/middleware/require-dpo.ts
export function requireDpoRole(req: Request, res: Response, next: NextFunction) {
  if (!req.adminUser) return res.status(401).json({ error: { code: 'unauthenticated' } });
  if (!['super_admin', 'dpo'].includes(req.adminUser.role)) {
    return res.status(403).json({ error: { code: 'requires_dpo_role', message: 'This endpoint requires DPO or super_admin role.' } });
  }
  next();
}
```

```ts
// packages/api/src/routes/admin/consent.ts
router.get('/admin/consent/search', requireDpoRole, async (req, res) => {
  // ... existing query body ...
  
  // Audit the search itself (Bug 401-style — searches are sensitive)
  await db.insertInto('admin_actions').values({
    actor_id: req.adminUser!.id,
    action_type: 'consent_search',
    target_type: 'user',
    target_id: req.query.userId as string ?? null,
    reason: `Searched consent records: ${JSON.stringify(req.query).slice(0, 200)}`,
    full_notes: `Filter: ${JSON.stringify(req.query)}`,
    details: JSON.stringify({ ip: req.ip, ua: req.header('user-agent') }),
  }).execute();

  res.json({ data: { ... } });
});
```

Same pattern applied to `data-protection-log` (Part 2A section 23) and other DPO-gated endpoints.

---

## Bug 66 — Audit log PII raw to admin

**File:** `packages/api/src/routes/admin/audit-log.ts` + `apps/admin/src/pages/AuditLogPage.tsx`

### Current state

Admin's audit log lists every action, with raw `ip_address`, `user_agent`, and any PII embedded in `details` JSONB. Any admin (including support, dispatcher) can read raw PII.

### Exact fix

**Server-side masking layer:**

```ts
// packages/api/src/utils/pii-mask.ts
export function maskIp(ip: string | null): string {
  if (!ip) return '';
  // Keep first 3 octets for IPv4, first 4 groups for IPv6
  if (ip.includes(':')) {
    const groups = ip.split(':');
    return groups.slice(0, 4).join(':') + ':****';
  }
  const octets = ip.split('.');
  if (octets.length !== 4) return 'masked';
  return `${octets[0]}.${octets[1]}.${octets[2]}.***`;
}

export function maskUserAgent(ua: string | null): string {
  if (!ua) return '';
  // Browser + OS only — drop version numbers and architectures
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Safari')) return 'Safari';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Edge')) return 'Edge';
  if (ua.includes('expo') || ua.includes('Expo')) {
    if (ua.includes('iOS') || ua.includes('iPhone')) return 'Mobile (iOS)';
    if (ua.includes('Android')) return 'Mobile (Android)';
    return 'Mobile app';
  }
  return 'Other';
}

const PHONE_REGEX = /(\+?63)?\s?9\d{2}\s?\d{3}\s?\d{4}/g;
const EMAIL_REGEX = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g;

export function maskPiiInString(s: string): string {
  return s
    .replace(PHONE_REGEX, (m) => `+63 9XX XXX ${m.slice(-4)}`)
    .replace(EMAIL_REGEX, (m) => {
      const [name, domain] = m.split('@');
      return `${name[0]}•••@${domain}`;
    });
}

export function maskPiiInObject<T>(obj: T): T {
  const seen = new WeakSet();
  function recurse(node: any): any {
    if (node === null || typeof node !== 'object') {
      if (typeof node === 'string') return maskPiiInString(node);
      return node;
    }
    if (seen.has(node)) return node;
    seen.add(node);
    if (Array.isArray(node)) return node.map(recurse);
    const out: any = {};
    for (const k of Object.keys(node)) {
      if (k === 'ip_address') out[k] = maskIp(node[k]);
      else if (k === 'user_agent') out[k] = maskUserAgent(node[k]);
      else out[k] = recurse(node[k]);
    }
    return out;
  }
  return recurse(obj);
}

export function maskPiiForRole<T extends { ip_address?: string; user_agent?: string; details?: any }>(
  row: T,
  role: 'super_admin' | 'dpo' | 'admin' | 'finance' | 'support' | 'dispatcher',
): T {
  // super_admin sees raw (with audit of the read; Bug 81 reveal action)
  if (role === 'super_admin') return row;
  // DPO sees raw IP for compliance investigations but masked UA
  if (role === 'dpo') return { ...row, user_agent: maskUserAgent(row.user_agent ?? null) };
  // All others get fully masked
  return {
    ...row,
    ip_address: maskIp(row.ip_address ?? null),
    user_agent: maskUserAgent(row.user_agent ?? null),
    details: row.details ? maskPiiInObject(row.details) : row.details,
  };
}
```

**Apply on every audit-log response:**

```ts
router.get('/admin/audit-log', requireAdminAuth, async (req, res) => {
  const rows = await db.selectFrom('admin_actions').selectAll()/*...filters...*/.execute();
  const masked = rows.map(r => maskPiiForRole(r, req.adminUser!.role));
  res.json({ data: { rows: masked } });
});
```

**Reveal action (Bug 81):**

```ts
router.post('/admin/audit-log/:id/reveal-pii', requireSuperAdminRole, requireAdminCsrf, async (req, res) => {
  const { fields } = z.object({ fields: z.array(z.enum(['ip_address', 'user_agent', 'details'])) }).parse(req.body);
  const row = await db.selectFrom('admin_actions').selectAll().where('id', '=', req.params.id).executeTakeFirstOrThrow();

  // Audit the reveal
  await db.insertInto('admin_actions').values({
    actor_id: req.adminUser!.id,
    action_type: 'pii_reveal',
    target_type: 'admin_actions',
    target_id: row.id,
    reason: `Revealed: ${fields.join(', ')}`,
    full_notes: `Audit reveal of PII fields ${fields.join(', ')} on action ${row.id}.`,
    details: JSON.stringify({ revealed_fields: fields, target_action_type: row.action_type }),
  }).execute();

  const out: Record<string, unknown> = {};
  if (fields.includes('ip_address')) out.ip_address = row.ip_address;
  if (fields.includes('user_agent')) out.user_agent = row.user_agent;
  if (fields.includes('details')) out.details = row.details;

  res.json({ data: out });
});
```

Same pattern applied to PII fields on `providers`, `customers`, `bookings.contact` etc. — every response goes through `maskPiiForRole`.

### Test signature

```ts
describe('Audit log PII masking (Bug 66)', () => {
  it('support admin sees masked IPs', async () => {
    const r = await request(app).get('/api/v1/admin/audit-log')
      .set('Authorization', `Bearer ${supportToken}`).expect(200);
    expect(r.body.data.rows[0].ip_address).toMatch(/\.\*\*\*$/);
  });

  it('super_admin sees raw IPs', async () => {
    const r = await request(app).get('/api/v1/admin/audit-log')
      .set('Authorization', `Bearer ${superAdminToken}`).expect(200);
    expect(r.body.data.rows[0].ip_address).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
  });

  it('DPO reveal action audits itself', async () => {
    const action = await seedAdminAction({ ip_address: '203.0.113.42' });
    await request(app).post(`/api/v1/admin/audit-log/${action.id}/reveal-pii`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .set('X-CSRF-Token', csrfToken)
      .send({ fields: ['ip_address'] }).expect(200);

    const reveal = await db.selectFrom('admin_actions').selectAll()
      .where('action_type', '=', 'pii_reveal')
      .where('target_id', '=', action.id).executeTakeFirstOrThrow();
    expect(reveal.details).toMatchObject({ revealed_fields: ['ip_address'] });
  });
});
```

---

## Bug 969 — Marketing consent toggle not honored at backend

**File:** `packages/api/src/services/notifications/marketing.service.ts`

### Current state

User toggles "I want promotions" off in `notification-settings.tsx`. The mobile sends the patch. Server stores. **But** the marketing-blast worker doesn't query this preference — it sends to all users with `is_active=true`.

### Exact fix

```ts
// packages/api/src/services/notifications/marketing.service.ts
export async function sendMarketingPush(campaignId: string, audienceQuery: AudienceQuery) {
  const candidates = await db.selectFrom('users')
    .innerJoin('notification_preferences as np', 'np.user_id', 'users.id')
    .select(['users.id', 'users.email', 'users.phone'])
    .where('users.is_active', '=', true)
    .where('np.marketing_push_enabled', '=', true)   // ← Bug 969 fix
    .where('np.marketing_consent_acknowledged_at', 'is not', null)
    // additional audience filters from query...
    .execute();

  // Continue with sending
}

export async function sendMarketingSms(campaignId: string, audienceQuery: AudienceQuery) {
  const candidates = await db.selectFrom('users')
    .innerJoin('notification_preferences as np', 'np.user_id', 'users.id')
    .select(['users.id', 'users.phone'])
    .where('users.is_active', '=', true)
    .where('np.marketing_sms_enabled', '=', true)
    // Plus: must have consented to marketing SMS specifically + valid PH mobile
    .where('np.marketing_consent_acknowledged_at', 'is not', null)
    .where('users.phone', '~', '^\\+639\\d{9}$')
    .execute();
}

export async function sendMarketingEmail(campaignId: string, audienceQuery: AudienceQuery) {
  const candidates = await db.selectFrom('users')
    .innerJoin('notification_preferences as np', 'np.user_id', 'users.id')
    .select(['users.id', 'users.email'])
    .where('users.is_active', '=', true)
    .where('np.marketing_email_enabled', '=', true)
    .where('np.marketing_consent_acknowledged_at', 'is not', null)
    .where('users.email', 'is not', null)
    .execute();
}
```

Migration to add granular columns:

```sql
-- packages/api/migrations/079_notification_preferences_granular.sql
ALTER TABLE notification_preferences
  ADD COLUMN marketing_push_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN marketing_sms_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN marketing_email_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN marketing_consent_acknowledged_at TIMESTAMPTZ,
  ADD COLUMN marketing_consent_version INTEGER;

-- Backfill from old single boolean (if it existed)
UPDATE notification_preferences SET marketing_push_enabled = COALESCE(marketing_enabled, false);
-- Repeat for sms and email if respective old columns existed
```

### Test signature

```ts
describe('Marketing consent (Bug 969)', () => {
  it('does NOT send to user with marketing_push_enabled=false', async () => {
    const user = await seedUser({ marketingPushEnabled: false });
    const sent = await sendMarketingPush('campaign-1', { allUsers: true });
    expect(sent.find(s => s.userId === user.id)).toBeUndefined();
  });

  it('does NOT send to user without marketing_consent_acknowledged_at', async () => {
    const user = await seedUser({ marketingPushEnabled: true, marketingConsentAcknowledgedAt: null });
    const sent = await sendMarketingPush('campaign-1', { allUsers: true });
    expect(sent.find(s => s.userId === user.id)).toBeUndefined();
  });

  it('SENDS to user with both flags set', async () => {
    const user = await seedUser({ marketingPushEnabled: true, marketingConsentAcknowledgedAt: new Date() });
    const sent = await sendMarketingPush('campaign-1', { allUsers: true });
    expect(sent.find(s => s.userId === user.id)).toBeDefined();
  });
});
```

---

## Bug 1366 — Breach notification 72h SLA not surfaced

**File:** `apps/admin/src/pages/CompliancePage.tsx` (Breach Log tab) + new server endpoint

### Current state

Breach Log tab exists but no timer, no escalation. NPC requires notification within 72h of breach discovery (RA 10173 §38).

### Exact fix

**Step 1.** Migration `080_breach_log`:

```sql
-- packages/api/migrations/080_breach_log.sql
CREATE TABLE breach_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('unauthorized_access', 'data_loss', 'data_exposure', 'system_compromise', 'other')),
  scope TEXT NOT NULL,                       -- description of affected data
  affected_user_count INTEGER,
  occurred_at TIMESTAMPTZ NOT NULL,
  discovered_at TIMESTAMPTZ NOT NULL,
  npc_notified_at TIMESTAMPTZ,
  npc_reference TEXT,                        -- NPC-YYYY-XXXXXX format
  status TEXT NOT NULL CHECK (status IN ('investigating', 'mitigating', 'reported', 'closed')),
  reported_by UUID REFERENCES admin_users(id),
  remediation_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (discovered_at >= occurred_at)
);

-- Generated column: hours since discovery
-- (computed in app rather than as DB generated col for portability)

CREATE INDEX idx_breach_pending_npc ON breach_log(discovered_at) WHERE npc_notified_at IS NULL;
```

**Step 2.** Endpoint:

```ts
router.get('/admin/breach-log', requireDpoRole, async (req, res) => {
  const breaches = await db.selectFrom('breach_log').selectAll()
    .orderBy('discovered_at', 'desc').execute();

  const now = Date.now();
  const enriched = breaches.map(b => {
    const hoursElapsed = (now - b.discovered_at.getTime()) / 3_600_000;
    const sla72hExpired = b.npc_notified_at === null && hoursElapsed > 72;
    const sla72hRemainingHours = b.npc_notified_at === null ? Math.max(0, 72 - hoursElapsed) : null;
    return { ...b, sla72h_expired: sla72hExpired, sla72h_remaining_hours: sla72hRemainingHours };
  });

  res.json({ data: { breaches: enriched } });
});
```

**Step 3.** Admin Compliance page Breach Log tab (Part 2A section 22):

```tsx
// apps/admin/src/pages/CompliancePage.tsx — Breach Log tab
{breaches.map(b => (
  <BreachRow key={b.id}>
    <Type>{b.type}</Type>
    <Scope>{b.scope}</Scope>
    <Discovered>{formatRelative(b.discovered_at)}</Discovered>
    {b.npc_notified_at === null ? (
      b.sla72h_expired ? (
        <SlaBadge severity="critical">⚠ NPC SLA EXPIRED — notify immediately</SlaBadge>
      ) : (
        <SlaBadge severity="warning">{b.sla72h_remaining_hours.toFixed(1)}h to notify NPC</SlaBadge>
      )
    ) : (
      <Notified>NPC notified · ref {b.npc_reference}</Notified>
    )}
    <Actions>
      {b.npc_notified_at === null && <Button onClick={() => openNotifyDialog(b)}>Mark NPC notified</Button>}
    </Actions>
  </BreachRow>
))}
```

**Step 4.** Background cron alert: every hour, check for breaches with `npc_notified_at IS NULL AND discovered_at < now() - interval '60 hours'` — push to PagerDuty + Sentry alert. (Bug 1309 Prometheus integration from Dispatch 01 picks this up via custom counter.)

```ts
// packages/api/src/jobs/breach-sla-checker.ts
import { Counter } from 'prom-client';

const breachSlaWarningCount = new Counter({
  name: 'breach_sla_warning_total',
  help: 'Breaches approaching 72h NPC SLA',
});
const breachSlaExpiredCount = new Counter({
  name: 'breach_sla_expired_total',
  help: 'Breaches that exceeded 72h NPC SLA',
});

export async function checkBreachSlaTask() {
  const cutoff60h = new Date(Date.now() - 60 * 3_600_000);
  const cutoff72h = new Date(Date.now() - 72 * 3_600_000);

  const approachingSla = await db.selectFrom('breach_log').selectAll()
    .where('npc_notified_at', 'is', null)
    .where('discovered_at', '<', cutoff60h)
    .where('discovered_at', '>=', cutoff72h)
    .execute();

  const expiredSla = await db.selectFrom('breach_log').selectAll()
    .where('npc_notified_at', 'is', null)
    .where('discovered_at', '<', cutoff72h)
    .execute();

  for (const b of approachingSla) {
    breachSlaWarningCount.inc();
    await pagerduty.trigger({ severity: 'warning', summary: `Breach ${b.id} approaching 72h NPC SLA` });
  }
  for (const b of expiredSla) {
    breachSlaExpiredCount.inc();
    await pagerduty.trigger({ severity: 'critical', summary: `Breach ${b.id} EXCEEDED 72h NPC SLA` });
  }
}
```

Schedule via BullMQ recurring job or cron worker.

---

## Remaining 11 NPC compliance bugs (table format)

| Bug # | Summary | Fix |
|---|---|---|
| 75 | Customer activity feed shows raw IPs | Apply `maskPiiForRole` in customer detail activity tab |
| 76 | Same for activity feed user-agents | Same |
| 81 | Provider activity feed PII | Same |
| 153 | DSR PATCH may not dispatch all 4 service functions | Audit-grep — refactor as single transactional service.dispatchDsrAction(action, dsrId, params) |
| 158 | No consent_record written for IC agreement | Folded into Dispatch 07 Bug 37 fix (consent_records inserted in same transaction) |
| 162 | Identity verification 404 silently swallowed | Server returns 200 + status='pending'; never silent failure |
| 282 | No saved filters in admin pages | Implementation per Part 2A; new table `admin_user_preferences` |
| 287 | Churn analytics shows full phone | Apply `maskPiiForRole` in analytics endpoint |
| 311 | Audit log entity_id raw UUID | Mobile/admin client links UUID → entity detail page |
| 331 | Audit log raw IP/UA | Folded into Bug 66 fix |
| 342 | Customer email plain in admin list | Apply `maskPiiForRole` |
| 343 | Customer phone plain in admin list | Same |
| 350 | Provider phone/email plain in admin list | Same |
| 399 | publishConsentVersion no changeSummary minimum | `z.string().min(30)` |

For each: reference Bug 66 fix's `maskPiiForRole` helper or Bug 397 fix's strict Zod schema enforcement. The patterns are uniform.

---

## Documentation updates

### `LAUNCH-LIMITATIONS.md` — add §24

```markdown
## §24 — NPC RA 10173 compliance posture (Phase 14 Dispatch 08)

The platform meets the operational compliance bar for v1.0 launch:

- All consent actions recorded in `consent_records` with version, IP, UA, signed artifact (where applicable). CHECK constraint on consent_type prevents typos.
- All DSR transitions require reasons ≥ 30 chars; rejection and NPC escalation enforce specific format requirements (NPC reference matches NPC-YYYY-XXXXXX).
- Marketing communications honor per-channel opt-in flags (push/SMS/email separately) AND require `marketing_consent_acknowledged_at IS NOT NULL`.
- Breach log surfaces 72h NPC notification SLA prominently in admin Compliance page; cron job alerts via PagerDuty when SLA approaches or expires.
- Audit log PII (IPs, user-agents, embedded customer data) masked for non-super-admin roles. Reveal action audit-logged.
- Audit log CSV exports themselves audit-logged.
- DPO-only endpoints (`searchConsent`, `data-protection-log`) gate on role.

**Outstanding (post-launch):**
- NPC DPO registration: pending administrative submission. v1.0 ships with internal DPO designation; formal NPC registration in progress.
- Annual privacy impact assessment (PIA): scheduled for Q2.
- Quarterly consent audit job (verifies cohort still consents): v1.1.
```

### `docs/SECURITY-POSTURE.md`

Add SEC-009 documenting the PII masking system, SEC-010 documenting the 72h breach SLA monitoring.

---

## Dispatch 08 closeout

**Bugs claimed fixed (18):**
- Bug 66, 75, 76, 81, 311, 331, 342, 343, 350 — PII masking applied uniformly
- Bug 117 — consent_records CHECK constraint
- Bug 153 — DSR action dispatch consolidated
- Bug 158 — consent_records written for IC agreement (folded into Dispatch 07)
- Bug 162 — identity verification status surfaces explicitly
- Bug 282 — admin saved filters table
- Bug 287 — churn analytics PII masked
- Bug 397, 398 — DSR reasons enforced
- Bug 399 — publishConsentVersion minimum
- Bug 401 — audit CSV export self-audits
- Bug 402 — searchConsent DPO-only
- Bug 969 — marketing opt-out honored
- Bug 1366 — 72h breach SLA surfaced

**Files added:**
- `packages/api/src/utils/pii-mask.ts`
- `packages/api/src/middleware/require-dpo.ts`
- `packages/api/src/jobs/breach-sla-checker.ts`
- 4 new migrations (078, 079, 080, 081)
- ~12 test files
- Admin Compliance page Breach Log tab implementation

**Files modified:**
- All admin endpoints returning audit/profile/customer/provider data: PII masking applied
- 5 service files in `packages/api/src/services/notifications/`
- 4 admin pages affected by PII masking (AuditLogPage, ProviderDetailPage, CustomerDetailPage, AnalyticsPage churn tab)
- Various validators (DSR, consent, breach)

**Documentation updates:**
- `LAUNCH-LIMITATIONS.md` §24 NPC compliance posture
- `docs/SECURITY-POSTURE.md` SEC-009, SEC-010
- `.ai-coder/governance/NPC-COMPLIANCE-CHECKLIST.md` (new — operational checklist for ongoing compliance)

**Decision points for Ken:**
- **NPC DPO formal registration is administrative, not engineering.** v1.0 ships with internal DPO designation but the NPC formal registration paperwork should be submitted before public launch. This is a non-engineering blocker — assign to your operations or legal lead.
- **Marketing opt-out granular flags require user education.** Existing users with the old single `marketing_enabled` boolean should receive a one-time prompt on next login to confirm their preferences via the new per-channel toggles. Add a banner / modal in mobile profile screen for v1.0.x.
- **Breach SLA cron requires PagerDuty (or alternative) integration.** Without on-call rotation, a 3am breach alert goes nowhere. Set up at least: super_admin email + your personal SMS as fallback.

---

# What's next: Dispatches 09 and 10

This installment covered Dispatches 07 (provider job execution trust, 12 bugs) and 08 (NPC compliance + DSR, 18 bugs).

Coming next:

- **Dispatch 09 — PII masking sweep (admin)**: 21 bugs spanning the full admin surface. Most are mechanical applications of the `maskPiiForRole` helper from Bug 66, but each has its own list view + detail page reveal action. Provider list, customer list, business contacts list, support tickets, dispute queue, etc. Each: server-side endpoint masks by default, reveal endpoint per field with audit, admin UI shows reveal icons gated by role.

- **Dispatch 10 — Provider onboarding v1.0 path**: 14 bugs covering the 10-screen onboarding flow + admin manual approval workflow. Key decisions: how to handle background-check status when no vendor is contracted (manual admin approval), how to handle selfie liveness without vendor (hold for human review), what NBI document quality bar to enforce (resolution + readability). Also wires the approval workflow: when admin clicks "Approve" on ProviderDetailPage, the provider receives push notification + their app transitions from `review-pending.tsx` to `(provider-tabs)/dashboard`.

After 09/10:
- **Dispatches 11 + 12**: admin dispatch console wire-up (9 bugs, mostly Bug 272 chain — the reassign / cancel / message buttons currently are window.alert stubs) + mobile customer screen polish (86 bugs across 43 customer screens, mostly per-screen UX fixes from Part 2B audit findings).
- **Dispatch 13**: mobile provider screen polish (64 bugs across 39 provider screens).
- **Dispatch 14**: final smoke + production cutover (12 operational launch blockers, mostly non-engineering tasks: NPC DPO registration, BIR invoice series, DTI/Mayor's permit, insurance procurement deferral confirmation, hCaptcha contract, Sentry production DSN, PayMongo merchant onboarding, S3 BIR bucket Object Lock, Postgres PITR, DNS+TLS, Admin SSO).

Then **Part 4** (Gate Hardening formalized) and **Part 5** (Ken Handbook).

Say continue for Dispatches 09 and 10.
