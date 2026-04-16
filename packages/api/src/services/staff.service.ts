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
  const result = await db.query<AdminRole>(
    `SELECT ar.*,
            (SELECT COUNT(*) FROM admin_staff ast WHERE ast.role_id = ar.id AND ast.is_active = TRUE) AS staff_count
     FROM admin_roles ar
     ORDER BY ar.name`,
  );
  return result.rows;
}

export async function getRoleById(roleId: string): Promise<AdminRole | null> {
  const result = await db.query<AdminRole>(
    `SELECT * FROM admin_roles WHERE id = $1`,
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

export async function deleteRole(roleId: string): Promise<void> {
  const existing = await getRoleById(roleId);
  if (!existing) throw createAppError('Role not found.', 404);
  if (existing.name === 'super_admin') {
    throw createAppError('The super_admin role cannot be deleted.', 403);
  }
  const staffCount = await db.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM admin_staff WHERE role_id = $1`,
    [roleId],
  );
  if (parseInt(staffCount.rows[0]?.count ?? '0', 10) > 0) {
    throw createAppError('Cannot delete a role that has staff members assigned.', 409);
  }
  await db.query(`DELETE FROM admin_roles WHERE id = $1`, [roleId]);
  logger.info('Admin role deleted', { roleId });
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

export async function removeStaffMember(staffId: string): Promise<void> {
  // Prevent removing the last active super_admin
  const staffRow = await db.query<{ role_name: string }>(
    `SELECT ar.name AS role_name FROM admin_staff ast
     JOIN admin_roles ar ON ast.role_id = ar.id
     WHERE ast.id = $1`,
    [staffId],
  );
  if (staffRow.rows[0]?.role_name === 'super_admin') {
    const superCount = await db.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM admin_staff ast
       JOIN admin_roles ar ON ast.role_id = ar.id
       WHERE ar.name = 'super_admin' AND ast.is_active = TRUE AND ast.id != $1`,
      [staffId],
    );
    if (parseInt(superCount.rows[0]?.count ?? '0', 10) === 0) {
      throw createAppError('Cannot remove the last active super admin.', 409);
    }
  }
  await db.query(`DELETE FROM admin_staff WHERE id = $1`, [staffId]);
  logger.info('Admin staff removed', { staffId });
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
