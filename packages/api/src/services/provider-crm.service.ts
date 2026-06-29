/**
 * D27 Phase 7 — provider CRM (first slice): the provider's client book.
 *
 * Aggregates a provider's own bookings by customer so they can see repeat
 * clients, when they last served them, and the total job value. This is a
 * read-only view over data the provider already sees per booking — no new PII
 * exposure (these are the provider's own customers). The broader "value-added
 * per category" CRM tooling is a Ken decision: D27p7-provider-crm.md.
 */
import { db } from '../models/db';
import { logger } from '../utils/logger';
import { createAppError } from '../middleware/error.middleware';
import * as notificationService from './notification.service';

// Bookings that represent real served work (used for the "completed" count).
const COMPLETED_STATUSES = ['confirmed', 'payout_ready', 'paid_out', 'completed_by_provider'];

export interface ProviderClientResult {
  customerId: string;
  customerName: string;
  jobCount: number;
  completedCount: number;
  lastJobAt: string | null;
  totalJobValue: number;
}

/**
 * One row per distinct customer the provider has had a booking with, most
 * recently served first. totalJobValue is the gross service price summed across
 * their bookings (NOT the provider's net of commission), labelled as such on the
 * client.
 */
export async function getProviderClients(providerId: string): Promise<ProviderClientResult[]> {
  const r = await db.query<{
    customer_id: string;
    first_name: string;
    last_name: string;
    job_count: string;
    completed_count: string;
    last_job_at: Date | null;
    total_job_value: string | null;
  }>(
    `SELECT b.customer_id,
            u.first_name, u.last_name,
            COUNT(*)::text AS job_count,
            COUNT(*) FILTER (WHERE b.status = ANY($2))::text AS completed_count,
            MAX(b.created_at) AS last_job_at,
            COALESCE(SUM(b.service_price), 0)::text AS total_job_value
       FROM bookings b
       JOIN users u ON u.id = b.customer_id
      WHERE b.provider_id = $1
      GROUP BY b.customer_id, u.first_name, u.last_name
      ORDER BY MAX(b.created_at) DESC
      LIMIT 300`,
    [providerId, COMPLETED_STATUSES],
  );

  return r.rows.map((row) => ({
    customerId: row.customer_id,
    customerName: `${row.first_name} ${row.last_name}`.trim(),
    jobCount: Number(row.job_count),
    completedCount: Number(row.completed_count),
    lastJobAt: row.last_job_at ? row.last_job_at.toISOString() : null,
    totalJobValue: Number(row.total_job_value ?? 0),
  }));
}

// ── Client detail (the provider's view of one of their customers) ────────────

/**
 * Assert this customer is actually one of the provider's clients (has at least
 * one booking with them). Stops a provider from attaching notes to a stranger.
 */
