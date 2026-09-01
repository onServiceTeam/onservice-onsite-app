/**
 * D27 Phase 5 — project layer for big multi-stage jobs.
 *
 * A project groups milestones (stages + progress), selections (the customer's
 * material/colour choices), and documents (blueprints, permits, contract). This
 * is the planning + progress-tracking layer. Money does NOT move per milestone
 * here — milestone.amount is advisory only. Per-milestone escrow is a Ken
 * decision (.ai-coder/decisions/D27p5-milestone-escrow.md).
 */
import { db } from '../models/db';
import { logger } from '../utils/logger';
import { createAppError } from '../middleware/error.middleware';

export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled';
export type MilestoneStatus = 'pending' | 'in_progress' | 'completed';
export type DocType = 'blueprint' | 'permit' | 'contract' | 'photo' | 'other';

interface ProjectRow {
  id: string;
  customer_id: string;
  provider_id: string | null;
  category_id: string | null;
  title: string;
  description: string;
  address: string | null;
  city: string | null;
  status: string;
  estimated_total: number | null;
  created_at: Date;
  updated_at: Date;
  customer_name?: string;
  provider_name?: string | null;
}

interface MilestoneRow {
  id: string;
  project_id: string;
  title: string;
  description: string;
  sort_order: number;
  status: string;
  amount: number | null;
  target_date: Date | string | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface SelectionRow {
  id: string;
  project_id: string;
  category: string;
  label: string;
  value: string;
  detail: string | null;
  sort_order: number;
  created_at: Date;
}

interface DocumentRow {
  id: string;
  project_id: string;
  label: string;
  file_url: string;
  doc_type: string;
  uploaded_by: string | null;
  created_at: Date;
}

function formatProject(p: ProjectRow): Record<string, unknown> {
  return {
    id: p.id,
    customerId: p.customer_id,
    providerId: p.provider_id,
    categoryId: p.category_id,
    title: p.title,
    description: p.description,
    address: p.address,
    city: p.city,
    status: p.status,
    estimatedTotal: p.estimated_total,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    customerName: p.customer_name,
    providerName: p.provider_name,
  };
}

function formatMilestone(m: MilestoneRow): Record<string, unknown> {
  return {
    id: m.id,
    projectId: m.project_id,
    title: m.title,
    description: m.description,
    sortOrder: m.sort_order,
    status: m.status,
    amount: m.amount,
    targetDate: m.target_date instanceof Date ? m.target_date.toISOString().slice(0, 10) : m.target_date,
    completedAt: m.completed_at,
    createdAt: m.created_at,
  };
}

function formatSelection(s: SelectionRow): Record<string, unknown> {
  return {
    id: s.id, projectId: s.project_id, category: s.category, label: s.label,
    value: s.value, detail: s.detail, sortOrder: s.sort_order, createdAt: s.created_at,
  };
}

function formatDocument(d: DocumentRow): Record<string, unknown> {
  return {
    id: d.id, projectId: d.project_id, label: d.label, fileUrl: d.file_url,
    docType: d.doc_type, uploadedBy: d.uploaded_by, createdAt: d.created_at,
  };
}

/** Resolve a provider's row id from their user id (null if not a provider). */
async function providerIdForUser(userId: string): Promise<string | null> {
  const r = await db.query<{ id: string }>(`SELECT id FROM providers WHERE user_id = $1`, [userId]);
  return r.rows[0]?.id ?? null;
}

/**
 * Load a project and assert the requester may see it. Customers see their own;
 * the assigned provider sees theirs; admins see all. Throws 404 (not 403) when
 * the requester isn't entitled, so a project's existence isn't leaked.
 */
async function loadProjectForRequester(
  projectId: string,
  requester: { userId: string; role: string },
): Promise<ProjectRow> {
  const r = await db.query<ProjectRow>(
    `SELECT p.*,
            TRIM(CONCAT(customer.first_name, ' ', customer.last_name)) AS customer_name,
            provider.business_name AS provider_name
       FROM projects p
       JOIN users customer ON customer.id = p.customer_id
       LEFT JOIN providers provider ON provider.id = p.provider_id
      WHERE p.id = $1`,
    [projectId],
  );
  const project = r.rows[0];
  if (!project) throw createAppError('Project not found.', 404);

  const isAdmin = requester.role === 'admin' || requester.role === 'super_admin';
  if (isAdmin) return project;
  if (project.customer_id === requester.userId) return project;
  if (project.provider_id) {
    const pid = await providerIdForUser(requester.userId);
    if (pid && pid === project.provider_id) return project;
  }
  throw createAppError('Project not found.', 404);
}

/** Whether the requester owns the project (customer) or is admin — full control. */
function isOwnerOrAdmin(project: ProjectRow, requester: { userId: string; role: string }): boolean {
  return (
    project.customer_id === requester.userId ||
    requester.role === 'admin' ||
    requester.role === 'super_admin'
  );
}

export async function createProject(
  requester: { userId: string; role: string },
  input: {
    title: string;
    description?: string;
    categoryId?: string | null;
    address?: string | null;
    city?: string | null;
    estimatedTotal?: number | null;
  },
): Promise<Record<string, unknown>> {
  if (requester.role !== 'customer') {
    throw createAppError('Only customers can create projects.', 403);
  }
  const customerUserId = requester.userId;
  const title = input.title?.trim();
  if (!title) throw createAppError('Project title is required.', 400);

  const r = await db.query<ProjectRow>(
    `INSERT INTO projects (customer_id, category_id, title, description, address, city, estimated_total)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      customerUserId,
      input.categoryId ?? null,
      title,
      input.description?.trim() ?? '',
      input.address?.trim() || null,
      input.city?.trim() || null,
      input.estimatedTotal ?? null,
    ],
  );
  logger.info('Project created', { projectId: r.rows[0]!.id, customerId: customerUserId });
  return formatProject(r.rows[0]!);
}

export async function listProjects(
  requester: { userId: string; role: string },
  opts: { status?: string } = {},
): Promise<Record<string, unknown>[]> {
  const isAdmin = requester.role === 'admin' || requester.role === 'super_admin';
  const params: unknown[] = [];
  let where = '';

  if (isAdmin) {
    if (opts.status) { params.push(opts.status); where = `WHERE p.status = $1`; }
  } else {
    const pid = await providerIdForUser(requester.userId);
    if (pid) {
      params.push(requester.userId, pid);
      where = `WHERE (p.customer_id = $1 OR p.provider_id = $2)`;
    } else {
      params.push(requester.userId);
      where = `WHERE p.customer_id = $1`;
    }
    if (opts.status) { params.push(opts.status); where += ` AND p.status = $${params.length}`; }
  }

  const r = await db.query<ProjectRow>(
    `SELECT p.*,
            TRIM(CONCAT(customer.first_name, ' ', customer.last_name)) AS customer_name,
            provider.business_name AS provider_name
       FROM projects p
       JOIN users customer ON customer.id = p.customer_id
       LEFT JOIN providers provider ON provider.id = p.provider_id
       ${where}
      ORDER BY p.created_at DESC
      LIMIT 200`,
    params,
  );
  return r.rows.map(formatProject);
}

export async function listProjectsForAdmin(opts: {
  search?: string;
  status?: ProjectStatus;
  page: number;
  pageSize: number;
}): Promise<{
  projects: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
  summary: { totalProjects: number; activeProjects: number; legacyProviderLinks: number };
}> {
  const page = Math.max(1, Math.floor(opts.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Math.floor(opts.pageSize) || 20));
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (opts.status) {
    params.push(opts.status);
    clauses.push(`p.status = $${params.length}`);
  }
  if (opts.search) {
    const escaped = opts.search.trim().replace(/[%_\\]/g, '\\$&');
    params.push(`%${escaped}%`);
    const index = params.length;
    clauses.push(`(
      p.id::text ILIKE $${index} ESCAPE '\\'
      OR p.title ILIKE $${index} ESCAPE '\\'
      OR p.description ILIKE $${index} ESCAPE '\\'
      OR COALESCE(p.city, '') ILIKE $${index} ESCAPE '\\'
      OR TRIM(CONCAT(customer.first_name, ' ', customer.last_name)) ILIKE $${index} ESCAPE '\\'
      OR COALESCE(provider.business_name, '') ILIKE $${index} ESCAPE '\\'
    )`);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const offset = (page - 1) * pageSize;
  const dataParams = [...params, pageSize, offset];
  const [summaryResult, projectsResult] = await Promise.all([
    db.query<{ total: number; active_projects: number; legacy_provider_links: number }>(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE p.status = 'active')::int AS active_projects,
              COUNT(*) FILTER (WHERE p.provider_id IS NOT NULL)::int AS legacy_provider_links
         FROM projects p
         JOIN users customer ON customer.id = p.customer_id
         LEFT JOIN providers provider ON provider.id = p.provider_id
         ${where}`,
      params,
    ),
    db.query<ProjectRow>(
      `SELECT p.*,
              TRIM(CONCAT(customer.first_name, ' ', customer.last_name)) AS customer_name,
              provider.business_name AS provider_name
         FROM projects p
         JOIN users customer ON customer.id = p.customer_id
         LEFT JOIN providers provider ON provider.id = p.provider_id
         ${where}
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      dataParams,
    ),
  ]);
  const summaryRow = summaryResult.rows[0] ?? {
    total: 0,
    active_projects: 0,
    legacy_provider_links: 0,
  };

  return {
    projects: projectsResult.rows.map(formatProject),
    total: summaryRow.total,
    page,
    pageSize,
    summary: {
      totalProjects: summaryRow.total,
      activeProjects: summaryRow.active_projects,
      legacyProviderLinks: summaryRow.legacy_provider_links,
    },
  };
}

export async function getProjectDetail(
  projectId: string,
  requester: { userId: string; role: string },
): Promise<Record<string, unknown>> {
  const project = await loadProjectForRequester(projectId, requester);
  const [milestones, selections, documents] = await Promise.all([
    db.query<MilestoneRow>(`SELECT * FROM project_milestones WHERE project_id = $1 ORDER BY sort_order ASC, created_at ASC`, [projectId]),
    db.query<SelectionRow>(`SELECT * FROM project_selections WHERE project_id = $1 ORDER BY sort_order ASC, created_at ASC`, [projectId]),
    db.query<DocumentRow>(`SELECT * FROM project_documents WHERE project_id = $1 ORDER BY created_at DESC`, [projectId]),
  ]);
  return {
    ...formatProject(project),
    milestones: milestones.rows.map(formatMilestone),
    selections: selections.rows.map(formatSelection),
    documents: documents.rows.map(formatDocument),
  };
}

export async function updateProject(
  projectId: string,
  requester: { userId: string; role: string },
  patch: { title?: string; description?: string; status?: ProjectStatus; address?: string | null; city?: string | null; estimatedTotal?: number | null; providerId?: string | null },
): Promise<Record<string, unknown>> {
  const project = await loadProjectForRequester(projectId, requester);
  if (!isOwnerOrAdmin(project, requester)) {
    throw createAppError('Only the project owner can change project details.', 403);
  }
  // Projects currently have no provider invitation/acceptance or booking
  // relationship. Allowing a customer to write an arbitrary provider UUID
  // would grant that provider access to the project's private details and
  // documents. Keep assignment closed until that workflow is designed.
  if (patch.providerId !== undefined) {
    throw createAppError('Provider assignment is not available for projects.', 400);
  }
  const sets: string[] = [];
  const values: unknown[] = [];
  const add = (col: string, val: unknown): void => { sets.push(`${col} = $${sets.length + 1}`); values.push(val); };

  if (patch.title !== undefined) {
    if (!patch.title.trim()) throw createAppError('Project title cannot be empty.', 400);
    add('title', patch.title.trim());
  }
  if (patch.description !== undefined) add('description', patch.description.trim());
  if (patch.status !== undefined) add('status', patch.status);
  if (patch.address !== undefined) add('address', patch.address?.trim() || null);
  if (patch.city !== undefined) add('city', patch.city?.trim() || null);
  if (patch.estimatedTotal !== undefined) add('estimated_total', patch.estimatedTotal);
  if (sets.length === 0) throw createAppError('No fields to update.', 400);
  sets.push(`updated_at = NOW()`);
  values.push(projectId);

  const r = await db.query<ProjectRow>(
    `UPDATE projects SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values,
  );
  return formatProject(r.rows[0]!);
}

export async function addMilestone(
  projectId: string,
  requester: { userId: string; role: string },
  input: { title: string; description?: string; sortOrder?: number; amount?: number | null; targetDate?: string | null },
): Promise<Record<string, unknown>> {
  const project = await loadProjectForRequester(projectId, requester);
  if (!isOwnerOrAdmin(project, requester)) {
    throw createAppError('Only the project owner can add milestones.', 403);
  }
  if (!input.title?.trim()) throw createAppError('Milestone title is required.', 400);

  const r = await db.query<MilestoneRow>(
    `INSERT INTO project_milestones (project_id, title, description, sort_order, amount, target_date)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [projectId, input.title.trim(), input.description?.trim() ?? '', input.sortOrder ?? 0, input.amount ?? null, input.targetDate ?? null],
  );
  return formatMilestone(r.rows[0]!);
}

export async function updateMilestone(
  milestoneId: string,
  requester: { userId: string; role: string },
  patch: { title?: string; description?: string; sortOrder?: number; status?: MilestoneStatus; amount?: number | null; targetDate?: string | null },
): Promise<Record<string, unknown>> {
  const existing = await db.query<MilestoneRow & { p_customer: string; p_provider: string | null }>(
    `SELECT m.*, p.customer_id AS p_customer, p.provider_id AS p_provider
       FROM project_milestones m JOIN projects p ON p.id = m.project_id
      WHERE m.id = $1`,
    [milestoneId],
  );
  const row = existing.rows[0];
  if (!row) throw createAppError('Milestone not found.', 404);

  // Authorize against the parent project (reuse the project-level check).
  const project = await loadProjectForRequester(row.project_id, requester);
  const owner = isOwnerOrAdmin(project, requester);
  // The assigned provider may update status (mark progress) but not amounts/title.
  const statusOnly = !owner;
  if (statusOnly && (patch.title !== undefined || patch.amount !== undefined || patch.description !== undefined || patch.sortOrder !== undefined || patch.targetDate !== undefined)) {
    throw createAppError('Assigned providers can only update milestone status.', 403);
  }

  if (patch.status !== undefined) {
    const statusRank: Record<MilestoneStatus, number> = {
      pending: 0,
      in_progress: 1,
      completed: 2,
    };
    const currentStatus = row.status as MilestoneStatus;
    if (statusRank[patch.status] < statusRank[currentStatus]) {
      throw createAppError('Completed project progress cannot be moved backward.', 409);
    }
  }

  const sets: string[] = [];
  const values: unknown[] = [];
  const add = (col: string, val: unknown): void => { sets.push(`${col} = $${sets.length + 1}`); values.push(val); };

  if (patch.title !== undefined) add('title', patch.title.trim());
  if (patch.description !== undefined) add('description', patch.description.trim());
  if (patch.sortOrder !== undefined) add('sort_order', patch.sortOrder);
  if (patch.amount !== undefined) add('amount', patch.amount);
  if (patch.targetDate !== undefined) add('target_date', patch.targetDate);
  if (patch.status !== undefined) {
    add('status', patch.status);
    // Stamp/clear completed_at when crossing the completed boundary.
    add('completed_at', patch.status === 'completed' ? new Date() : null);
  }

  if (sets.length === 0) throw createAppError('No fields to update.', 400);
  sets.push(`updated_at = NOW()`);
  values.push(milestoneId);

  const r = await db.query<MilestoneRow>(
    `UPDATE project_milestones SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values,
  );
  return formatMilestone(r.rows[0]!);
}

export async function deleteMilestone(milestoneId: string, requester: { userId: string; role: string }): Promise<void> {
  const existing = await db.query<{ project_id: string }>(`SELECT project_id FROM project_milestones WHERE id = $1`, [milestoneId]);
  const row = existing.rows[0];
  if (!row) throw createAppError('Milestone not found.', 404);
  const project = await loadProjectForRequester(row.project_id, requester);
  if (!isOwnerOrAdmin(project, requester)) throw createAppError('Only the project owner can remove milestones.', 403);
  await db.query(`DELETE FROM project_milestones WHERE id = $1`, [milestoneId]);
}

export async function addSelection(
  projectId: string,
  requester: { userId: string; role: string },
  input: { category: string; label: string; value: string; detail?: string | null; sortOrder?: number },
): Promise<Record<string, unknown>> {
  const project = await loadProjectForRequester(projectId, requester);
  if (!isOwnerOrAdmin(project, requester)) throw createAppError('Only the project owner can add selections.', 403);
  if (!input.category?.trim() || !input.label?.trim() || !input.value?.trim()) {
    throw createAppError('Selection needs a category, label, and value.', 400);
  }
  const r = await db.query<SelectionRow>(
    `INSERT INTO project_selections (project_id, category, label, value, detail, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [projectId, input.category.trim(), input.label.trim(), input.value.trim(), input.detail?.trim() || null, input.sortOrder ?? 0],
  );
  return formatSelection(r.rows[0]!);
}

export async function deleteSelection(selectionId: string, requester: { userId: string; role: string }): Promise<void> {
  const existing = await db.query<{ project_id: string }>(`SELECT project_id FROM project_selections WHERE id = $1`, [selectionId]);
  const row = existing.rows[0];
  if (!row) throw createAppError('Selection not found.', 404);
  const project = await loadProjectForRequester(row.project_id, requester);
  if (!isOwnerOrAdmin(project, requester)) throw createAppError('Only the project owner can remove selections.', 403);
  await db.query(`DELETE FROM project_selections WHERE id = $1`, [selectionId]);
}

export async function addDocument(
  projectId: string,
  requester: { userId: string; role: string },
  input: { label: string; fileUrl: string; docType?: DocType },
): Promise<Record<string, unknown>> {
  // Both the owner and the assigned provider can attach documents (the provider
  // uploads progress photos / permits). loadProjectForRequester already gates to
  // owner / assigned-provider / admin.
  await loadProjectForRequester(projectId, requester);
  if (!input.label?.trim() || !input.fileUrl?.trim()) {
    throw createAppError('Document needs a label and a file.', 400);
  }
  const r = await db.query<DocumentRow>(
    `INSERT INTO project_documents (project_id, label, file_url, doc_type, uploaded_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [projectId, input.label.trim(), input.fileUrl.trim(), input.docType ?? 'other', requester.userId],
  );
  return formatDocument(r.rows[0]!);
}

export async function deleteDocument(documentId: string, requester: { userId: string; role: string }): Promise<void> {
  const existing = await db.query<{ project_id: string; uploaded_by: string | null }>(
    `SELECT project_id, uploaded_by FROM project_documents WHERE id = $1`, [documentId],
  );
  const row = existing.rows[0];
  if (!row) throw createAppError('Document not found.', 404);
  const project = await loadProjectForRequester(row.project_id, requester);
  // Owner/admin can remove any document; the uploader can remove their own.
  if (!isOwnerOrAdmin(project, requester) && row.uploaded_by !== requester.userId) {
    throw createAppError('You can only remove documents you uploaded.', 403);
  }
  await db.query(`DELETE FROM project_documents WHERE id = $1`, [documentId]);
}
