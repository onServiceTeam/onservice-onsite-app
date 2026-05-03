/**
 * Phase 14 Dispatch 07 — server-driven checklist service.
 *
 * Closes Bug 460 (checklist hardcoded for cleaning) + Bug 463 (server has
 * no record the checklist was even shown).
 *
 * Provider opens a job → mobile fetches getChecklistForBooking → if no
 * booking_checklist exists yet, this service creates one by snapshotting
 * the active template for the booking's category. Provider toggles items
 * via toggleChecklistItem; the service validates photo_required flags and
 * persists completion state.
 */

import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';

export interface ChecklistItem {
  id: string;
  title: string;
  description: string | null;
  photoRequired: boolean;
  isRequired: boolean;
  isCompleted: boolean;
  completedAt: string | null;
  photoId: string | null;
  notes: string | null;
}

export interface ChecklistSection {
  id: string;
  title: string;
  displayOrder: number;
  items: ChecklistItem[];
}

export interface BookingChecklist {
  bookingChecklistId: string;
  templateId: string;
  templateVersion: number;
  shownAt: string;
  sections: ChecklistSection[];
}

interface BookingRow {
  id: string;
  category_id: string;
  provider_user_id: string | null;
  customer_id: string;
  status: string;
}

async function loadBookingForActor(
  bookingId: string,
  userId: string,
  role: 'customer' | 'provider' | 'admin',
): Promise<BookingRow> {
  const result = await db.query<BookingRow>(
    `SELECT b.id,
            sub.category_id,
            p.user_id   AS provider_user_id,
            b.customer_id,
            b.status
       FROM bookings b
       LEFT JOIN service_subcategories sub ON sub.id = b.subcategory_id
       LEFT JOIN providers p ON p.id = b.provider_id
      WHERE b.id = $1`,
    [bookingId],
  );
  const row = result.rows[0];
  if (!row) throw createAppError('Booking not found.', 404);

  if (role === 'admin') return row;
  if (role === 'customer' && row.customer_id !== userId) {
    throw createAppError('You do not have access to this booking.', 403);
  }
  if (role === 'provider' && row.provider_user_id !== userId) {
    throw createAppError('You do not have access to this booking.', 403);
  }
  return row;
}

/**
 * Get (or create) the booking_checklist for a booking. Provider's first
 * call creates the row by snapshotting the active template for the
 * booking's category; subsequent calls return the existing instance.
 */
