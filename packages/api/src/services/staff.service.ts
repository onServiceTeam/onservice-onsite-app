import { db } from '../models/db';
import { logger } from '../utils/logger';
import { createAppError } from '../middleware/error.middleware';

export interface AdminRole {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  created_at: string;
  updated_at: string;
  staff_count?: string;
}

export interface AdminStaff {
  id: string;
  user_id: string;
  role_id: string;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  user_phone?: string;
  user_email?: string;
  user_first_name?: string;
  user_last_name?: string;
  role_name?: string;
}

export async function listRoles(): Promise<AdminRole[]> {
  // Phase 14 Dispatch 06 — Bug 127: filter soft-deleted roles.
  const result = await db.query<AdminRole>(
    `SELECT ar.*,
            (SELECT COUNT(*) FROM admin_staff ast WHERE ast.role_id = ar.id AND ast.is_active = TRUE) AS staff_count
     FROM admin_roles ar
     WHERE ar.deleted_at IS NULL
     ORDER BY ar.name`,
  );
  return result.rows;
}

export async function getRoleById(roleId: string): Promise<AdminRole | null> {
  // Phase 14 Dispatch 06 — Bug 127: filter soft-deleted roles.
  const result = await db.query<AdminRole>(
    `SELECT * FROM admin_roles WHERE id = $1 AND deleted_at IS NULL`,
    [roleId],
  );
  return result.rows[0] ?? null;
}

export async function createRole(params: {
  name: string;
  description?: string;
  permissions: string[];
}): Promise<AdminRole> {
  validatePermissions(params.permissions);
  if (params.name.length > 50) throw createAppError('Role name must be 50 characters or fewer.', 400);
  try {
    const result = await db.query<AdminRole>(
      `INSERT INTO admin_roles (name, description, permissions)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [params.name, params.description ?? null, params.permissions],
    );
    logger.info('Admin role created', { roleId: result.rows[0]?.id, name: params.name });
    const role = result.rows[0];
    if (!role) throw new Error('Failed to create role.');
    return role;
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
      throw createAppError('A role with this name already exists.', 409);
    }
    throw err;
  }
}

export async function updateRole(
  roleId: string,
  params: { name?: string; description?: string; permissions?: string[] },
): Promise<AdminRole> {
  const existing = await getRoleById(roleId);
  if (!existing) throw createAppError('Role not found.', 404);
  if (existing.name === 'super_admin') {
    throw createAppError('The super_admin role cannot be modified.', 403);
  }
  if (params.permissions !== undefined) validatePermissions(params.permissions);
  if (params.name !== undefined && params.name.length > 50) {
    throw createAppError('Role name must be 50 characters or fewer.', 400);
  }
  const sets: string[] = ['updated_at = NOW()'];
  const values: unknown[] = [roleId];
  let idx = 2;

  if (params.name !== undefined) {
    sets.push(`name = $${idx++}`);
    values.push(params.name);
  }
  if (params.description !== undefined) {
    sets.push(`description = $${idx++}`);
    values.push(params.description);
  }
  if (params.permissions !== undefined) {
    sets.push(`permissions = $${idx}`);
    values.push(params.permissions);
  }

  const result = await db.query<AdminRole>(
    `UPDATE admin_roles SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
    values,
  );
  logger.info('Admin role updated', { roleId });
  const role = result.rows[0];
  if (!role) throw new Error('Role not found.');
  return role;
}

export async function deleteRole(
  roleId: string,
  adminUserId: string,
  reason?: string,
): Promise<void> {
  // Phase 14 Dispatch 06 — Bug 127. Pre-D06 this was a hard DELETE with
  // NO admin_actions audit. Now: soft delete (deleted_at column from
  // migration 076) + audit row in ONE transaction. The audit row's
  // target_id FK to admin_roles remains valid because the row still
  // exists, just with deleted_at set. New verb 'admin_role_archived'
  // (migration 075).
  await db.transaction(async (client) => {
    const existing = await client.query<{ id: string; name: string; deleted_at: Date | null }>(
      `SELECT id, name, deleted_at FROM admin_roles WHERE id = $1 FOR UPDATE`,
      [roleId],
    );
    const row = existing.rows[0];
    if (!row || row.deleted_at) throw createAppError('Role not found.', 404);
    if (row.name === 'super_admin') {
      throw createAppError('The super_admin role cannot be deleted.', 403);
    }
    const staffCount = await client.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM admin_staff WHERE role_id = $1 AND is_active = TRUE`,
      [roleId],
    );
    if (parseInt(staffCount.rows[0]?.count ?? '0', 10) > 0) {
      throw createAppError('Cannot archive a role that has active staff members assigned.', 409);
    }

    const trimmedReason = (reason ?? '').trim();
    await client.query(
      `UPDATE admin_roles
          SET deleted_at = NOW(),
              deleted_by = $2,
              deleted_reason = $3,
              updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL`,
      [roleId, adminUserId, trimmedReason || null],
    );

    const auditResult = await client.query<{ id: string }>(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, reason, full_notes)
       VALUES ($1, 'admin_role_archived', 'admin_role', $2, $3::jsonb, $4, $5)
       RETURNING id`,
      [
        adminUserId,
        roleId,
        JSON.stringify({ roleName: row.name }),
        trimmedReason ? trimmedReason.slice(0, 500) : `Role ${row.name} archived`,
        trimmedReason || null,
      ],
    );
    if (!auditResult.rows[0]?.id) {
      throw createAppError('Failed to record admin_role_archived audit.', 500);
    }
  });

  logger.info('Admin role archived', { roleId, adminUserId });
}

