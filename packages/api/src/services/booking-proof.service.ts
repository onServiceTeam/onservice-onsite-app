/**
 * Read-only proof-to-close summary for one booking.
 *
 * This service deliberately derives readiness from canonical records. It does
 * not persist a "ready" flag, mutate booking state, or move money. Admin is the
 * first consumer; customer/provider projections can reuse this read model with
 * role-specific redaction.
 */

import { platformConfig } from '../config/platform.config';
import { createAppError } from '../middleware/error.middleware';
import { db } from '../models/db';

export type ProofActorRole = 'customer' | 'provider' | 'admin' | 'unknown';

export interface BookingProofSummary {
  booking: {
    id: string;
    status: string;
    bookingType: string;
    description: string;
    categoryName: string | null;
    subcategoryName: string | null;
    scheduledAt: string | null;
    workStartedAt: string | null;
    workCompletedAt: string | null;
    completedAt: string | null;
    confirmedAt: string | null;
    completionNotes: string | null;
  };
  scope: {
    acceptedQuote: null | {
      id: string;
      description: string;
      notes: string;
      quotedPrice: number;
      acceptedAt: string;
      lineItems: Array<{
        id: string;
        description: string;
        itemType: string;
        quantity: number;
        unit: string;
        unitPrice: number;
        lineTotal: number;
      }>;
    };
  };
  readiness: {
    stage:
      | 'pre_work'
      | 'work_in_progress'
      | 'ready_for_provider_completion'
      | 'provider_submitted'
      | 'customer_confirmed'
      | 'disputed'
      | 'cancelled';
    readyForProviderCompletion: boolean;
    minimumTimeOnSiteMinutes: number;
    afterPhotosRequired: number;
    blockers: Array<{ code: string; message: string }>;
    qualityFlags: Array<{ code: string; message: string }>;
  };
  checklist: null | {
    id: string;
    templateVersion: number;
    shownAt: string;
    totalItems: number;
    requiredItems: number;
    completedRequiredItems: number;
    complete: boolean;
    items: Array<{
      id: string;
      sectionTitle: string | null;
      title: string;
      description: string | null;
      required: boolean;
      photoRequired: boolean;
      completed: boolean;
      completedAt: string | null;
      photoId: string | null;
      notes: string | null;
    }>;
  };
  photos: Array<{
    id: string;
    url: string;
    photoType: string;
    uploadedByUserId: string;
    uploadedByRole: ProofActorRole;
    uploaderName: string | null;
    uploadedAt: string;
    source: 'legacy' | 'canonical';
    mimeType: string | null;
    originalSizeBytes: number | null;
    storedSizeBytes: number | null;
  }>;
  photoCounts: Record<string, number>;
  signatures: {
    identityCaveat: string;
    records: Array<{
      id: string;
      signatureType: string;
      signedByUserId: string;
      signedByRole: ProofActorRole;
      signerName: string | null;
      fullNameTyped: string | null;
      signedAt: string;
      url: string;
      attribution:
        | 'account_attributed'
        | 'provider_attributed_customer_acceptance'
        | 'recorded_actor_only';
    }>;
  };
  changeOrders: Array<{
    id: string;
    description: string;
    additionalAmount: number;
    status: string;
    photos: string[];
    customerRespondedAt: string | null;
    createdAt: string;
  }>;
  communications: {
    chatMessageCount: number;
    supportTickets: Array<{
      id: string;
      ticketNumber: string;
      subject: string;
      status: string;
      priority: string;
      createdAt: string;
    }>;
  };
  dispute: null | {
    id: string;
    type: string;
    status: string;
    createdAt: string;
    resolvedAt: string | null;
  };
  unavailable: Array<{ key: string; label: string; reason: string }>;
}