async function assertIsClient(providerId: string, customerId: string): Promise<void> {
  const r = await db.query<{ exists: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM bookings WHERE provider_id = $1 AND customer_id = $2) AS exists`,
    [providerId, customerId],
  );
  if (!r.rows[0]?.exists) throw createAppError('This customer is not one of your clients.', 404);
}

export async function getClientDetail(providerId: string, customerId: string): Promise<Record<string, unknown>> {
  await assertIsClient(providerId, customerId);
  const [cust, bookings, notes, reminders] = await Promise.all([
    db.query<{ first_name: string; last_name: string }>(`SELECT first_name, last_name FROM users WHERE id = $1`, [customerId]),
    db.query<{ id: string; status: string; service_price: number; created_at: Date; category_name: string | null }>(
      `SELECT b.id, b.status, b.service_price, b.created_at, sc.name AS category_name
         FROM bookings b LEFT JOIN service_categories sc ON sc.id = b.category_id
        WHERE b.provider_id = $1 AND b.customer_id = $2
        ORDER BY b.created_at DESC LIMIT 50`,
      [providerId, customerId],
    ),
    listClientNotes(providerId, customerId),
    db.query<ReminderRow>(
      `SELECT * FROM provider_client_reminders WHERE provider_id = $1 AND customer_id = $2 ORDER BY due_date ASC`,
      [providerId, customerId],
    ),
  ]);
  const c = cust.rows[0];
  return {
    customerId,
    customerName: c ? `${c.first_name} ${c.last_name}`.trim() : 'Customer',
    bookings: bookings.rows.map((b) => ({
      id: b.id, status: b.status, servicePrice: b.service_price,
      categoryName: b.category_name, createdAt: b.created_at.toISOString(),
    })),
    notes,
    reminders: reminders.rows.map(formatReminder),
  };
}

// ── Client notes ─────────────────────────────────────────────────────────────

interface NoteRow {
  id: string;
  provider_id: string;
  customer_id: string;
  body: string;
  created_at: Date;
  updated_at: Date;
}

function formatNote(n: NoteRow): Record<string, unknown> {
  return { id: n.id, customerId: n.customer_id, body: n.body, createdAt: n.created_at.toISOString() };
}

export async function listClientNotes(providerId: string, customerId: string): Promise<Record<string, unknown>[]> {
  const r = await db.query<NoteRow>(
    `SELECT * FROM provider_client_notes WHERE provider_id = $1 AND customer_id = $2 ORDER BY created_at DESC`,
    [providerId, customerId],
  );
  return r.rows.map(formatNote);
}

export async function addClientNote(providerId: string, customerId: string, body: string): Promise<Record<string, unknown>> {
  const text = body?.trim();
  if (!text) throw createAppError('Note cannot be empty.', 400);
  await assertIsClient(providerId, customerId);
  const r = await db.query<NoteRow>(
    `INSERT INTO provider_client_notes (provider_id, customer_id, body) VALUES ($1, $2, $3) RETURNING *`,
    [providerId, customerId, text],
  );
  return formatNote(r.rows[0]!);
}

export async function deleteClientNote(providerId: string, noteId: string): Promise<void> {
  const r = await db.query(`DELETE FROM provider_client_notes WHERE id = $1 AND provider_id = $2`, [noteId, providerId]);
  if (r.rowCount === 0) throw createAppError('Note not found.', 404);
}

// ── Reminders ────────────────────────────────────────────────────────────────

interface ReminderRow {
  id: string;
  provider_id: string;
  customer_id: string | null;
  title: string;
  due_date: Date | string;
  status: string;
  fired_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function formatReminder(r: ReminderRow): Record<string, unknown> {
  return {
    id: r.id,
    customerId: r.customer_id,
    title: r.title,
    dueDate: r.due_date instanceof Date ? r.due_date.toISOString().slice(0, 10) : r.due_date,
    status: r.status,
    createdAt: r.created_at.toISOString(),
  };
}

export async function listReminders(providerId: string, opts: { status?: string } = {}): Promise<Record<string, unknown>[]> {
  const params: unknown[] = [providerId];
  let where = `WHERE r.provider_id = $1`;
  if (opts.status) { params.push(opts.status); where += ` AND r.status = $${params.length}`; }
  const r = await db.query<ReminderRow & { first_name: string | null; last_name: string | null }>(
    `SELECT r.*, u.first_name, u.last_name
       FROM provider_client_reminders r
       LEFT JOIN users u ON u.id = r.customer_id
       ${where}
      ORDER BY r.status ASC, r.due_date ASC LIMIT 200`,
    params,
  );
  return r.rows.map((row) => ({
    ...formatReminder(row),
    customerName: row.first_name ? `${row.first_name} ${row.last_name}`.trim() : null,
  }));
}

export async function addReminder(
  providerId: string,
  input: { customerId?: string | null; title: string; dueDate: string },
): Promise<Record<string, unknown>> {
  const title = input.title?.trim();
  if (!title) throw createAppError('Reminder title is required.', 400);
  if (input.customerId) await assertIsClient(providerId, input.customerId);
  const r = await db.query<ReminderRow>(
    `INSERT INTO provider_client_reminders (provider_id, customer_id, title, due_date)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [providerId, input.customerId ?? null, title, input.dueDate],
  );
  return formatReminder(r.rows[0]!);
}

export async function completeReminder(providerId: string, reminderId: string): Promise<Record<string, unknown>> {
  const r = await db.query<ReminderRow>(
    `UPDATE provider_client_reminders SET status = 'done', updated_at = NOW()
      WHERE id = $1 AND provider_id = $2 RETURNING *`,
    [reminderId, providerId],
  );
  if (r.rows.length === 0) throw createAppError('Reminder not found.', 404);
  return formatReminder(r.rows[0]!);
}

export async function deleteReminder(providerId: string, reminderId: string): Promise<void> {
  const r = await db.query(`DELETE FROM provider_client_reminders WHERE id = $1 AND provider_id = $2`, [reminderId, providerId]);
  if (r.rowCount === 0) throw createAppError('Reminder not found.', 404);
}

/**
 * Daily sweep (scheduler) — for each pending reminder due today or earlier that
 * hasn't fired yet, send the provider a notification and stamp fired_at so it
 * only fires once. Best-effort per reminder.
 */
export async function fireDueReminders(): Promise<number> {
  const due = await db.query<{ id: string; provider_id: string; title: string; user_id: string }>(
    `SELECT r.id, r.provider_id, r.title, p.user_id
       FROM provider_client_reminders r
       JOIN providers p ON p.id = r.provider_id
      WHERE r.status = 'pending' AND r.fired_at IS NULL AND r.due_date <= CURRENT_DATE
      LIMIT 500`,
  );
  let fired = 0;
  for (const row of due.rows) {
    try {
      await notificationService.sendPushNotification(
        row.user_id,
        'Follow-up reminder',
        row.title,
        'provider_reminder',
        { reminderId: row.id },
      );
      await db.query(`UPDATE provider_client_reminders SET fired_at = NOW(), updated_at = NOW() WHERE id = $1`, [row.id]);
      fired += 1;
    } catch (err) {
      logger.warn('Reminder fire failed', { reminderId: row.id, err: String(err) });
    }
  }
  if (fired > 0) logger.info('Provider reminders fired', { fired });
  return fired;
}

// ── Quote templates ──────────────────────────────────────────────────────────

