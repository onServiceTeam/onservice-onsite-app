import api from './api';
import type { ApiResponse, PaginatedResponse } from './api';

export interface BusinessAccount {
  id: string;
  companyName: string;
  businessType: string;
  registrationNumber: string | null;
  taxId: string | null;
  billingAddress: string;
  barangay: string;
  city: string;
  province: string;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  accountManagerId: string | null;
  ownerUserId: string;
  status: 'pending' | 'active' | 'suspended' | 'closed';
  paymentTerms: string;
  volumeDiscountRate: number;
  monthlyCreditLimit: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessMember {
  id: string;
  businessAccountId: string;
  userId: string;
  role: 'owner' | 'manager' | 'member';
  canBook: boolean;
  canApprove: boolean;
  canViewInvoices: boolean;
  invitedBy: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  createdAt: string;
}

export interface BusinessContract {
  id: string;
  businessAccountId: string;
  categoryId: string;
  subcategoryId: string | null;
  providerId: string | null;
  contractType: 'recurring' | 'on_demand';
  frequency: string | null;
  agreedRate: number;
  discountPercentage: number;
  estimatedMonthlyValue: number;
  startDate: string;
  endDate: string | null;
  autoRenew: boolean;
  status: 'draft' | 'active' | 'expired' | 'cancelled';
  terms: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessInvoice {
  id: string;
  businessAccountId: string;
  invoiceNumber: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled' | 'void';
  dueDate: string;
  paidAt: string | null;
  paymentReference: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessInvoiceItem {
  id: string;
  invoiceId: string;
  bookingId: string | null;
  contractId: string | null;
  description: string;
  serviceDate: string | null;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  amount: number;
  createdAt: string;
}

export interface CreateBusinessParams {
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
  paymentTerms?: string;
  notes?: string;
}

export interface CreateContractParams {
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
): Promise<BusinessAccount> {
  const res = await api.post<ApiResponse<BusinessAccount>>('/api/v1/business', params);
  return res.data.data;
}

export async function getBusinessAccounts(
  page = 1,
  pageSize = 20,
): Promise<{ items: BusinessAccount[]; total: number }> {
  const res = await api.get<PaginatedResponse<BusinessAccount>>('/api/v1/business', {
    params: { page, pageSize },
  });
  return { items: res.data.data, total: res.data.pagination.total };
}

export async function getBusinessAccount(id: string): Promise<BusinessAccount> {
  const res = await api.get<ApiResponse<BusinessAccount>>(`/api/v1/business/${id}`);
  return res.data.data;
}

export async function updateBusinessAccount(
  id: string,
  updates: Partial<CreateBusinessParams>,
): Promise<BusinessAccount> {
  const res = await api.patch<ApiResponse<BusinessAccount>>(`/api/v1/business/${id}`, updates);
  return res.data.data;
}

export async function getMembers(businessId: string): Promise<BusinessMember[]> {
  const res = await api.get<ApiResponse<BusinessMember[]>>(`/api/v1/business/${businessId}/members`);
  return res.data.data;
}

export async function addMember(
  businessId: string,
  targetUserId: string,
  role: string,
  permissions?: { canBook?: boolean; canApprove?: boolean; canViewInvoices?: boolean },
): Promise<BusinessMember> {
  const res = await api.post<ApiResponse<BusinessMember>>(`/api/v1/business/${businessId}/members`, {
    targetUserId,
    role,
    ...permissions,
  });
  return res.data.data;
}

export async function removeMember(businessId: string, userId: string): Promise<void> {
  await api.delete(`/api/v1/business/${businessId}/members/${userId}`);
}

export async function getContracts(
  businessId: string,
  page = 1,
  pageSize = 20,
): Promise<{ items: BusinessContract[]; total: number }> {
  const res = await api.get<PaginatedResponse<BusinessContract>>(`/api/v1/business/${businessId}/contracts`, {
    params: { page, pageSize },
  });
  return { items: res.data.data, total: res.data.pagination.total };
}

export async function createContract(
  businessId: string,
  params: CreateContractParams,
): Promise<BusinessContract> {
  const res = await api.post<ApiResponse<BusinessContract>>(`/api/v1/business/${businessId}/contracts`, params);
  return res.data.data;
}

export async function activateContract(businessId: string, contractId: string): Promise<BusinessContract> {
  const res = await api.post<ApiResponse<BusinessContract>>(
    `/api/v1/business/${businessId}/contracts/${contractId}/activate`,
  );
  return res.data.data;
}

export async function cancelContract(businessId: string, contractId: string): Promise<BusinessContract> {
  const res = await api.post<ApiResponse<BusinessContract>>(
    `/api/v1/business/${businessId}/contracts/${contractId}/cancel`,
  );
  return res.data.data;
}

export async function getInvoices(
  businessId: string,
  page = 1,
  pageSize = 20,
): Promise<{ items: BusinessInvoice[]; total: number }> {
  const res = await api.get<PaginatedResponse<BusinessInvoice>>(`/api/v1/business/${businessId}/invoices`, {
    params: { page, pageSize },
  });
  return { items: res.data.data, total: res.data.pagination.total };
}

export async function getInvoiceDetail(
  businessId: string,
  invoiceId: string,
): Promise<BusinessInvoice & { items: BusinessInvoiceItem[] }> {
  const res = await api.get<ApiResponse<BusinessInvoice & { items: BusinessInvoiceItem[] }>>(
    `/api/v1/business/${businessId}/invoices/${invoiceId}`,
  );
  return res.data.data;
}