interface BookingRow {
  id: string;
  status: string;
  booking_type: string;
  description: string;
  category_name: string | null;
  subcategory_name: string | null;
  customer_id: string;
  provider_user_id: string | null;
  scheduled_at: Date | null;
  work_started_at: Date | null;
  work_completed_at: Date | null;
  completed_at: Date | null;
  confirmed_at: Date | null;
  completion_notes: string | null;
  updated_at: Date;
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function normalizeActorRole(
  recordedRole: string | null,
  accountRole: string | null,
  uploaderId: string,
  booking: BookingRow,
): ProofActorRole {
  if (recordedRole === 'admin') return 'admin';
  if (recordedRole === 'provider') return 'provider';
  if (recordedRole === 'customer') return 'customer';
  if (uploaderId === booking.customer_id) return 'customer';
  if (uploaderId === booking.provider_user_id) return 'provider';
  if (accountRole === 'admin' || accountRole === 'super_admin') return 'admin';
  if (accountRole === 'provider' || accountRole === 'provider_staff') return 'provider';
  if (accountRole === 'customer') return 'customer';
  return 'unknown';
}

function readinessStage(status: string, ready: boolean): BookingProofSummary['readiness']['stage'] {
  if (status.startsWith('cancelled_')) return 'cancelled';
  if (status === 'disputed') return 'disputed';
  if (['confirmed', 'resolved', 'payout_ready', 'paid_out'].includes(status)) {
    return 'customer_confirmed';
  }
  if (status === 'completed_by_provider') return 'provider_submitted';
  if (status === 'in_progress' && ready) return 'ready_for_provider_completion';
  if (status === 'in_progress') return 'work_in_progress';
  return 'pre_work';
}

export async function getBookingProofSummary(bookingId: string): Promise<BookingProofSummary> {
  const bookingResult = await db.query<BookingRow>(
    `SELECT b.id, b.status, b.booking_type, b.description,
            sc.name AS category_name, ssc.name AS subcategory_name,
            b.customer_id, p.user_id AS provider_user_id,
            b.scheduled_at, b.work_started_at, b.work_completed_at,
            b.completed_at, b.confirmed_at, b.completion_notes, b.updated_at
       FROM bookings b
       LEFT JOIN service_categories sc ON sc.id = b.category_id
       LEFT JOIN service_subcategories ssc ON ssc.id = b.subcategory_id
       LEFT JOIN providers p ON p.id = b.provider_id
      WHERE b.id = $1`,
    [bookingId],
  );
  const booking = bookingResult.rows[0];
  if (!booking) throw createAppError('Booking not found.', 404);

  const [
    photoResult,
    checklistResult,
    signatureResult,
    changeOrderResult,
    supportResult,
    disputeResult,
    chatResult,
    quoteResult,
  ] = await Promise.all([
    db.query<{
      id: string;
      photo_url: string;
      photo_type: string;
      uploaded_by: string;
      recorded_role: string | null;
      account_role: string | null;
      first_name: string | null;
      last_name: string | null;
      created_at: Date;
      source: 'legacy' | 'canonical';
      mime_type: string | null;
      original_size_bytes: number | null;
      stored_size_bytes: number | null;
    }>(
      `SELECT bi.id, bi.image_url AS photo_url, bi.image_type AS photo_type,
              bi.uploaded_by, NULL::text AS recorded_role, u.role AS account_role,
              u.first_name, u.last_name, bi.created_at,
              'legacy'::text AS source, NULL::text AS mime_type,
              NULL::integer AS original_size_bytes, NULL::integer AS stored_size_bytes
         FROM booking_images bi
         LEFT JOIN users u ON u.id = bi.uploaded_by
        WHERE bi.booking_id = $1
       UNION ALL
       SELECT bp.id, COALESCE(bp.storage_url, bp.storage_key) AS photo_url,
              bp.photo_type, bp.uploaded_by, bp.uploaded_by_role AS recorded_role,
              u.role AS account_role, u.first_name, u.last_name, bp.uploaded_at AS created_at,
              'canonical'::text AS source, bp.mime_type,
              bp.original_size_bytes, bp.stored_size_bytes
         FROM booking_photos bp
         LEFT JOIN users u ON u.id = bp.uploaded_by
        WHERE bp.booking_id = $1 AND bp.deleted_at IS NULL
       ORDER BY created_at ASC`,
      [bookingId],
    ),
    db.query<{
      checklist_id: string;
      template_version: number;
      shown_at: Date;
      item_id: string | null;
      section_title: string | null;
      title_snapshot: string | null;
      description_snapshot: string | null;
      photo_required: boolean | null;
      is_required: boolean | null;
      is_completed: boolean | null;
      completed_at: Date | null;
      photo_id: string | null;
      notes: string | null;
    }>(
      `SELECT bc.id AS checklist_id, bc.template_version, bc.shown_at,
              bi.id AS item_id, ts.title AS section_title,
              bi.title_snapshot, bi.description_snapshot, bi.photo_required,
              bi.is_required, bi.is_completed, bi.completed_at, bi.photo_id, bi.notes
         FROM booking_checklists bc
         LEFT JOIN booking_checklist_items bi ON bi.booking_checklist_id = bc.id
         LEFT JOIN checklist_template_items ti ON ti.id = bi.template_item_id
         LEFT JOIN checklist_template_sections ts ON ts.id = ti.section_id
        WHERE bc.booking_id = $1
        ORDER BY ts.display_order ASC NULLS LAST, ti.display_order ASC NULLS LAST`,
      [bookingId],
    ),
    db.query<{
      id: string;
      signature_type: string;
      signed_by: string;
      signed_role: ProofActorRole;
      first_name: string | null;
      last_name: string | null;
      full_name_typed: string | null;
      signed_at: Date;
      signature_url: string;
    }>(
      `SELECT bs.id, bs.signature_type, bs.signed_by, bs.signed_role,
              u.first_name, u.last_name, bs.full_name_typed, bs.signed_at,
              COALESCE(bs.storage_url, bs.storage_key) AS signature_url
         FROM booking_signatures bs
         LEFT JOIN users u ON u.id = bs.signed_by
        WHERE bs.booking_id = $1 AND bs.deleted_at IS NULL
        ORDER BY bs.signed_at ASC`,
      [bookingId],
    ),
    db.query<{
      id: string;
      description: string;
      additional_amount: string | number;
      status: string;
      photos: string[] | null;
      customer_responded_at: Date | null;
      created_at: Date;
    }>(
      `SELECT id, description, additional_amount, status, photos,
              customer_responded_at, created_at
         FROM change_orders
        WHERE booking_id = $1
        ORDER BY created_at ASC`,
      [bookingId],
    ),
    db.query<{
      id: string;
      ticket_number: string;
      subject: string;
      status: string;
      priority: string;
      created_at: Date;
    }>(
      `SELECT id, ticket_number, subject, status, priority, created_at
         FROM support_tickets
        WHERE booking_id = $1
        ORDER BY created_at DESC`,
      [bookingId],
    ),
    db.query<{
      id: string;
      type: string;
      status: string;
      created_at: Date;
      resolved_at: Date | null;
    }>(
      `SELECT id, type, status, created_at, resolved_at
         FROM disputes
        WHERE booking_id = $1
        ORDER BY created_at DESC
        LIMIT 1`,
      [bookingId],
    ),
    db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
        WHERE c.booking_id = $1`,
      [bookingId],
    ),
    db.query<{
      quote_id: string;
      description: string;
      notes: string;
      quoted_price: string | number;
      accepted_at: Date;
      line_item_id: string | null;
      line_description: string | null;
      item_type: string | null;
      quantity: string | number | null;
      unit: string | null;
      unit_price: string | number | null;
      line_total: string | number | null;
    }>(
      `SELECT q.id AS quote_id, q.description, COALESCE(q.notes, '') AS notes,
              q.quoted_price, COALESCE(q.updated_at, q.created_at) AS accepted_at,
              li.id AS line_item_id, li.description AS line_description,
              li.item_type, li.quantity, li.unit, li.unit_price, li.line_total
         FROM booking_quotes q
         LEFT JOIN quote_line_items li ON li.quote_id = q.id
        WHERE q.booking_id = $1 AND (q.is_accepted = TRUE OR q.status = 'accepted')
        ORDER BY q.created_at DESC, li.created_at ASC`,
      [bookingId],
    ),
  ]);

  const photos: BookingProofSummary['photos'] = photoResult.rows.map((row) => {
    const role = normalizeActorRole(row.recorded_role, row.account_role, row.uploaded_by, booking);
    const uploaderName = `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || null;
    return {
      id: row.id,
      url: row.photo_url,
      photoType: row.photo_type,
      uploadedByUserId: row.uploaded_by,
      uploadedByRole: role,
      uploaderName,
      uploadedAt: row.created_at.toISOString(),
      source: row.source,
      mimeType: row.mime_type,
      originalSizeBytes: row.original_size_bytes,
      storedSizeBytes: row.stored_size_bytes,
    };
  });

  const photoCounts = photos.reduce<Record<string, number>>((counts, photo) => {
    counts[photo.photoType] = (counts[photo.photoType] ?? 0) + 1;
    return counts;
  }, {});
  const providerAfterPhotoCount = photos.filter(
    (photo) => photo.source === 'canonical' && photo.photoType === 'after' && photo.uploadedByRole === 'provider',
  ).length;

  const checklistRows = checklistResult.rows;
  const checklistHeader = checklistRows[0];
  const checklistItems: NonNullable<BookingProofSummary['checklist']>['items'] = checklistRows
    .filter((row) => row.item_id !== null)
    .map((row) => ({
      id: row.item_id!,
      sectionTitle: row.section_title,
      title: row.title_snapshot ?? 'Untitled checklist item',
      description: row.description_snapshot,
      required: row.is_required === true,
      photoRequired: row.photo_required === true,
      completed: row.is_completed === true,
      completedAt: iso(row.completed_at),
      photoId: row.photo_id,
      notes: row.notes,
    }));
  const requiredItems = checklistItems.filter((item) => item.required);
  const completedRequiredItems = requiredItems.filter((item) => item.completed);
  const checklist: BookingProofSummary['checklist'] = checklistHeader
    ? {
        id: checklistHeader.checklist_id,
        templateVersion: checklistHeader.template_version,
        shownAt: checklistHeader.shown_at.toISOString(),
        totalItems: checklistItems.length,
        requiredItems: requiredItems.length,
        completedRequiredItems: completedRequiredItems.length,
        complete: requiredItems.length === 0 || completedRequiredItems.length === requiredItems.length,
        items: checklistItems,
      }
    : null;

  const blockers: BookingProofSummary['readiness']['blockers'] = [];
  const qualityFlags: BookingProofSummary['readiness']['qualityFlags'] = [];
  if (!checklist) {
    blockers.push({
      code: 'CHECKLIST_NOT_OPENED',
      message: 'The provider has not opened the booking checklist.',
    });
  } else if (!checklist.complete) {
    blockers.push({
      code: 'CHECKLIST_INCOMPLETE',
      message: `${checklist.completedRequiredItems}/${checklist.requiredItems} required checklist items are complete.`,
    });
  }
  if (providerAfterPhotoCount < 2) {
    blockers.push({
      code: 'PROVIDER_AFTER_PHOTOS_MISSING',
      message: `${providerAfterPhotoCount}/2 provider-attributed after photos are recorded.`,
    });
  }

  const alreadySubmitted = [
    'completed_by_provider', 'confirmed', 'disputed', 'resolved', 'payout_ready', 'paid_out',
  ].includes(booking.status);
  if (!alreadySubmitted) {
    if (booking.status !== 'in_progress') {
      blockers.push({
        code: 'WORK_NOT_IN_PROGRESS',
        message: 'The booking must be in progress before the provider can submit completion.',
      });
    } else {
      const start = booking.work_started_at ?? booking.updated_at;
      const elapsedMs = Date.now() - start.getTime();
      const minimumMs = platformConfig.minimumTimeOnSiteMinutes * 60_000;
      if (elapsedMs < minimumMs) {
        blockers.push({
          code: 'MINIMUM_TIME_ON_SITE',
          message: `${Math.ceil((minimumMs - elapsedMs) / 60_000)} minute(s) remain in the minimum on-site period.`,
        });
      }
      if (!booking.work_started_at) {
        qualityFlags.push({
          code: 'LEGACY_WORK_START_FALLBACK',
          message: 'This legacy in-progress booking has no server work-start marker; its updated time is the temporary fallback.',
        });
      }
    }
  } else if (!booking.work_started_at) {
    qualityFlags.push({
      code: 'WORK_START_NOT_RECORDED',
      message: 'This historical booking has no server-recorded work-start time.',
    });
  }

  const openSupportCount = supportResult.rows.filter(
    (ticket) => !['resolved', 'closed'].includes(ticket.status),
  ).length;
  if (openSupportCount > 0) {
    qualityFlags.push({
      code: 'OPEN_SUPPORT_CASES',
      message: `${openSupportCount} support case(s) remain open for this booking.`,
    });
  }
  const disputeRow = disputeResult.rows[0];
  if (disputeRow && disputeRow.status !== 'resolved') {
    qualityFlags.push({
      code: 'OPEN_DISPUTE',
      message: 'A dispute remains open for this booking.',
    });
  }

  const signatureRecords: BookingProofSummary['signatures']['records'] = signatureResult.rows.map((row) => {
    let attribution: BookingProofSummary['signatures']['records'][number]['attribution'] = 'recorded_actor_only';
    if (row.signature_type === 'customer_acceptance' && row.signed_role === 'provider') {
      attribution = 'provider_attributed_customer_acceptance';
    } else if (row.signed_role === 'customer') {
      attribution = 'account_attributed';
    }
    return {
      id: row.id,
      signatureType: row.signature_type,
      signedByUserId: row.signed_by,
      signedByRole: row.signed_role,
      signerName: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || null,
      fullNameTyped: row.full_name_typed,
      signedAt: row.signed_at.toISOString(),
      url: row.signature_url,
      attribution,
    };
  });

  if (signatureRecords.some((record) => record.attribution === 'provider_attributed_customer_acceptance')) {
    qualityFlags.push({
      code: 'CUSTOMER_ACCEPTANCE_IDENTITY_UNVERIFIED',
      message: 'A customer-acceptance image is attributed to a provider-side account and is not verified customer approval.',
    });
  }

  const acceptedQuoteRow = quoteResult.rows[0];
  const acceptedQuote: BookingProofSummary['scope']['acceptedQuote'] = acceptedQuoteRow
    ? {
        id: acceptedQuoteRow.quote_id,
        description: acceptedQuoteRow.description,
        notes: acceptedQuoteRow.notes,
        quotedPrice: Number(acceptedQuoteRow.quoted_price),
        acceptedAt: acceptedQuoteRow.accepted_at.toISOString(),
        lineItems: quoteResult.rows
          .filter((row) => row.quote_id === acceptedQuoteRow.quote_id && row.line_item_id !== null)
          .map((row) => ({
            id: row.line_item_id!,
            description: row.line_description ?? '',
            itemType: row.item_type ?? 'other',
            quantity: Number(row.quantity ?? 0),
            unit: row.unit ?? 'unit',
            unitPrice: Number(row.unit_price ?? 0),
            lineTotal: Number(row.line_total ?? 0),
          })),
      }
    : null;

  const readyForProviderCompletion = booking.status === 'in_progress' && blockers.length === 0;

  return {
    booking: {
      id: booking.id,
      status: booking.status,
      bookingType: booking.booking_type,
      description: booking.description,
      categoryName: booking.category_name,
      subcategoryName: booking.subcategory_name,
      scheduledAt: iso(booking.scheduled_at),
      workStartedAt: iso(booking.work_started_at),
      workCompletedAt: iso(booking.work_completed_at),
      completedAt: iso(booking.completed_at),
      confirmedAt: iso(booking.confirmed_at),
      completionNotes: booking.completion_notes,
    },
    scope: { acceptedQuote },
    readiness: {
      stage: readinessStage(booking.status, readyForProviderCompletion),
      readyForProviderCompletion,
      minimumTimeOnSiteMinutes: platformConfig.minimumTimeOnSiteMinutes,
      afterPhotosRequired: 2,
      blockers,
      qualityFlags,
    },
    checklist,
    photos,
    photoCounts,
    signatures: {
      identityCaveat:
        'Signature files show the authenticated uploader and capture time. They do not independently verify the identity of the person whose mark appears; provider-attributed customer acceptance must not be treated as customer approval while E19 is open.',
      records: signatureRecords,
    },
    changeOrders: changeOrderResult.rows.map((row) => ({
      id: row.id,
      description: row.description,
      additionalAmount: Number(row.additional_amount),
      status: row.status,
      photos: row.photos ?? [],
      customerRespondedAt: iso(row.customer_responded_at),
      createdAt: row.created_at.toISOString(),
    })),
    communications: {
      chatMessageCount: Number(chatResult.rows[0]?.count ?? 0),
      supportTickets: supportResult.rows.map((row) => ({
        id: row.id,
        ticketNumber: row.ticket_number,
        subject: row.subject,
        status: row.status,
        priority: row.priority,
        createdAt: row.created_at.toISOString(),
      })),
    },
    dispute: disputeRow
      ? {
          id: disputeRow.id,
          type: disputeRow.type,
          status: disputeRow.status,
          createdAt: disputeRow.created_at.toISOString(),
          resolvedAt: iso(disputeRow.resolved_at),
        }
      : null,
    unavailable: [
      {
        key: 'gps_check_ins',
        label: 'Visit GPS check-ins',
        reason: 'Arrival location is validated during the status change, but the current schema does not retain a visit-level GPS check-in/out record.',
      },
      {
        key: 'job_receipts',
        label: 'Job receipts and readings',
        reason: 'The current job record has no structured materials-receipt, equipment-reading, model, or serial-number evidence type.',
      },
      {
        key: 'proof_package',
        label: 'Closeout proof package',
        reason: 'A versioned customer/provider proof package and verification manifest are not implemented yet.',
      },
    ],
  };
}

/**
 * Participant-safe projection of the shared record. Support-ticket subjects
 * can contain party-private or internal context, and signature files are held
 * behind E19 until the acceptance actor model is corrected. The customer,
 * provider owner, and assigned staff still receive the same derived scope,
 * checklist, photo provenance, completion blockers, changes, and dispute state.
 */
export function projectProofSummaryForParticipant(
  summary: BookingProofSummary,
): BookingProofSummary {
  return {
    ...summary,
    photos: summary.photos.map((photo) => ({
      ...photo,
      uploadedByUserId: '',
      uploaderName: photo.uploadedByRole === 'admin' ? 'onService support' : photo.uploaderName,
    })),
    communications: {
      ...summary.communications,
      supportTickets: [],
    },
    signatures: {
      ...summary.signatures,
      records: summary.signatures.records.map((record) => ({
        ...record,
        signedByUserId: '',
        url: '',
        fullNameTyped: null,
      })),
    },
  };
}