interface TemplateRow {
  id: string;
  provider_id: string;
  category_id: string | null;
  subcategory_id: string | null;
  name: string;
  created_at: Date;
}
interface TemplateItemRow {
  id: string;
  template_id: string;
  description: string;
  quantity: string;
  unit: string;
  unit_price: number;
  item_type: string;
  sort_order: number;
}

function formatTemplateItem(i: TemplateItemRow): Record<string, unknown> {
  return {
    id: i.id, description: i.description, quantity: Number(i.quantity), unit: i.unit,
    unitPrice: i.unit_price, itemType: i.item_type, sortOrder: i.sort_order,
  };
}

export async function listTemplates(providerId: string): Promise<Record<string, unknown>[]> {
  const tpls = await db.query<TemplateRow>(
    `SELECT * FROM provider_quote_templates WHERE provider_id = $1 ORDER BY created_at DESC`,
    [providerId],
  );
  if (tpls.rows.length === 0) return [];
  const ids = tpls.rows.map((t) => t.id);
  const items = await db.query<TemplateItemRow>(
    `SELECT * FROM provider_quote_template_items WHERE template_id = ANY($1) ORDER BY sort_order ASC, created_at ASC`,
    [ids],
  );
  const byTpl = items.rows.reduce<Record<string, Record<string, unknown>[]>>((acc, i) => {
    (acc[i.template_id] ??= []).push(formatTemplateItem(i));
    return acc;
  }, {});
  return tpls.rows.map((t) => ({
    id: t.id,
    name: t.name,
    categoryId: t.category_id,
    subcategoryId: t.subcategory_id,
    items: byTpl[t.id] ?? [],
    createdAt: t.created_at.toISOString(),
  }));
}

export interface TemplateItemInput {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  itemType?: 'labor' | 'materials' | 'equipment' | 'other';
}

export async function createTemplate(
  providerId: string,
  input: { name: string; categoryId?: string | null; subcategoryId?: string | null; items: TemplateItemInput[] },
): Promise<Record<string, unknown>> {
  const name = input.name?.trim();
  if (!name) throw createAppError('Template name is required.', 400);
  if (!input.items || input.items.length === 0) throw createAppError('A template needs at least one line item.', 400);

  const created = await db.transaction(async (client) => {
    const t = await client.query<TemplateRow>(
      `INSERT INTO provider_quote_templates (provider_id, category_id, subcategory_id, name)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [providerId, input.categoryId ?? null, input.subcategoryId ?? null, name],
    );
    const tpl = t.rows[0]!;
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let idx = 1;
    input.items.forEach((it, order) => {
      placeholders.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
      values.push(tpl.id, it.description, it.quantity, it.unit, it.unitPrice, it.itemType ?? 'labor', order);
    });
    await client.query(
      `INSERT INTO provider_quote_template_items (template_id, description, quantity, unit, unit_price, item_type, sort_order)
       VALUES ${placeholders.join(', ')}`,
      values,
    );
    return tpl;
  });

  return {
    id: created.id, name: created.name, categoryId: created.category_id,
    subcategoryId: created.subcategory_id,
    items: input.items.map((it, order) => ({ ...it, itemType: it.itemType ?? 'labor', sortOrder: order })),
    createdAt: created.created_at.toISOString(),
  };
}

export async function deleteTemplate(providerId: string, templateId: string): Promise<void> {
  const r = await db.query(`DELETE FROM provider_quote_templates WHERE id = $1 AND provider_id = $2`, [templateId, providerId]);
  if (r.rowCount === 0) throw createAppError('Template not found.', 404);
}

// ── Per-category insights ────────────────────────────────────────────────────

/**
 * The provider's own performance sliced by service category: job count,
 * completion rate, and average rating from reviews on those bookings.
 */
export async function getCategoryInsights(providerId: string): Promise<Record<string, unknown>[]> {
  const r = await db.query<{
    category_id: string | null;
    category_name: string | null;
    job_count: string;
    completed_count: string;
    total_value: string | null;
    avg_rating: string | null;
  }>(
    `SELECT b.category_id,
            sc.name AS category_name,
            COUNT(*)::text AS job_count,
            COUNT(*) FILTER (WHERE b.status = ANY($2))::text AS completed_count,
            COALESCE(SUM(b.service_price), 0)::text AS total_value,
            AVG(r.rating)::text AS avg_rating
       FROM bookings b
       LEFT JOIN service_categories sc ON sc.id = b.category_id
       LEFT JOIN reviews r ON r.booking_id = b.id
      WHERE b.provider_id = $1
      GROUP BY b.category_id, sc.name
      ORDER BY COUNT(*) DESC`,
    [providerId, COMPLETED_STATUSES],
  );
  return r.rows.map((row) => {
    const jobs = Number(row.job_count);
    const completed = Number(row.completed_count);
    return {
      categoryId: row.category_id,
      categoryName: row.category_name ?? 'Other',
      jobCount: jobs,
      completedCount: completed,
      completionRate: jobs > 0 ? Math.round((completed / jobs) * 100) : 0,
      totalValue: Number(row.total_value ?? 0),
      avgRating: row.avg_rating != null ? Math.round(Number(row.avg_rating) * 10) / 10 : null,
    };
  });
}
