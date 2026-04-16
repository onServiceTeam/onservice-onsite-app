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
  const result = await db.query<BusinessAccountRow>(
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

  await db.query(
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
}

export async function getBusinessAccount(
  businessId: string,
  userId: string,
): Promise<BusinessAccountRow> {
  const member = await db.query(
    `SELECT 1 FROM business_members WHERE business_account_id = $1 AND user_id = $2`,
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
       WHERE bm.user_id = $1
       ORDER BY ba.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, pageSize, offset],
    ),
    db.query<CountRow>(
      `SELECT COUNT(*)::text as count FROM business_members WHERE user_id = $1`,
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
    `SELECT role FROM business_members WHERE business_account_id = $1 AND user_id = $2`,
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
    `SELECT role FROM business_members WHERE business_account_id = $1 AND user_id = $2`,
    [businessId, inviterId],
  );

  if (inviter.rows.length === 0 || !['owner', 'manager'].includes(inviter.rows[0]!.role)) {
    throw createAppError('Only owners and managers can add members.', 403);
  }

  if (role === 'owner' && inviter.rows[0]!.role !== 'owner') {
    throw createAppError('Only owners can assign the owner role.', 403);
  }

  const result = await db.query<BusinessMemberRow>(
    `INSERT INTO business_members (
      business_account_id, user_id, role, can_book, can_approve, can_view_invoices, invited_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (business_account_id, user_id) DO NOTHING
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
): Promise<void> {
  const requester = await db.query<BusinessMemberRow>(
    `SELECT role FROM business_members WHERE business_account_id = $1 AND user_id = $2`,
    [businessId, requesterId],
  );

  if (requester.rows.length === 0 || !['owner', 'manager'].includes(requester.rows[0]!.role)) {
    throw createAppError('Only owners and managers can remove members.', 403);
  }

  const target = await db.query<BusinessMemberRow>(
    `SELECT role FROM business_members WHERE business_account_id = $1 AND user_id = $2`,
    [businessId, targetUserId],
  );

  if (target.rows.length === 0) {
    throw createAppError('Member not found.', 404);
  }

  if (target.rows[0]!.role === 'owner') {
    throw createAppError('Cannot remove the owner. Transfer ownership first.', 403);
  }

  await db.query(
    `DELETE FROM business_members WHERE business_account_id = $1 AND user_id = $2`,
    [businessId, targetUserId],
  );

  logger.info('Business member removed', { businessId, targetUserId, requesterId });
}

export async function getMembers(
  businessId: string,
  userId: string,
): Promise<Array<BusinessMemberRow & { first_name: string; last_name: string; email: string }>> {
  const member = await db.query(
    `SELECT 1 FROM business_members WHERE business_account_id = $1 AND user_id = $2`,
    [businessId, userId],
  );

  if (member.rows.length === 0) {
    throw createAppError('Access denied.', 403);
  }

  const result = await db.query<BusinessMemberRow & { first_name: string; last_name: string; email: string }>(
    `SELECT bm.*, u.first_name, u.last_name, u.email
     FROM business_members bm
     INNER JOIN users u ON bm.user_id = u.id
     WHERE bm.business_account_id = $1
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
     WHERE business_account_id = $1 AND user_id = $2`,
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
    `SELECT 1 FROM business_members WHERE business_account_id = $1 AND user_id = $2`,
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

export async function updateContractStatus(
  contractId: string,
  userId: string,
  status: 'active' | 'cancelled',
): Promise<BusinessContractRow> {
  const contract = await db.query<BusinessContractRow & { business_account_id: string }>(
    `SELECT * FROM business_contracts WHERE id = $1`,
    [contractId],
  );

  if (contract.rows.length === 0) {
    throw createAppError('Contract not found.', 404);
  }

  const member = await db.query<BusinessMemberRow>(
    `SELECT role, can_approve FROM business_members
     WHERE business_account_id = $1 AND user_id = $2`,
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