export async function listStaff(params: {
  page: number;
  limit: number;
  isActive?: boolean;
  roleId?: string;
}): Promise<{ staff: AdminStaff[]; total: number }> {
  const { page, limit, isActive, roleId } = params;
  const offset = (page - 1) * limit;
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (isActive !== undefined) {
    conditions.push(`ast.is_active = $${idx++}`);
    values.push(isActive);
  }
  if (roleId) {
    conditions.push(`ast.role_id = $${idx++}`);
    values.push(roleId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM admin_staff ast ${where}`,
    values,
  );

  const result = await db.query<AdminStaff>(
    `SELECT ast.*,
            u.phone AS user_phone, u.email AS user_email,
            u.first_name AS user_first_name, u.last_name AS user_last_name,
            ar.name AS role_name
     FROM admin_staff ast
     JOIN users u ON ast.user_id = u.id
     JOIN admin_roles ar ON ast.role_id = ar.id
     ${where}
     ORDER BY ast.created_at DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    [...values, limit, offset],
  );

  return { staff: result.rows, total: parseInt(countResult.rows[0]?.count ?? '0', 10) };
}

export async function addStaffMember(params: {
  userId: string;
  roleId: string;
}): Promise<AdminStaff> {
  try {
    const result = await db.query<AdminStaff>(
      `INSERT INTO admin_staff (user_id, role_id)
       VALUES ($1, $2)
       RETURNING *`,
      [params.userId, params.roleId],
    );
    logger.info('Admin staff member added', { userId: params.userId, roleId: params.roleId });
    const member = result.rows[0];
    if (!member) throw new Error('Failed to add staff member.');
    return member;
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
      throw createAppError('This user is already a staff member.', 409);
    }
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23503') {
      throw createAppError('User or role not found.', 404);
    }
    throw err;
  }
}