export async function getChecklistForBooking(
  bookingId: string,
  userId: string,
  role: 'customer' | 'provider' | 'admin',
): Promise<BookingChecklist> {
  const booking = await loadBookingForActor(bookingId, userId, role);

  // Look up existing checklist.
  const existing = await db.query<{
    id: string;
    template_id: string;
    template_version: number;
    shown_at: Date;
  }>(
    `SELECT id, template_id, template_version, shown_at
       FROM booking_checklists
      WHERE booking_id = $1`,
    [bookingId],
  );

  let checklist = existing.rows[0];

  if (!checklist) {
    // Customers cannot create the checklist — only the provider's first
    // open creates it. (Admins can also create for support flows.)
    if (role === 'customer') {
      throw createAppError('Checklist has not been created yet — provider must open the job first.', 404);
    }

    checklist = await db.transaction(async (client) => {
      // Re-check inside the transaction to guard against race conditions.
      const inTx = await client.query<{ id: string; template_id: string; template_version: number; shown_at: Date }>(
        `SELECT id, template_id, template_version, shown_at FROM booking_checklists WHERE booking_id = $1 FOR UPDATE`,
        [bookingId],
      );
      if (inTx.rows[0]) return inTx.rows[0];

      // Find active template for the booking's category.
      let template = await client.query<{ id: string; version: number }>(
        `SELECT id, version FROM checklist_templates
          WHERE category_id = $1 AND is_active = TRUE
          ORDER BY version DESC LIMIT 1`,
        [booking.category_id],
      );

      // BUG-PHASE21-02 fix: pre-fix this threw 500 ("No active checklist
      // template for this service category"), permanently blocking the
      // provider from completing the booking. Production seed has zero
      // templates; the platform was effectively launch-broken.
      //
      // Post-fix: lazy-create an empty default template (zero sections,
      // zero items) for this category. Combined with BUG-PHASE21-03's
      // fix to treat 0/0 required items as the success case, the
      // provider can now complete the booking even when admin hasn't
      // configured a category-specific template. The empty template is
      // marked is_active=TRUE so subsequent bookings in the same
      // category reuse it (no duplication). Admin can later replace it
      // by creating a richer template (admin path: bumps version + sets
      // old version is_active=FALSE).
      if (template.rows.length === 0) {
        logger.warn('checklist_template_missing_lazy_create', {
          categoryId: booking.category_id,
          bookingId,
          note: 'No category template seeded; creating empty placeholder. Admin should replace with a real template.',
        });
        // Insert an empty template (zero sections/items). Even if two
        // concurrent bookings race on this for the same category, we end
        // up with at most one extra row — both are is_active=TRUE, the
        // SELECT below picks the latest version. Not a correctness issue.
        template = await client.query<{ id: string; version: number }>(
          `INSERT INTO checklist_templates (category_id, version, is_active)
           VALUES ($1, 1, TRUE)
           RETURNING id, version`,
          [booking.category_id],
        );
        if (template.rows.length === 0) {
          throw createAppError(
            'Could not create checklist template. Admin support needed.',
            500,
          );
        }
      }
      const tpl = template.rows[0]!;

      const newChecklist = await client.query<{ id: string; template_id: string; template_version: number; shown_at: Date }>(
        `INSERT INTO booking_checklists (booking_id, template_id, template_version)
         VALUES ($1, $2, $3)
         RETURNING id, template_id, template_version, shown_at`,
        [bookingId, tpl.id, tpl.version],
      );
      const created = newChecklist.rows[0];
      if (!created) throw createAppError('Failed to create booking_checklist.', 500);

      // Snapshot all items into booking_checklist_items.
      const items = await client.query<{
        item_id: string;
        title: string;
        description: string | null;
        photo_required: boolean;
        is_required: boolean;
      }>(
        `SELECT i.id AS item_id, i.title, i.description, i.photo_required, i.is_required
           FROM checklist_template_items i
           JOIN checklist_template_sections s ON s.id = i.section_id
          WHERE s.template_id = $1
          ORDER BY s.display_order, i.display_order`,
        [tpl.id],
      );

      // MED-N101 fix — single multi-row INSERT instead of N round-trips.
      // Pre-fix: 50-item template = 50 sequential INSERTs inside the
      // trx (~500ms latency on the provider's first checklist-open).
      // Post-fix: one INSERT carrying all rows (~10ms regardless of
      // template size).
      if (items.rows.length > 0) {
        const params: unknown[] = [];
        const tuples: string[] = [];
        let paramIdx = 1;
        for (const item of items.rows) {
          tuples.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5})`);
          params.push(
            created.id,
            item.item_id,
            item.title,
            item.description,
            item.photo_required,
            item.is_required,
          );
          paramIdx += 6;
        }
        await client.query(
          `INSERT INTO booking_checklist_items
             (booking_checklist_id, template_item_id, title_snapshot,
              description_snapshot, photo_required, is_required)
           VALUES ${tuples.join(', ')}`,
          params,
        );
      }

      logger.info('booking_checklist created', {
        bookingId,
        bookingChecklistId: created.id,
        templateId: tpl.id,
        templateVersion: tpl.version,
        itemCount: items.rows.length,
      });

      return created;
    });
  }

  // Assemble sections + items for response.
  const sections = await db.query<{
    section_id: string;
    section_title: string;
    section_order: number;
    item_id: string;
    title: string;
    description: string | null;
    photo_required: boolean;
    is_required: boolean;
    is_completed: boolean;
    completed_at: Date | null;
    photo_id: string | null;
    notes: string | null;
  }>(
    `SELECT s.id    AS section_id,
            s.title AS section_title,
            s.display_order AS section_order,
            bi.id AS item_id,
            bi.title_snapshot AS title,
            bi.description_snapshot AS description,
            bi.photo_required,
            bi.is_required,
            bi.is_completed,
            bi.completed_at,
            bi.photo_id,
            bi.notes
       FROM booking_checklist_items bi
       JOIN checklist_template_items i ON i.id = bi.template_item_id
       JOIN checklist_template_sections s ON s.id = i.section_id
      WHERE bi.booking_checklist_id = $1
      ORDER BY s.display_order, i.display_order`,
    [checklist.id],
  );

  const grouped = new Map<string, ChecklistSection>();
  for (const row of sections.rows) {
    let section = grouped.get(row.section_id);
    if (!section) {
      section = {
        id: row.section_id,
        title: row.section_title,
        displayOrder: row.section_order,
        items: [],
      };
      grouped.set(row.section_id, section);
    }
    section.items.push({
      id: row.item_id,
      title: row.title,
      description: row.description,
      photoRequired: row.photo_required,
      isRequired: row.is_required,
      isCompleted: row.is_completed,
      completedAt: row.completed_at?.toISOString() ?? null,
      photoId: row.photo_id,
      notes: row.notes,
    });
  }

  return {
    bookingChecklistId: checklist.id,
    templateId: checklist.template_id,
    templateVersion: checklist.template_version,
    shownAt: checklist.shown_at.toISOString(),
    sections: Array.from(grouped.values()).sort((a, b) => a.displayOrder - b.displayOrder),
  };
}

/**
 * Toggle a checklist item's completion state. Validates photo_required
 * (Bug 463: server-side enforcement). Optionally persists notes + photo_id.
 */
export async function toggleChecklistItem(
  itemId: string,
  userId: string,
  role: 'customer' | 'provider' | 'admin',
  patch: { completed: boolean; photoId?: string | null; notes?: string | null },
): Promise<{ id: string; isCompleted: boolean; completedAt: string | null; photoId: string | null }> {
  const result = await db.transaction(async (client) => {
    // Fetch item + booking context for authorization + photo_required check.
    const itemRow = await client.query<{
      id: string;
      title_snapshot: string;
      photo_required: boolean;
      is_required: boolean;
      booking_id: string;
      provider_user_id: string | null;
      customer_id: string;
    }>(
      `SELECT bi.id, bi.title_snapshot, bi.photo_required, bi.is_required,
              bc.booking_id,
              p.user_id    AS provider_user_id,
              b.customer_id
         FROM booking_checklist_items bi
         JOIN booking_checklists bc ON bc.id = bi.booking_checklist_id
         JOIN bookings b ON b.id = bc.booking_id
         LEFT JOIN providers p ON p.id = b.provider_id
        WHERE bi.id = $1
        FOR UPDATE OF bi`,
      [itemId],
    );
    const row = itemRow.rows[0];
    if (!row) throw createAppError('Checklist item not found.', 404);

    if (role === 'customer' && row.customer_id !== userId) {
      throw createAppError('You do not have access to this booking.', 403);
    }
    if (role === 'provider' && row.provider_user_id !== userId) {
      throw createAppError('You do not have access to this booking.', 403);
    }

    // Bug 463: server enforces photo_required.
    if (patch.completed && row.photo_required && !patch.photoId) {
      throw createAppError(
        `"${row.title_snapshot}" requires a photo before marking complete.`,
        400,
      );
    }

    // If photoId provided, verify it exists, belongs to the same booking,
    // and is not soft-deleted.
    if (patch.photoId) {
      const photoCheck = await client.query<{ booking_id: string; deleted_at: Date | null }>(
        `SELECT booking_id, deleted_at FROM booking_photos WHERE id = $1`,
        [patch.photoId],
      );
      const photo = photoCheck.rows[0];
      if (!photo || photo.deleted_at) throw createAppError('Photo not found.', 400);
      if (photo.booking_id !== row.booking_id) {
        throw createAppError('Photo does not belong to this booking.', 400);
      }
    }

    const updated = await client.query<{
      id: string;
      is_completed: boolean;
      completed_at: Date | null;
      photo_id: string | null;
    }>(
      `UPDATE booking_checklist_items
          SET is_completed = $2,
              completed_at = CASE WHEN $2 THEN NOW() ELSE NULL END,
              photo_id = COALESCE($3, photo_id),
              notes = COALESCE($4, notes)
        WHERE id = $1
        RETURNING id, is_completed, completed_at, photo_id`,
      [itemId, patch.completed, patch.photoId ?? null, patch.notes ?? null],
    );

    const out = updated.rows[0];
    if (!out) throw createAppError('Failed to update checklist item.', 500);
    return out;
  });

  return {
    id: result.id,
    isCompleted: result.is_completed,
    completedAt: result.completed_at?.toISOString() ?? null,
    photoId: result.photo_id,
  };
}

/**
 * Returns checklist completion status for booking-completion gating.
 * Bug 463: provider can NOT mark a job complete unless ALL required
 * checklist items are completed.
 */
export async function getChecklistCompletionStatus(
  bookingId: string,
): Promise<{ totalRequired: number; completedRequired: number; isFullyComplete: boolean; checklistShown: boolean }> {
  const result = await db.query<{
    total_required: string;
    completed_required: string;
    checklist_count: string;
  }>(
    `SELECT
       COALESCE(SUM(CASE WHEN bi.is_required THEN 1 ELSE 0 END), 0)::text AS total_required,
       COALESCE(SUM(CASE WHEN bi.is_required AND bi.is_completed THEN 1 ELSE 0 END), 0)::text AS completed_required,
       COUNT(DISTINCT bc.id)::text AS checklist_count
       FROM booking_checklists bc
       LEFT JOIN booking_checklist_items bi ON bi.booking_checklist_id = bc.id
      WHERE bc.booking_id = $1`,
    [bookingId],
  );
  const row = result.rows[0];
  const totalRequired = Number(row?.total_required ?? 0);
  const completedRequired = Number(row?.completed_required ?? 0);
  const checklistShown = Number(row?.checklist_count ?? 0) > 0;
  // BUG-PHASE21-03 fix: pre-fix `isFullyComplete` required totalRequired > 0,
  // so any checklist whose template has zero `is_required=TRUE` items
  // (legitimate for some service categories — say "guidance only") was
  // treated as permanently incomplete, blocking the provider from ever
  // marking the job complete with the message "Complete all 0 required
  // checklist items first (0/0 done)". The shown-but-no-required-items
  // case is the SUCCESSFUL path: provider opened the checklist, the
  // template has nothing they must check off, completion can proceed.
  // The provider still needs the >=2 after-photos gate to actually
  // mark complete (see booking.service.ts line ~549).
  return {
    totalRequired,
    completedRequired,
    isFullyComplete: checklistShown && (totalRequired === 0 || completedRequired === totalRequired),
    checklistShown,
  };
}
