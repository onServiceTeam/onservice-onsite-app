// D27 Phase 7 — provider CRM client (clients book).
import api from './api';
import type { ApiResponse } from './api';

export interface ProviderClient {
  customerId: string;
  customerName: string;
  jobCount: number;
  completedCount: number;
  lastJobAt: string | null;
  totalJobValue: number; // gross service value (centavos), not net of commission
}

export async function getProviderClients(): Promise<ProviderClient[]> {
  const res = await api.get<ApiResponse<ProviderClient[]>>('/api/v1/providers/me/clients');
  return res.data.data;
}

// ── Client detail + notes ────────────────────────────────────────────────────
export interface ClientNote { id: string; customerId: string; body: string; createdAt: string }
export interface ClientReminder { id: string; customerId: string | null; customerName?: string | null; title: string; dueDate: string; status: 'pending' | 'done'; createdAt: string }
export interface ClientBooking { id: string; status: string; servicePrice: number; categoryName: string | null; createdAt: string }
export interface ClientDetail {
  customerId: string;
  customerName: string;
  bookings: ClientBooking[];
  notes: ClientNote[];
  reminders: ClientReminder[];
}

export async function getClientDetail(customerId: string): Promise<ClientDetail> {
  const res = await api.get<ApiResponse<ClientDetail>>(`/api/v1/providers/me/clients/${customerId}`);
  return res.data.data;
}
export async function addClientNote(customerId: string, body: string): Promise<ClientNote> {
  const res = await api.post<ApiResponse<ClientNote>>(`/api/v1/providers/me/clients/${customerId}/notes`, { body });
  return res.data.data;
}
export async function deleteClientNote(noteId: string): Promise<void> {
  await api.delete(`/api/v1/providers/me/client-notes/${noteId}`);
}

// ── Reminders ────────────────────────────────────────────────────────────────
export async function listReminders(status?: 'pending' | 'done'): Promise<ClientReminder[]> {
  const res = await api.get<ApiResponse<ClientReminder[]>>('/api/v1/providers/me/reminders', { params: status ? { status } : undefined });
  return res.data.data;
}
export async function addReminder(input: { customerId?: string | null; title: string; dueDate: string }): Promise<ClientReminder> {
  const res = await api.post<ApiResponse<ClientReminder>>('/api/v1/providers/me/reminders', input);
  return res.data.data;
}
export async function completeReminder(reminderId: string): Promise<ClientReminder> {
  const res = await api.patch<ApiResponse<ClientReminder>>(`/api/v1/providers/me/reminders/${reminderId}/done`, {});
  return res.data.data;
}
export async function deleteReminder(reminderId: string): Promise<void> {
  await api.delete(`/api/v1/providers/me/reminders/${reminderId}`);
}

// ── Quote templates ──────────────────────────────────────────────────────────
export interface TemplateItem { id?: string; description: string; quantity: number; unit: string; unitPrice: number; itemType: string; sortOrder?: number }
export interface QuoteTemplate { id: string; name: string; categoryId: string | null; subcategoryId: string | null; items: TemplateItem[]; createdAt: string }

export async function listTemplates(): Promise<QuoteTemplate[]> {
  const res = await api.get<ApiResponse<QuoteTemplate[]>>('/api/v1/providers/me/quote-templates');
  return res.data.data;
}
export async function createTemplate(input: { name: string; categoryId?: string | null; subcategoryId?: string | null; items: Omit<TemplateItem, 'id' | 'sortOrder'>[] }): Promise<QuoteTemplate> {
  const res = await api.post<ApiResponse<QuoteTemplate>>('/api/v1/providers/me/quote-templates', input);
  return res.data.data;
}
export async function deleteTemplate(templateId: string): Promise<void> {
  await api.delete(`/api/v1/providers/me/quote-templates/${templateId}`);
}

// ── Insights ─────────────────────────────────────────────────────────────────
export interface CategoryInsight { categoryId: string | null; categoryName: string; jobCount: number; completedCount: number; completionRate: number; completedValue: number; avgRating: number | null }
export async function getCategoryInsights(): Promise<CategoryInsight[]> {
  const res = await api.get<ApiResponse<CategoryInsight[]>>('/api/v1/providers/me/insights');
  return res.data.data;
}