export async function updateStaffMember(
  staffId: string,
  params: { roleId?: string; isActive?: boolean },
): Promise<AdminStaff> {
  const sets: string[] = ['updated_at = NOW()'];
  const values: unknown[] = [staffId];
  let idx = 2;

  if (params.roleId !== undefined) {
    sets.push(`role_id = $${idx++}`);
    values.push(params.roleId);
  }
  if (params.isActive !== undefined) {
    sets.push(`is_active = $${idx}`);
    values.push(params.isActive);
  }

  const result = await db.query<AdminStaff>(
    `UPDATE admin_staff SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
    values,
  );
  logger.info('Admin staff updated', { staffId });
  const member = result.rows[0];
  if (!member) throw new Error('Staff member not found.');
  return member;
}

// MED-N128 fix — pre-fix removeStaffMember did a hard DELETE with no
// audit row. Two problems:
//   1. The DELETE cascades or orphans related rows (admin_actions
//      already done by the removed staff member, audit_log entries
//      that FK to admin_staff.id) without a trace of WHO removed
//      WHOM and when.
//   2. If the removal was malicious (an attacker who got super_admin
//      access removes legitimate staff to lock them out), there's no
//      forensic trail to detect or recover.
//
// Post-fix: removal is now a SOFT-DELETE (set is_active=FALSE,
// removed_at=NOW(), removed_by=actor) so the row stays for forensics
// and admin_actions FKs remain valid. An admin_actions row records
// the action with the actor's adminId for audit. Both writes happen
// in a single transaction so it's all-or-nothing.
//
// The removeStaffMember signature now takes the actor's adminId. The
// route passes req.user!.userId. The new admin_staff columns
// removed_at + removed_by come from migration 100.
export async function removeStaffMember(staffId: string, removedByAdminId: string): Promise<void> {
  return db.transaction(async (client) => {
    // Prevent removing the last active super_admin (unchanged invariant).
    const staffRow = await client.query<{ role_name: string; is_active: boolean }>(
      `SELECT ar.name AS role_name, ast.is_active FROM admin_staff ast
       JOIN admin_roles ar ON ast.role_id = ar.id
       WHERE ast.id = $1
       FOR UPDATE`,
      [staffId],
    );
    if (staffRow.rows.length === 0) {
      throw createAppError('Staff member not found.', 404);
    }
    if (staffRow.rows[0]!.is_active === false) {
      // Already removed — idempotent.
      logger.info('removeStaffMember called on already-removed staff', { staffId });
      return;
    }
    if (staffRow.rows[0]!.role_name === 'super_admin') {
      const superCount = await client.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM admin_staff ast
         JOIN admin_roles ar ON ast.role_id = ar.id
         WHERE ar.name = 'super_admin' AND ast.is_active = TRUE AND ast.id != $1`,
        [staffId],
      );
      if (parseInt(superCount.rows[0]?.count ?? '0', 10) === 0) {
        throw createAppError('Cannot remove the last active super admin.', 409);
      }
    }

    // Soft-delete: keep the row, mark inactive + record who/when.
    await client.query(
      `UPDATE admin_staff
       SET is_active = FALSE,
           removed_at = NOW(),
           removed_by = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [staffId, removedByAdminId],
    );

    // Audit row.
    await client.query(
      `INSERT INTO admin_actions
         (admin_id, action_type, target_type, target_id, details)
       VALUES ($1, 'staff_removed', 'admin_staff', $2, $3::jsonb)`,
      [
        removedByAdminId,
        staffId,
        JSON.stringify({
          removedRole: staffRow.rows[0]!.role_name,
          softDeleted: true,
        }),
      ],
    );

    logger.info('Admin staff soft-removed', { staffId, removedByAdminId });
  });
}

function validatePermissions(permissions: string[]): void {
  const invalid = permissions.filter((p) => !ALL_PERMISSIONS.includes(p as typeof ALL_PERMISSIONS[number]));
  if (invalid.length > 0) {
    throw createAppError(`Invalid permissions: ${invalid.join(', ')}`, 400);
  }
}

/** All available permissions used across the platform */
export const ALL_PERMISSIONS = [
  'dashboard.view',
  'providers.view', 'providers.manage',
  'customers.view', 'customers.manage',
  'bookings.view', 'bookings.manage',
  'catalog.view', 'catalog.manage',
  'disputes.view', 'disputes.manage',
  'financials.view',
  'payouts.view', 'payouts.manage',
  'templates.view', 'templates.manage',
  'analytics.view',
  'audit.view',
  'settings.view', 'settings.manage',
  'staff.view', 'staff.manage',
  'support.view', 'support.manage',
] as const;
