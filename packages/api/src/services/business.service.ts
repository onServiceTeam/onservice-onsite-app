import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import * as notificationService from './notification.service';

interface BusinessAccountRow {
  id: string;
  company_name: string;
  business_type: string;
  registration_number: string | null;
  tax_id: string | null;
  billing_address: string;
  barangay: string;
  city: string;
  province: string;
  contact_person: string;
  contact_email: string;
  contact_phone: string;
  account_manager_id: string | null;
  owner_user_id: string;
  status: string;
  payment_terms: string;
  volume_discount_rate: string;
  monthly_credit_limit: number;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

interface BusinessMemberRow {
  id: string;
  business_account_id: string;
  user_id: string;
  role: string;
  can_book: boolean;
  can_approve: boolean;
  can_view_invoices: boolean;
  invited_by: string | null;
  created_at: Date;
}

interface BusinessContractRow {
  id: string;
  business_account_id: string;
  category_id: string;
  subcategory_id: string | null;
  provider_id: string | null;
  contract_type: string;
  frequency: string | null;
  agreed_rate: number;
  discount_percentage: string;
  estimated_monthly_value: number;
  start_date: string;
  end_date: string | null;
  auto_renew: boolean;
  status: string;
  terms: string | null;
  created_at: Date;
  updated_at: Date;
}

interface CountRow { count: string }

interface CreateBusinessParams {
  companyName: string;
  businessType: string;
  registrationNumber?: string;
  taxId?: string;
  billingAddress: string;
  barangay: string;
  city: string;
  province: string;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  ownerUserId: string;
  paymentTerms?: string;
  notes?: string;
}

interface CreateContractParams {
  businessAccountId: string;
  categoryId: string;
  subcategoryId?: string;
  providerId?: string;
  contractType: 'recurring' | 'on_demand';
  frequency?: string;
  agreedRate: number;
  discountPercentage?: number;
  estimatedMonthlyValue?: number;
  startDate: string;
  endDate?: string;
  autoRenew?: boolean;
  terms?: string;
}

export async function createBusinessAccount(
  params: CreateBusinessParams,
): Promise<BusinessAccountRow> {
  // BUG-PHASE192-01 fix — pre-fix the route had no Zod validator and
  // the service had no length validation. company_name VARCHAR(200),
  // contact_person VARCHAR(200), contact_email VARCHAR(255),
  // registration_number VARCHAR(100), tax_id VARCHAR(50),
  // contact_phone VARCHAR(20) would Postgres-5xx on overlong;
  // billing_address TEXT, notes TEXT are unbounded. Same defense-in-
  // depth pattern as Phase 152-168 + 179-181 + 188-191.
  if (params.companyName.length > 200) {
    throw createAppError('companyName must be ≤ 200 characters.', 400);
  }
  if (params.contactPerson.length > 200) {
    throw createAppError('contactPerson must be ≤ 200 characters.', 400);
  }
  if (params.contactEmail.length > 255) {
    throw createAppError('contactEmail must be ≤ 255 characters.', 400);
  }
  if (params.registrationNumber !== undefined && params.registrationNumber.length > 100) {
    throw createAppError('registrationNumber must be ≤ 100 characters.', 400);
  }
  if (params.taxId !== undefined && params.taxId.length > 50) {
    throw createAppError('taxId must be ≤ 50 characters.', 400);
  }
  if (params.contactPhone.length > 20) {
    throw createAppError('contactPhone must be ≤ 20 characters.', 400);
  }
  if (params.billingAddress.length > 1000) {
    throw createAppError('billingAddress must be ≤ 1000 characters.', 400);
  }
  if (params.notes !== undefined && params.notes.length > 5000) {
    throw createAppError('notes must be ≤ 5000 characters.', 400);
  }

  // MED-N38 fix: pre-fix ran two separate top-level db.query calls.
  // If the second (business_members owner row) failed (FK violation
  // on user_id, etc.), the business_accounts row was already
  // committed with NO owner — orphan account that no one could
  // access. Single-transaction wrap rolls back the account row if
  // the owner-member INSERT throws.
  return db.transaction(async (client) => {
    const result = await client.query<BusinessAccountRow>(
      `INSERT INTO business_accounts (
        company_name, business_type, registration_number, tax_id,
        billing_address, barangay, city, province,
        contact_person, contact_email, contact_phone,
        owner_user_id, payment_terms, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        params.companyName, params.businessType,
        params.registrationNumber ?? null, params.taxId ?? null,
        params.billingAddress, params.barangay, params.city, params.province,
        params.contactPerson, params.contactEmail, params.contactPhone,
        params.ownerUserId,
        params.paymentTerms ?? 'net_30',
        params.notes ?? null,
      ],
    );

    await client.query(
      `INSERT INTO business_members (business_account_id, user_id, role, can_book, can_approve, can_view_invoices)
       VALUES ($1, $2, 'owner', TRUE, TRUE, TRUE)`,
      [result.rows[0]!.id, params.ownerUserId],
    );

    logger.info('Business account created', {
      businessId: result.rows[0]!.id,
      companyName: params.companyName,
      ownerUserId: params.ownerUserId,
    });

    return result.rows[0]!;
  });
}

export async function getBusinessAccount(
  businessId: string,
  userId: string,
): Promise<BusinessAccountRow> {
  const member = await db.query(
    `SELECT 1 FROM business_members WHERE business_account_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [businessId, userId],
  );

  if (member.rows.length === 0) {
    throw createAppError('Business account not found or access denied.', 404);
  }

  const result = await db.query<BusinessAccountRow>(
    `SELECT * FROM business_accounts WHERE id = $1`,
    [businessId],
  );

  if (result.rows.length === 0) {
    throw createAppError('Business account not found.', 404);
  }

  return result.rows[0]!;
}

export async function getUserBusinessAccounts(
  userId: string,
  page = 1,
  pageSize = 20,
): Promise<{ items: BusinessAccountRow[]; total: number }> {
  const offset = (page - 1) * pageSize;

  const [dataResult, countResult] = await Promise.all([
    db.query<BusinessAccountRow>(
      `SELECT ba.* FROM business_accounts ba
       INNER JOIN business_members bm ON ba.id = bm.business_account_id
       WHERE bm.user_id = $1 AND bm.deleted_at IS NULL
       ORDER BY ba.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, pageSize, offset],
    ),
    db.query<CountRow>(
      `SELECT COUNT(*)::text as count FROM business_members WHERE user_id = $1 AND deleted_at IS NULL`,
      [userId],
    ),
  ]);

  return {
    items: dataResult.rows,
    total: Number(countResult.rows[0]?.count ?? 0),
  };
}

export async function updateBusinessAccount(
  businessId: string,
  userId: string,
  updates: Partial<CreateBusinessParams>,
): Promise<BusinessAccountRow> {
  const member = await db.query<BusinessMemberRow>(
    `SELECT role FROM business_members WHERE business_account_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [businessId, userId],
  );

  if (member.rows.length === 0 || !['owner', 'manager'].includes(member.rows[0]!.role)) {
    throw createAppError('Only owners and managers can update the business account.', 403);
  }

  const setClauses: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  const fieldMap: Record<string, string> = {
    companyName: 'company_name',
    businessType: 'business_type',
    registrationNumber: 'registration_number',
    taxId: 'tax_id',
    billingAddress: 'billing_address',
    barangay: 'barangay',
    city: 'city',
    province: 'province',
    contactPerson: 'contact_person',
    contactEmail: 'contact_email',
    contactPhone: 'contact_phone',
    paymentTerms: 'payment_terms',
    notes: 'notes',
  };

  for (const [key, column] of Object.entries(fieldMap)) {
    const value = updates[key as keyof CreateBusinessParams];
    if (value !== undefined) {
      setClauses.push(`${column} = $${idx}`);
      params.push(value);
      idx++;
    }
  }

  if (setClauses.length === 0) {
    throw createAppError('No fields to update.', 400);
  }

  setClauses.push('updated_at = NOW()');
  params.push(businessId);

  const result = await db.query<BusinessAccountRow>(
    `UPDATE business_accounts SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
    params,
  );

  if (result.rows.length === 0) {
    throw createAppError('Business account not found.', 404);
  }

  return result.rows[0]!;
}

export async function addMember(
  businessId: string,
  inviterId: string,
  targetUserId: string,
  role: string,
  permissions: { canBook?: boolean; canApprove?: boolean; canViewInvoices?: boolean },
): Promise<BusinessMemberRow> {
  const inviter = await db.query<BusinessMemberRow>(
    `SELECT role FROM business_members WHERE business_account_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [businessId, inviterId],
  );

  if (inviter.rows.length === 0 || !['owner', 'manager'].includes(inviter.rows[0]!.role)) {
    throw createAppError('Only owners and managers can add members.', 403);
  }

  if (role === 'owner' && inviter.rows[0]!.role !== 'owner') {
    throw createAppError('Only owners can assign the owner role.', 403);
  }

  // MED-N40 fix: pre-validate the target user exists. Pre-fix
  // relied on the FK constraint to fail; admin saw a raw 23503
  // SQL error instead of a friendly 404.
  // BUG-PHASE28-02 fix: `users.deleted_at` doesn't exist — the soft-delete
  // signal on users is `is_active=FALSE` (see users schema). Pre-fix this
  // query 500'd with "column deleted_at does not exist", so adding any
  // member to a business account always returned 500. Now: gate on
  // is_active = TRUE.
  const userExists = await db.query(
    `SELECT 1 FROM users WHERE id = $1 AND is_active = TRUE`,
    [targetUserId],
  );
  if (userExists.rows.length === 0) {
    throw createAppError('Target user not found.', 404);
  }

  // MED-N39 fix: pre-fix used ON CONFLICT DO NOTHING which
  // silently no-op'd when a soft-deleted row already existed for
  // (business_account_id, user_id). The function then threw "User
  // is already a member" — confusing and incorrect (the user was
  // a former member, not a current one). Now: UPDATE the existing
  // row to clear deleted_at + reset role/permissions, preserving
  // the audit trail (deleted_by, deleted_reason). For never-
  // existed pairs, the same statement INSERTs.
  // BUG-PHASE28-03 fix: business_members has no `updated_at` column.
  // Pre-fix the upsert's `updated_at = NOW()` clause crashed every
  // re-add of a previously-removed member with "column updated_at does
  // not exist". Same-shape impact: every POST /:id/members 500'd in
  // production. Fix: drop the updated_at SET clause; if the table needs
  // an updated_at later, add it via migration first.
  const result = await db.query<BusinessMemberRow>(
    `INSERT INTO business_members (
      business_account_id, user_id, role, can_book, can_approve, can_view_invoices, invited_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (business_account_id, user_id) DO UPDATE
    SET
      role = EXCLUDED.role,
      can_book = EXCLUDED.can_book,
      can_approve = EXCLUDED.can_approve,
      can_view_invoices = EXCLUDED.can_view_invoices,
      invited_by = EXCLUDED.invited_by,
      deleted_at = NULL
    WHERE business_members.deleted_at IS NOT NULL
    RETURNING *`,
    [
      businessId, targetUserId, role,
      permissions.canBook ?? true,
      permissions.canApprove ?? false,
      permissions.canViewInvoices ?? false,
      inviterId,
    ],
  );

  if (result.rows.length === 0) {
    // The conflict matched a row whose deleted_at IS NULL — i.e.,
    // they are a current active member, so the WHERE clause on
    // the UPDATE branch matched 0 rows and nothing was returned.
    throw createAppError('User is already a member of this business.', 409);
  }

  const account = await db.query<{ company_name: string }>(
    `SELECT company_name FROM business_accounts WHERE id = $1`,
    [businessId],
  );

  await notificationService.createNotification({
    userId: targetUserId,
    type: 'business_update',
    title: 'Business Account Invitation',
    body: `You have been added to ${account.rows[0]?.company_name ?? 'a business account'} as a ${role}.`,
    data: { businessAccountId: businessId, role },
  });

  logger.info('Business member added', { businessId, targetUserId, role, inviterId });
  return result.rows[0]!;
}

export async function removeMember(
  businessId: string,
  requesterId: string,
  targetUserId: string,
  reason?: string,
): Promise<void> {
  // BUG-PHASE162-01 fix — pre-fix reason had no length cap. Column
  // is TEXT (deleted_reason from migration 076; unbounded by Postgres).
  // Same defense-in-depth pattern as Phase 152-161. Cap at 1000.
  if (reason !== undefined && typeof reason === 'string' && reason.length > 1000) {
    throw createAppError('reason must be ≤ 1000 characters.', 400);
  }
  // Phase 14 Dispatch 06 — Bug 105. Pre-D06 this was a hard DELETE with
  // NO admin_actions audit. Now: soft delete (deleted_at/deleted_by/
  // deleted_reason from migration 076) + admin_actions audit in ONE
  // transaction. The audit row's target_id FK to business_members
  // remains valid because the row still exists, just with deleted_at set.
  await db.transaction(async (client) => {
    const requester = await client.query<BusinessMemberRow & { deleted_at: Date | null }>(
      `SELECT id, role, deleted_at FROM business_members
        WHERE business_account_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [businessId, requesterId],
    );

    if (requester.rows.length === 0 || !['owner', 'manager'].includes(requester.rows[0]!.role)) {
      throw createAppError('Only owners and managers can remove members.', 403);
    }

    const target = await client.query<BusinessMemberRow & { deleted_at: Date | null }>(
      `SELECT id, role, deleted_at FROM business_members
        WHERE business_account_id = $1 AND user_id = $2`,
      [businessId, targetUserId],
    );

    if (target.rows.length === 0) {
      throw createAppError('Member not found.', 404);
    }

    if (target.rows[0]!.deleted_at) {
      throw createAppError('Member has already been removed.', 409);
    }

    if (target.rows[0]!.role === 'owner') {
      throw createAppError('Cannot remove the owner. Transfer ownership first.', 403);
    }

    const trimmedReason = (reason ?? '').trim();
    await client.query(
      `UPDATE business_members
          SET deleted_at = NOW(),
              deleted_by = $3,
              deleted_reason = $4
        WHERE business_account_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [businessId, targetUserId, requesterId, trimmedReason || null],
    );

    const memberRowId = target.rows[0]!.id;
    const auditResult = await client.query<{ id: string }>(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, reason, full_notes)
       VALUES ($1, 'business_member_removed', 'business', $2, $3::jsonb, $4, $5)
       RETURNING id`,
      [
        requesterId,
        businessId,
        JSON.stringify({
          memberRowId,
          removedUserId: targetUserId,
          removedRole: target.rows[0]!.role,
          requesterRole: requester.rows[0]!.role,
        }),
        trimmedReason ? trimmedReason.slice(0, 500) : `Member removed by ${requester.rows[0]!.role}`,
        trimmedReason || null,
      ],
    );
    if (!auditResult.rows[0]?.id) {
      throw createAppError('Failed to record business_member_removed audit.', 500);
    }
  });

  logger.info('Business member removed', { businessId, targetUserId, requesterId });
}

/**
 * Phase 14 Dispatch 06 — Bug 106. Transfer business ownership from one
 * member to another. The audit found this as a planned-but-not-implemented
 * feature: `removeMember` blocks owner removal with the message
 * "Transfer ownership first" but the transfer function itself was missing.
 *
 * Implements the D06 transactional pattern: UPDATE business_accounts.owner_user_id
 * + UPDATE current owner's role to 'manager' + UPDATE new owner's row to
 * role 'owner' + INSERT admin_actions audit, all in ONE transaction.
 *
 * Authorization: only the current owner can transfer ownership.
 */
export async function transferOwnership(
  businessId: string,
  requesterId: string,
  newOwnerUserId: string,
  reason?: string,
): Promise<void> {
  if (newOwnerUserId === requesterId) {
    throw createAppError('Cannot transfer ownership to yourself.', 400);
  }
  // BUG-PHASE162-01 fix — pre-fix reason had no length cap. Same
  // defense-in-depth pattern as Phase 152-161. Cap at 1000.
  if (reason !== undefined && typeof reason === 'string' && reason.length > 1000) {
    throw createAppError('reason must be ≤ 1000 characters.', 400);
  }

  await db.transaction(async (client) => {
    const account = await client.query<{ id: string; owner_user_id: string }>(
      `SELECT id, owner_user_id FROM business_accounts WHERE id = $1 FOR UPDATE`,
      [businessId],
    );
    if (account.rows.length === 0) throw createAppError('Business account not found.', 404);
    const currentOwnerUserId = account.rows[0]!.owner_user_id;

    if (currentOwnerUserId !== requesterId) {
      throw createAppError('Only the current owner can transfer ownership.', 403);
    }

    const newOwnerMember = await client.query<{ id: string; role: string; deleted_at: Date | null }>(
      `SELECT id, role, deleted_at FROM business_members
        WHERE business_account_id = $1 AND user_id = $2`,
      [businessId, newOwnerUserId],
    );
    if (newOwnerMember.rows.length === 0 || newOwnerMember.rows[0]!.deleted_at) {
      throw createAppError('New owner is not an active member of this business.', 404);
    }

    const oldOwnerMember = await client.query<{ id: string }>(
      `SELECT id FROM business_members
        WHERE business_account_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [businessId, currentOwnerUserId],
    );
    if (oldOwnerMember.rows.length === 0) {
      // Defensive: business_accounts.owner_user_id should always have a
      // matching active business_members row, but if somehow it doesn't
      // we can't transfer cleanly.
      throw createAppError('Current owner is not a member of this business — data integrity issue.', 500);
    }

    // Demote old owner to manager.
    await client.query(
      `UPDATE business_members
          SET role = 'manager', can_approve = TRUE
        WHERE business_account_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [businessId, currentOwnerUserId],
    );

    // Promote new owner.
    await client.query(
      `UPDATE business_members
          SET role = 'owner', can_book = TRUE, can_approve = TRUE, can_view_invoices = TRUE
        WHERE business_account_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [businessId, newOwnerUserId],
    );

    // Update business_accounts.owner_user_id pointer.
    await client.query(
      `UPDATE business_accounts SET owner_user_id = $2, updated_at = NOW() WHERE id = $1`,
      [businessId, newOwnerUserId],
    );

    const trimmedReason = (reason ?? '').trim();
    const auditResult = await client.query<{ id: string }>(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, reason, full_notes)
       VALUES ($1, 'business_ownership_transferred', 'business', $2, $3::jsonb, $4, $5)
       RETURNING id`,
      [
        requesterId,
        businessId,
        JSON.stringify({
          oldOwnerUserId: currentOwnerUserId,
          newOwnerUserId,
          oldOwnerMemberRowId: oldOwnerMember.rows[0]!.id,
          newOwnerMemberRowId: newOwnerMember.rows[0]!.id,
        }),
        trimmedReason ? trimmedReason.slice(0, 500) : 'Ownership transferred by current owner',
        trimmedReason || null,
      ],
    );
    if (!auditResult.rows[0]?.id) {
      throw createAppError('Failed to record business_ownership_transferred audit.', 500);
    }
  });

  logger.info('Business ownership transferred', { businessId, oldOwner: requesterId, newOwner: newOwnerUserId });
}

export async function getMembers(
  businessId: string,
  userId: string,
): Promise<Array<BusinessMemberRow & { first_name: string; last_name: string; email: string }>> {
  const member = await db.query(
    `SELECT 1 FROM business_members WHERE business_account_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [businessId, userId],
  );

  if (member.rows.length === 0) {
    throw createAppError('Access denied.', 403);
  }

  const result = await db.query<BusinessMemberRow & { first_name: string; last_name: string; email: string }>(
    `SELECT bm.*, u.first_name, u.last_name, u.email
     FROM business_members bm
     INNER JOIN users u ON bm.user_id = u.id
     WHERE bm.business_account_id = $1 AND bm.deleted_at IS NULL
     ORDER BY CASE bm.role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, bm.created_at ASC`,
    [businessId],
  );

  return result.rows;
}

export async function createContract(
  params: CreateContractParams,
  userId: string,
): Promise<BusinessContractRow> {
  const member = await db.query<BusinessMemberRow>(
    `SELECT role, can_approve FROM business_members
     WHERE business_account_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [params.businessAccountId, userId],
  );

  if (member.rows.length === 0 || (!member.rows[0]!.can_approve && member.rows[0]!.role === 'member')) {
    throw createAppError('You do not have permission to create contracts.', 403);
  }

  const result = await db.query<BusinessContractRow>(
    `INSERT INTO business_contracts (
      business_account_id, category_id, subcategory_id, provider_id,
      contract_type, frequency, agreed_rate, discount_percentage,
      estimated_monthly_value, start_date, end_date, auto_renew, terms
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *`,
    [
      params.businessAccountId, params.categoryId,
      params.subcategoryId ?? null, params.providerId ?? null,
      params.contractType, params.frequency ?? null,
      params.agreedRate, params.discountPercentage ?? 0,
      params.estimatedMonthlyValue ?? 0,
      params.startDate, params.endDate ?? null,
      params.autoRenew ?? true, params.terms ?? null,
    ],
  );

  logger.info('Business contract created', {
    contractId: result.rows[0]!.id,
    businessAccountId: params.businessAccountId,
  });

  return result.rows[0]!;
}

export async function getContracts(
  businessId: string,
  userId: string,
  page = 1,
  pageSize = 20,
): Promise<{ items: BusinessContractRow[]; total: number }> {
  const member = await db.query(
    `SELECT 1 FROM business_members WHERE business_account_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [businessId, userId],
  );

  if (member.rows.length === 0) {
    throw createAppError('Access denied.', 403);
  }

  const offset = (page - 1) * pageSize;

  const [dataResult, countResult] = await Promise.all([
    db.query<BusinessContractRow>(
      `SELECT bc.* FROM business_contracts bc
       WHERE bc.business_account_id = $1
       ORDER BY bc.status ASC, bc.start_date DESC
       LIMIT $2 OFFSET $3`,
      [businessId, pageSize, offset],
    ),
    db.query<CountRow>(
      `SELECT COUNT(*)::text as count FROM business_contracts WHERE business_account_id = $1`,
      [businessId],
    ),
  ]);

  return {
    items: dataResult.rows,
    total: Number(countResult.rows[0]?.count ?? 0),
  };
}

// Phase 200 — contract-rate resolver. Given a booking being placed for a
// business account, find the active contract whose negotiated agreed_rate
// should price it. Returns null (→ normal catalog pricing) unless ALL hold:
//   - the customer is a current member of the account,
//   - the account is active,
//   - a contract is active and within its start/end dates,
//   - the contract's category matches the booking's category.
// A contract that names the exact subcategory wins over a category-level
// contract; ties break on the most recently started contract. Dates compared
// in Asia/Manila (contracts are stored as DATE). See
// .ai-coder/decisions/D-phase200-contract-pricing.md for the pricing rules.
export async function resolveBookingContract(
  customerId: string,
  businessAccountId: string,
  categoryId: string,
  subcategoryId: string | null,
): Promise<{ contractId: string; agreedRate: number } | null> {
  const result = await db.query<{ id: string; agreed_rate: number }>(
    `SELECT bc.id, bc.agreed_rate
       FROM business_contracts bc
       JOIN business_accounts ba ON ba.id = bc.business_account_id
       JOIN business_members bm ON bm.business_account_id = ba.id
      WHERE bc.business_account_id = $1
        AND bm.user_id = $2 AND bm.deleted_at IS NULL
        AND ba.status = 'active'
        AND bc.status = 'active'
        AND bc.category_id = $3
        AND (bc.subcategory_id IS NULL OR bc.subcategory_id = $4)
        AND bc.start_date <= (NOW() AT TIME ZONE 'Asia/Manila')::date
        AND (bc.end_date IS NULL OR bc.end_date >= (NOW() AT TIME ZONE 'Asia/Manila')::date)
      ORDER BY CASE WHEN bc.subcategory_id = $4 THEN 0 ELSE 1 END, bc.start_date DESC
      LIMIT 1`,
    [businessAccountId, customerId, categoryId, subcategoryId],
  );
  if (result.rows.length === 0) return null;
  return { contractId: result.rows[0]!.id, agreedRate: Number(result.rows[0]!.agreed_rate) };
}

// Phase 200 — admin read variants. The owner-facing getters above require
// the caller to be a member of the account. Admin/super-admin staff are not
// members, so these mirror the same data queries WITHOUT the membership gate
// (route-level requireAdmin enforces access). Used by the admin B2B detail
// page so back-office staff can view any account's members and contracts.
export async function getBusinessAccountAdmin(businessId: string): Promise<BusinessAccountRow> {
  const result = await db.query<BusinessAccountRow>(
    `SELECT * FROM business_accounts WHERE id = $1`,
    [businessId],
  );
  if (result.rows.length === 0) throw createAppError('Business account not found.', 404);
  return result.rows[0]!;
}

export async function getMembersAdmin(
  businessId: string,
): Promise<Array<BusinessMemberRow & { first_name: string; last_name: string; email: string }>> {
  const result = await db.query<BusinessMemberRow & { first_name: string; last_name: string; email: string }>(
    `SELECT bm.*, u.first_name, u.last_name, u.email
     FROM business_members bm
     INNER JOIN users u ON bm.user_id = u.id
     WHERE bm.business_account_id = $1 AND bm.deleted_at IS NULL
     ORDER BY CASE bm.role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, bm.created_at ASC`,
    [businessId],
  );
  return result.rows;
}

export async function getContractsAdmin(
  businessId: string,
  page = 1,
  pageSize = 20,
): Promise<{ items: BusinessContractRow[]; total: number }> {
  const offset = (page - 1) * pageSize;
  const [dataResult, countResult] = await Promise.all([
    db.query<BusinessContractRow>(
      `SELECT bc.* FROM business_contracts bc
       WHERE bc.business_account_id = $1
       ORDER BY bc.status ASC, bc.start_date DESC
       LIMIT $2 OFFSET $3`,
      [businessId, pageSize, offset],
    ),
    db.query<CountRow>(
      `SELECT COUNT(*)::text as count FROM business_contracts WHERE business_account_id = $1`,
      [businessId],
    ),
  ]);
  return { items: dataResult.rows, total: Number(countResult.rows[0]?.count ?? 0) };
}

// MED-N41 fix: status type was 'active' | 'cancelled' only. The
// underlying DB CHECK constraint accepts the full lifecycle —
// 'draft' | 'active' | 'expired' | 'cancelled' — and the
// admin / business-owner UI needs at least 'expired' to mark
// contracts whose end_date has passed (until a worker job
// auto-expires them in v1.2). Widened the param type to match
// the CHECK; runtime guard rejects invalid values with 400.
//
// The `auto_renew` flag on business_contracts is currently a
// UI-only marker — there is no scheduler implementation that
// renews contracts based on it. v1.2 backlog item.
export type BusinessContractStatus = 'draft' | 'active' | 'expired' | 'cancelled';

const ALLOWED_CONTRACT_STATUSES = new Set<BusinessContractStatus>([
  'draft', 'active', 'expired', 'cancelled',
]);

export async function updateContractStatus(
  contractId: string,
  userId: string,
  status: BusinessContractStatus,
): Promise<BusinessContractRow> {
  if (!ALLOWED_CONTRACT_STATUSES.has(status)) {
    throw createAppError(
      `Invalid status "${status}". Allowed: ${Array.from(ALLOWED_CONTRACT_STATUSES).join(', ')}.`,
      400,
    );
  }

  const contract = await db.query<BusinessContractRow & { business_account_id: string }>(
    `SELECT * FROM business_contracts WHERE id = $1`,
    [contractId],
  );

  if (contract.rows.length === 0) {
    throw createAppError('Contract not found.', 404);
  }

  const member = await db.query<BusinessMemberRow>(
    `SELECT role, can_approve FROM business_members
     WHERE business_account_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [contract.rows[0]!.business_account_id, userId],
  );

  if (member.rows.length === 0 || (!member.rows[0]!.can_approve && member.rows[0]!.role === 'member')) {
    throw createAppError('You do not have permission to update contracts.', 403);
  }

  const result = await db.query<BusinessContractRow>(
    `UPDATE business_contracts SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [status, contractId],
  );

  return result.rows[0]!;
}

export function formatBusinessAccount(ba: BusinessAccountRow): Record<string, unknown> {
  return {
    id: ba.id,
    companyName: ba.company_name,
    businessType: ba.business_type,
    registrationNumber: ba.registration_number,
    taxId: ba.tax_id,
    billingAddress: ba.billing_address,
    barangay: ba.barangay,
    city: ba.city,
    province: ba.province,
    contactPerson: ba.contact_person,
    contactEmail: ba.contact_email,
    contactPhone: ba.contact_phone,
    accountManagerId: ba.account_manager_id,
    ownerUserId: ba.owner_user_id,
    status: ba.status,
    paymentTerms: ba.payment_terms,
    volumeDiscountRate: Number(ba.volume_discount_rate),
    monthlyCreditLimit: ba.monthly_credit_limit,
    notes: ba.notes,
    createdAt: ba.created_at,
    updatedAt: ba.updated_at,
  };
}

export function formatMember(m: BusinessMemberRow & { first_name?: string; last_name?: string; email?: string }): Record<string, unknown> {
  return {
    id: m.id,
    businessAccountId: m.business_account_id,
    userId: m.user_id,
    role: m.role,
    canBook: m.can_book,
    canApprove: m.can_approve,
    canViewInvoices: m.can_view_invoices,
    invitedBy: m.invited_by,
    firstName: m.first_name ?? null,
    lastName: m.last_name ?? null,
    email: m.email ?? null,
    createdAt: m.created_at,
  };
}

export function formatContract(c: BusinessContractRow): Record<string, unknown> {
  return {
    id: c.id,
    businessAccountId: c.business_account_id,
    categoryId: c.category_id,
    subcategoryId: c.subcategory_id,
    providerId: c.provider_id,
    contractType: c.contract_type,
    frequency: c.frequency,
    agreedRate: c.agreed_rate,
    discountPercentage: Number(c.discount_percentage),
    estimatedMonthlyValue: c.estimated_monthly_value,
    startDate: c.start_date,
    endDate: c.end_date,
    autoRenew: c.auto_renew,
    status: c.status,
    terms: c.terms,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  };
}
