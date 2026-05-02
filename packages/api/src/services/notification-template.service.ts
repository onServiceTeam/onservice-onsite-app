import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';

interface TemplateRow {
  id: string;
  slug: string;
  title_template: string;
  body_template: string;
  type: string;
  channel: string;
  is_active: boolean;
  variables: string[];
  created_by: string | null;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
}

interface CountRow { count: string }

export async function listTemplates(
  filters: { type?: string; channel?: string; isActive?: boolean; page: number; pageSize: number },
): Promise<{ templates: TemplateRow[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (filters.type) {
    conditions.push(`t.type = $${paramIdx++}`);
    params.push(filters.type);
  }
  if (filters.channel) {
    conditions.push(`t.channel = $${paramIdx++}`);
    params.push(filters.channel);
  }
  if (filters.isActive != null) {
    conditions.push(`t.is_active = $${paramIdx++}`);
    params.push(filters.isActive);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await db.query<CountRow>(
    `SELECT COUNT(*)::text as count FROM notification_templates t ${whereClause}`,
    params,
  );

  const offset = (filters.page - 1) * filters.pageSize;
  const dataResult = await db.query<TemplateRow>(
    `SELECT * FROM notification_templates t ${whereClause}
     ORDER BY t.type, t.slug ASC
     LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
    [...params, filters.pageSize, offset],
  );

  return { templates: dataResult.rows, total: Number(countResult.rows[0]?.count ?? 0) };
}

export async function getTemplateBySlug(slug: string): Promise<TemplateRow> {
  const result = await db.query<TemplateRow>(
    `SELECT * FROM notification_templates WHERE slug = $1`,
    [slug],
  );
  if (result.rows.length === 0) throw createAppError('Template not found.', 404);
  return result.rows[0]!;
}

export async function getTemplateById(id: string): Promise<TemplateRow> {
  const result = await db.query<TemplateRow>(
    `SELECT * FROM notification_templates WHERE id = $1`,
    [id],
  );
  if (result.rows.length === 0) throw createAppError('Template not found.', 404);
  return result.rows[0]!;
}

export async function createTemplate(
  adminId: string,
  data: {
    slug: string;
    titleTemplate: string;
    bodyTemplate: string;
    type: string;
    channel?: string;
    variables?: string[];
  },
): Promise<TemplateRow> {
  const existing = await db.query<CountRow>(
    `SELECT COUNT(*)::text as count FROM notification_templates WHERE slug = $1`,
    [data.slug],
  );
  if (Number(existing.rows[0]?.count ?? 0) > 0) {
    throw createAppError('A template with this slug already exists.', 409);
  }

  const result = await db.query<TemplateRow>(
    `INSERT INTO notification_templates (slug, title_template, body_template, type, channel, variables, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      data.slug,
      data.titleTemplate,
      data.bodyTemplate,
      data.type,
      data.channel ?? 'in_app',
      JSON.stringify(data.variables ?? []),
      adminId,
    ],
  );

  logger.info('Notification template created', { slug: data.slug, adminId });
  return result.rows[0]!;
}

export async function updateTemplate(
  templateId: string,
  adminId: string,
  data: {
    titleTemplate?: string;
    bodyTemplate?: string;
    type?: string;
    channel?: string;
    isActive?: boolean;
    variables?: string[];
  },
): Promise<TemplateRow> {
  const current = await getTemplateById(templateId);

  const result = await db.query<TemplateRow>(
    `UPDATE notification_templates SET
       title_template = COALESCE($1, title_template),
       body_template = COALESCE($2, body_template),
       type = COALESCE($3, type),
       channel = COALESCE($4, channel),
       is_active = COALESCE($5, is_active),
       variables = COALESCE($6, variables),
       updated_by = $7,
       updated_at = NOW()
     WHERE id = $8 RETURNING *`,
    [
      data.titleTemplate ?? null,
      data.bodyTemplate ?? null,
      data.type ?? null,
      data.channel ?? null,
      data.isActive ?? null,
      data.variables ? JSON.stringify(data.variables) : null,
      adminId,
      templateId,
    ],
  );

  logger.info('Notification template updated', { templateId, slug: current.slug, adminId });
  return result.rows[0]!;
}

// MED-N142 fix — pre-fix this did a hard DELETE with no
// admin_actions audit. Templates power critical customer comms (OTP
// SMS, booking confirmations); a deletion later "I didn't get the
// confirmation SMS" report had no trail of who broke the template.
//
// Post-fix: capture the row's slug + content BEFORE deleting (for
// the audit details so admin can restore from the audit row if
// needed) + INSERT the admin_actions row in the same transaction.
// The action_type 'config_changed' is the existing catch-all; we put
// the slug + the deleted state under details so the trail is full.
export async function deleteTemplate(templateId: string, deletedByAdminId: string): Promise<void> {
  return db.transaction(async (client) => {
    const before = await client.query<TemplateRow>(
      `SELECT * FROM notification_templates WHERE id = $1 FOR UPDATE`,
      [templateId],
    );
    if (before.rows.length === 0) throw createAppError('Template not found.', 404);
    const tpl = before.rows[0]!;

    const result = await client.query(
      `DELETE FROM notification_templates WHERE id = $1`,
      [templateId],
    );
    if ((result.rowCount ?? 0) === 0) throw createAppError('Template not found.', 404);

    await client.query(
      `INSERT INTO admin_actions
         (admin_id, action_type, target_type, target_id, details)
       VALUES ($1, 'config_changed', 'notification_template', $2, $3::jsonb)`,
      [
        deletedByAdminId,
        templateId,
        JSON.stringify({
          op: 'delete',
          slug: tpl.slug,
          type: tpl.type,
          channel: tpl.channel,
          // Snapshot the content so admin can re-create from the audit log.
          deletedTitleTemplate: tpl.title_template,
          deletedBodyTemplate: tpl.body_template,
        }),
      ],
    );
    logger.info('Notification template deleted', { templateId, slug: tpl.slug, deletedByAdminId });
  });
}

export function renderTemplate(
  template: TemplateRow,
  variables: Record<string, string>,
): { title: string; body: string } {
  let title = template.title_template;
  let body = template.body_template;

  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{{${key}}}`;
    title = title.split(placeholder).join(value);
    body = body.split(placeholder).join(value);
  }

  return { title, body };
}

export function formatTemplate(t: TemplateRow): Record<string, unknown> {
  return {
    id: t.id,
    slug: t.slug,
    titleTemplate: t.title_template,
    bodyTemplate: t.body_template,
    type: t.type,
    channel: t.channel,
    isActive: t.is_active,
    variables: t.variables,
    createdBy: t.created_by,
    updatedBy: t.updated_by,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  };
}
