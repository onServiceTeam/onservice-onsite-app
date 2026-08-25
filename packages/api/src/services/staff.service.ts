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

export interface StaffCandidate {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string;
  role: 'admin' | 'super_admin' | 'dpo';
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
  createdByAdminId: string;
  reason: string;
}): Promise<AdminRole> {
  const name = params.name.trim();
  const reason = params.reason.trim();
  if (!name) throw createAppError('Role name is required.', 400);
  if (reason.length < 10) throw createAppError('Reason must be at least 10 characters.', 400);
  validatePermissions(params.permissions);
  if (name.length > 50) throw createAppError('Role name must be 50 characters or fewer.', 400);
  try {
    return await db.transaction(async (client) => {
      const result = await client.query<AdminRole>(
        `INSERT INTO admin_roles (name, description, permissions)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [name, params.description?.trim() || null, params.permissions],
      );
      const role = result.rows[0];
      if (!role) throw new Error('Failed to create role.');

      await client.query(
        `INSERT INTO admin_actions
           (admin_id, action_type, target_type, target_id, details, reason, full_notes)
         VALUES ($1, 'config_changed', 'admin_role', $2, $3::jsonb, $4, $5)`,
        [
          params.createdByAdminId,
          role.id,
          JSON.stringify({
            changeKind: 'admin_role_profile_created',
            roleName: role.name,
            description: role.description,
            permissions: role.permissions,
            accessSource: 'users.role and route RBAC',
          }),
          reason.slice(0, 500),
          reason,
        ],
      );
      logger.info('Admin role profile created', { roleId: role.id, name, createdByAdminId: params.createdByAdminId });
      return role;
    });
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
  updatedByAdminId: string,
  reason: string,
): Promise<AdminRole> {
  const trimmedReason = reason.trim();
  if (trimmedReason.length < 10) throw createAppError('Reason must be at least 10 characters.', 400);
  if (params.name === undefined && params.description === undefined && params.permissions === undefined) {
    throw createAppError('At least one role profile field is required.', 400);
  }
  if (params.permissions !== undefined) validatePermissions(params.permissions);
  const nextName = params.name?.trim();
  if (params.name !== undefined && !nextName) throw createAppError('Role name is required.', 400);
  if (nextName !== undefined && nextName.length > 50) {
    throw createAppError('Role name must be 50 characters or fewer.', 400);
  }
  try {
    return await db.transaction(async (client) => {
      const current = await client.query<AdminRole>(
        `SELECT * FROM admin_roles WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [roleId],
      );
      const existing = current.rows[0];
      if (!existing) throw createAppError('Role not found.', 404);
      if (existing.name === 'super_admin') {
        throw createAppError('The super_admin role cannot be modified.', 403);
      }

      const sets: string[] = ['updated_at = NOW()'];
      const values: unknown[] = [roleId];
      let idx = 2;
      if (nextName !== undefined) {
        sets.push(`name = $${idx++}`);
        values.push(nextName);
      }
      if (params.description !== undefined) {
        sets.push(`description = $${idx++}`);
        values.push(params.description.trim() || null);
      }
      if (params.permissions !== undefined) {
        sets.push(`permissions = $${idx}`);
        values.push(params.permissions);
      }

      const result = await client.query<AdminRole>(
        `UPDATE admin_roles SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
        values,
      );
      const role = result.rows[0];
      if (!role) throw new Error('Role not found.');

      await client.query(
        `INSERT INTO admin_actions
           (admin_id, action_type, target_type, target_id, details, reason, full_notes)
         VALUES ($1, 'config_changed', 'admin_role', $2, $3::jsonb, $4, $5)`,
        [
          updatedByAdminId,
          roleId,
          JSON.stringify({
            changeKind: 'admin_role_profile_updated',
            before: { name: existing.name, description: existing.description, permissions: existing.permissions },
            after: { name: role.name, description: role.description, permissions: role.permissions },
            accessSource: 'users.role and route RBAC',
          }),
          trimmedReason.slice(0, 500),
          trimmedReason,
        ],
      );
      logger.info('Admin role profile updated', { roleId, updatedByAdminId });
      return role;
    });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
      throw createAppError('A role with this name already exists.', 409);
    }
    throw err;
  }
}

export async function deleteRole(
  roleId: string,
  adminUserId: string,
  reason?: string,
): Promise<void> {
  const trimmedReason = (reason ?? '').trim();
  if (trimmedReason.length < 10) throw createAppError('Reason must be at least 10 characters.', 400);
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

    await client.query(
      `UPDATE admin_roles
          SET deleted_at = NOW(),
              deleted_by = $2,
              deleted_reason = $3,
              updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL`,
      [roleId, adminUserId, trimmedReason],
    );

    const auditResult = await client.query<{ id: string }>(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, reason, full_notes)
       VALUES ($1, 'admin_role_archived', 'admin_role', $2, $3::jsonb, $4, $5)
       RETURNING id`,
      [
        adminUserId,
        roleId,
        JSON.stringify({ roleName: row.name }),
        trimmedReason.slice(0, 500),
        trimmedReason,
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

export async function searchStaffCandidates(search: string, limit = 20): Promise<StaffCandidate[]> {
  const term = search.trim();
  if (term.length < 2) {
    throw createAppError('Search must contain at least 2 characters.', 400);
  }
  const safeLimit = Math.min(20, Math.max(1, limit));
  const escaped = term.replace(/[\\%_]/g, '\\$&');
  const pattern = `%${escaped}%`;
  const result = await db.query<StaffCandidate>(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.role
       FROM users u
      WHERE u.is_active = TRUE
        AND u.role IN ('admin', 'super_admin', 'dpo')
        AND NOT EXISTS (
          SELECT 1 FROM admin_staff ast WHERE ast.user_id = u.id
        )
        AND (
          u.first_name ILIKE $1 ESCAPE '\\'
          OR u.last_name ILIKE $1 ESCAPE '\\'
          OR COALESCE(u.email, '') ILIKE $1 ESCAPE '\\'
          OR u.phone ILIKE $1 ESCAPE '\\'
        )
      ORDER BY u.first_name, u.last_name, u.id
      LIMIT $2`,
    [pattern, safeLimit],
  );
  return result.rows;
}

export async function searchDpoCandidates(search: string, limit = 20): Promise<StaffCandidate[]> {
  const term = search.trim();
  if (term.length < 2) {
    throw createAppError('Search must contain at least 2 characters.', 400);
  }
  const safeLimit = Math.min(20, Math.max(1, limit));
  const escaped = term.replace(/[\\%_]/g, '\\$&');
  const pattern = `%${escaped}%`;
  const result = await db.query<StaffCandidate>(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.role
       FROM users u
      WHERE u.is_active = TRUE
        AND u.role = 'admin'
        AND (
          CONCAT_WS(' ', u.first_name, u.last_name) ILIKE $1 ESCAPE '\\'
          OR COALESCE(u.email, '') ILIKE $1 ESCAPE '\\'
          OR u.phone ILIKE $1 ESCAPE '\\'
        )
      ORDER BY u.first_name, u.last_name, u.id
      LIMIT $2`,
    [pattern, safeLimit],
  );
  return result.rows;
}

// MED-N129 fix — pre-fix INSERT INTO admin_staff happened with no
// admin_actions audit. This table is an operations-directory profile;
// admin login and API access remain controlled by users.role + route RBAC.
// The trail is still required because the profile is used by admin workflows.
//
// Post-fix: INSERT + audit row run in a single transaction. The
// caller now passes addedByAdminId so the audit attributes the
// action to the acting super_admin. We reuse 'staff_removed' family
// of action_types — adding a new value 'staff_added' to the CHECK
// constraint via migration 100 (which already shipped 'staff_removed').
// Wait — 100 only added staff_removed. We need migration 103 for
// staff_added. Done at file end.
export async function addStaffMember(params: {
  userId: string;
  roleId: string;
  addedByAdminId: string;
  reason?: string;
}): Promise<AdminStaff> {
  try {
    return await db.transaction(async (client) => {
      const reason = (params.reason ?? '').trim();
      const candidate = await client.query<{ id: string; role: string; is_active: boolean }>(
        `SELECT id, role, is_active FROM users WHERE id = $1 FOR SHARE`,
        [params.userId],
      );
      const candidateRow = candidate.rows[0];
      if (!candidateRow || !candidateRow.is_active || !['admin', 'super_admin', 'dpo'].includes(candidateRow.role)) {
        throw createAppError('Select an active admin-tier account.', 400);
      }
      const roleRow = await client.query<{ name: string }>(
        `SELECT name FROM admin_roles WHERE id = $1 AND deleted_at IS NULL`,
        [params.roleId],
      );
      if (!roleRow.rows[0]) {
        throw createAppError('Selected staff profile is not active.', 400);
      }
      const result = await client.query<AdminStaff>(
        `INSERT INTO admin_staff (user_id, role_id)
         VALUES ($1, $2)
         RETURNING *`,
        [params.userId, params.roleId],
      );
      const member = result.rows[0];
      if (!member) throw new Error('Failed to add staff member.');

      await client.query(
        `INSERT INTO admin_actions
           (admin_id, action_type, target_type, target_id, details, reason, full_notes)
         VALUES ($1, 'staff_added', 'admin_staff', $2, $3::jsonb, $4, $5)`,
        [
          params.addedByAdminId,
          member.id,
          JSON.stringify({
            addedUserId: params.userId,
            addedRole: roleRow.rows[0]?.name ?? params.roleId,
            addedRoleId: params.roleId,
            accessSource: 'users.role and route RBAC',
          }),
          reason || 'Staff directory profile added.',
          reason || null,
        ],
      );
      logger.info('Admin staff member added', {
        userId: params.userId,
        roleId: params.roleId,
        addedByAdminId: params.addedByAdminId,
      });
      return member;
    });
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
  updatedByAdminId: string,
  reason: string,
): Promise<AdminStaff> {
  const trimmedReason = reason.trim();
  if (trimmedReason.length < 10) {
    throw createAppError('Reason must be at least 10 characters.', 400);
  }
  if (params.roleId === undefined && params.isActive === undefined) {
    throw createAppError('Role or active status is required.', 400);
  }

  return db.transaction(async (client) => {
    const current = await client.query<AdminStaff & { role_name: string }>(
      `SELECT ast.*, ar.name AS role_name
         FROM admin_staff ast
         JOIN admin_roles ar ON ar.id = ast.role_id
        WHERE ast.id = $1
        FOR UPDATE`,
      [staffId],
    );
    const before = current.rows[0];
    if (!before) throw createAppError('Staff member not found.', 404);

    let nextRoleName = before.role_name;
    if (params.roleId !== undefined) {
      const nextRole = await client.query<{ name: string }>(
        `SELECT name FROM admin_roles WHERE id = $1 AND deleted_at IS NULL`,
        [params.roleId],
      );
      if (!nextRole.rows[0]) throw createAppError('Selected staff profile is not active.', 400);
      nextRoleName = nextRole.rows[0].name;
    }

    const result = await client.query<AdminStaff>(
      `UPDATE admin_staff
          SET role_id = COALESCE($2::uuid, role_id),
              is_active = COALESCE($3::boolean, is_active),
              removed_at = CASE WHEN $3::boolean IS TRUE THEN NULL ELSE removed_at END,
              removed_by = CASE WHEN $3::boolean IS TRUE THEN NULL ELSE removed_by END,
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [staffId, params.roleId ?? null, params.isActive ?? null],
    );
    const member = result.rows[0];
    if (!member) throw createAppError('Staff member not found.', 404);

    await client.query(
      `INSERT INTO admin_actions
         (admin_id, action_type, target_type, target_id, details, reason, full_notes)
       VALUES ($1, 'config_changed', 'admin_staff', $2, $3::jsonb, $4, $5)`,
      [
        updatedByAdminId,
        staffId,
        JSON.stringify({
          changeKind: 'staff_directory_profile_updated',
          previousRole: before.role_name,
          newRole: nextRoleName,
          previousActive: before.is_active,
          newActive: params.isActive ?? before.is_active,
          accessSource: 'users.role and route RBAC',
        }),
        trimmedReason.slice(0, 500),
        trimmedReason,
      ],
    );
    logger.info('Admin staff directory profile updated', { staffId, updatedByAdminId });
    return member;
  });
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
export async function removeStaffMember(
  staffId: string,
  removedByAdminId: string,
  reason?: string,
): Promise<void> {
  const trimmedReason = (reason ?? '').trim();
  if (trimmedReason.length < 10) throw createAppError('Reason must be at least 10 characters.', 400);
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
         (admin_id, action_type, target_type, target_id, details, reason, full_notes)
       VALUES ($1, 'staff_removed', 'admin_staff', $2, $3::jsonb, $4, $5)`,
      [
        removedByAdminId,
        staffId,
        JSON.stringify({
          removedRole: staffRow.rows[0]!.role_name,
          softDeleted: true,
        }),
        trimmedReason || 'Staff directory profile archived.',
        trimmedReason || null,
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

/**
 * E01 / D15 (2026-05-02) — DPO role assignment.
 *
 * Promotes an existing user (typically already an admin or staff member)
 * to role='dpo'. Idempotent (no-op if already dpo). Refuses to promote
 * a non-existent user. Refuses to demote-then-promote a super_admin
 * (super_admins keep their role; DPO power is granted to super_admin
 * implicitly by requireDpoRole middleware).
 *
 * Writes admin_actions row with action_type='staff_role_promoted_dpo'
 * for the audit trail (NPC RA 10173 §28 evidentiary requirement).
 */
export async function promoteToDpo(
  targetUserId: string,
  promotedByAdminId: string,
  reason: string,
): Promise<{ userId: string; previousRole: string; newRole: 'dpo' }> {
  if (!targetUserId) throw createAppError('Target user ID is required.', 400);
  const trimmedReason = reason.trim();
  if (trimmedReason.length < 10) throw createAppError('Reason must be at least 10 characters.', 400);

  return db.transaction(async (client) => {
    const target = await client.query<{ id: string; role: string; is_active: boolean }>(
      `SELECT id, role, is_active FROM users WHERE id = $1 FOR UPDATE`,
      [targetUserId],
    );
    if (target.rows.length === 0) {
      throw createAppError('Target user not found.', 404);
    }
    const prev = target.rows[0]!;
    if (!prev.is_active) {
      throw createAppError('Cannot promote a deactivated user.', 409);
    }
    if (prev.role === 'super_admin') {
      throw createAppError(
        'Super admins already hold DPO authority via requireDpoRole. Demote to admin first if you want to formally assign the DPO role.',
        409,
      );
    }
    if (prev.role === 'dpo') {
      // Idempotent — return current state without writing an audit row.
      return { userId: prev.id, previousRole: 'dpo', newRole: 'dpo' as const };
    }

    // Serialize the singleton DPO seat without locking unrelated user rows.
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('onservice:dpo-seat'))`);
    const currentDpo = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE role = 'dpo' AND is_active = TRUE AND id != $1 LIMIT 1`,
      [prev.id],
    );
    if (currentDpo.rows[0]) {
      throw createAppError('An active DPO is already assigned. Complete the documented handover first.', 409);
    }

    await client.query(
      `UPDATE users SET role = 'dpo', updated_at = NOW() WHERE id = $1`,
      [prev.id],
    );

    await client.query(
      `INSERT INTO admin_actions
         (admin_id, action_type, target_type, target_id, details, reason, full_notes)
       VALUES ($1, 'staff_role_promoted_dpo', 'user', $2, $3::jsonb, $4, $5)`,
      [
        promotedByAdminId,
        prev.id,
        JSON.stringify({ previousRole: prev.role, newRole: 'dpo' }),
        trimmedReason.slice(0, 500),
        trimmedReason,
      ],
    );

    logger.info('User promoted to DPO', { targetUserId: prev.id, promotedByAdminId, previousRole: prev.role });
    return { userId: prev.id, previousRole: prev.role, newRole: 'dpo' as const };
  });
}

/**
 * Demotes a DPO back to plain admin. Refuses to demote a non-DPO.
 * Default fallback role is 'admin'; pass `demoteTo` to override (must
 * be one of: admin, customer, provider — never super_admin).
 *
 * Operationally there should be 0 or 1 DPO at any time per NPC §21;
 * the demote path is for handover (demote outgoing, then promote new).
 */
export async function demoteFromDpo(
  targetUserId: string,
  demotedByAdminId: string,
  reason: string,
  demoteTo: 'admin' | 'customer' | 'provider' = 'admin',
): Promise<{ userId: string; previousRole: 'dpo'; newRole: typeof demoteTo }> {
  if (!targetUserId) throw createAppError('Target user ID is required.', 400);
  const trimmedReason = reason.trim();
  if (trimmedReason.length < 10) throw createAppError('Reason must be at least 10 characters.', 400);
  if (!['admin', 'customer', 'provider'].includes(demoteTo)) {
    throw createAppError('Invalid demoteTo role.', 400);
  }

  return db.transaction(async (client) => {
    const target = await client.query<{ id: string; role: string }>(
      `SELECT id, role FROM users WHERE id = $1 FOR UPDATE`,
      [targetUserId],
    );
    if (target.rows.length === 0) {
      throw createAppError('Target user not found.', 404);
    }
    const prev = target.rows[0]!;
    if (prev.role !== 'dpo') {
      throw createAppError('Target user is not currently a DPO.', 409);
    }

    await client.query(
      `UPDATE users SET role = $2, updated_at = NOW() WHERE id = $1`,
      [prev.id, demoteTo],
    );

    await client.query(
      `INSERT INTO admin_actions
         (admin_id, action_type, target_type, target_id, details, reason, full_notes)
       VALUES ($1, 'staff_role_demoted_from_dpo', 'user', $2, $3::jsonb, $4, $5)`,
      [
        demotedByAdminId,
        prev.id,
        JSON.stringify({ previousRole: 'dpo', newRole: demoteTo }),
        trimmedReason.slice(0, 500),
        trimmedReason,
      ],
    );

    logger.info('User demoted from DPO', { targetUserId: prev.id, demotedByAdminId, newRole: demoteTo });
    return { userId: prev.id, previousRole: 'dpo' as const, newRole: demoteTo };
  });
}

/**
 * Returns the current DPO user(s). Operationally there should be 0
 * or 1; if 0 the runbook calls for super_admin to act as fallback DPO.
 */
export async function listDpos(): Promise<Array<{ id: string; email: string | null; firstName: string; lastName: string; promotedAt: string | null }>> {
  const result = await db.query<{
    id: string;
    email: string | null;
    first_name: string;
    last_name: string;
    promoted_at: string | null;
  }>(
    `SELECT u.id, u.email, u.first_name, u.last_name,
            (SELECT MAX(aa.created_at) FROM admin_actions aa
             WHERE aa.target_id = u.id
               AND aa.action_type = 'staff_role_promoted_dpo') AS promoted_at
     FROM users u
     WHERE u.role = 'dpo' AND u.is_active = TRUE
     ORDER BY u.created_at`,
  );
  return result.rows.map((r) => ({
    id: r.id,
    email: r.email,
    firstName: r.first_name,
    lastName: r.last_name,
    promotedAt: r.promoted_at,
  }));
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
