// D27 Phase 5 — project layer client. A project groups milestones (stages +
// progress), selections (material/colour choices), and documents (blueprints,
// permits, contract). Money does not move per milestone (advisory amounts only).
import api from './api';
import type { ApiResponse } from './api';

export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled';
export type MilestoneStatus = 'pending' | 'in_progress' | 'completed';
export type DocType = 'blueprint' | 'permit' | 'contract' | 'photo' | 'other';

// Mirrors the API validator's 2,000,000,000-centavo ceiling. The API remains
// authoritative; this value only prevents an avoidable rejected form submit.
export const PROJECT_ADVISORY_BUDGET_MAX_PESOS = 20_000_000;

export interface Project {
  id: string;
  customerId: string;
  providerId: string | null;
  categoryId: string | null;
  title: string;
  description: string;
  address: string | null;
  city: string | null;
  status: ProjectStatus;
  estimatedTotal: number | null;
  createdAt: string;
  updatedAt: string;
  customerName?: string;
  providerName?: string | null;
}

export interface ProjectMilestone {
  id: string;
  projectId: string;
  title: string;
  description: string;
  sortOrder: number;
  status: MilestoneStatus;
  amount: number | null;
  targetDate: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface ProjectSelection {
  id: string;
  projectId: string;
  category: string;
  label: string;
  value: string;
  detail: string | null;
  sortOrder: number;
}

export interface ProjectDocument {
  id: string;
  projectId: string;
  label: string;
  fileUrl: string;
  docType: DocType;
  uploadedBy: string | null;
  createdAt: string;
}

export interface ProjectDetail extends Project {
  milestones: ProjectMilestone[];
  selections: ProjectSelection[];
  documents: ProjectDocument[];
}

export async function listProjects(status?: ProjectStatus): Promise<Project[]> {
  const res = await api.get<ApiResponse<Project[]>>('/api/v1/projects', {
    params: status ? { status } : undefined,
  });
  return res.data.data;
}

export async function getProject(id: string): Promise<ProjectDetail> {
  const res = await api.get<ApiResponse<ProjectDetail>>(`/api/v1/projects/${id}`);
  return res.data.data;
}

export async function createProject(input: {
  title: string;
  description?: string;
  categoryId?: string;
  address?: string;
  city?: string;
  estimatedTotal?: number;
}): Promise<Project> {
  const res = await api.post<ApiResponse<Project>>('/api/v1/projects', input);
  return res.data.data;
}

export interface UpdateProjectPatch {
  title?: string;
  description?: string;
  address?: string | null;
  city?: string | null;
  estimatedTotal?: number | null;
}

export async function updateProject(id: string, patch: UpdateProjectPatch): Promise<Project> {
  const res = await api.patch<ApiResponse<Project>>(`/api/v1/projects/${id}`, patch);
  return res.data.data;
}

export async function addMilestone(projectId: string, input: { title: string; description?: string; sortOrder?: number; amount?: number; targetDate?: string }): Promise<ProjectMilestone> {
  const res = await api.post<ApiResponse<ProjectMilestone>>(`/api/v1/projects/${projectId}/milestones`, input);
  return res.data.data;
}

export async function updateMilestone(milestoneId: string, patch: Partial<{ title: string; description: string; status: MilestoneStatus; amount: number | null; targetDate: string | null }>): Promise<ProjectMilestone> {
  const res = await api.patch<ApiResponse<ProjectMilestone>>(`/api/v1/projects/milestones/${milestoneId}`, patch);
  return res.data.data;
}

export async function deleteMilestone(milestoneId: string): Promise<void> {
  await api.delete(`/api/v1/projects/milestones/${milestoneId}`);
}

export async function addSelection(projectId: string, input: { category: string; label: string; value: string; detail?: string; sortOrder?: number }): Promise<ProjectSelection> {
  const res = await api.post<ApiResponse<ProjectSelection>>(`/api/v1/projects/${projectId}/selections`, input);
  return res.data.data;
}

export async function updateSelection(selectionId: string, patch: Partial<{ category: string; label: string; value: string; detail: string | null; sortOrder: number }>): Promise<ProjectSelection> {
  const res = await api.patch<ApiResponse<ProjectSelection>>(`/api/v1/projects/selections/${selectionId}`, patch);
  return res.data.data;
}

export async function deleteSelection(selectionId: string): Promise<void> {
  await api.delete(`/api/v1/projects/selections/${selectionId}`);
}

export async function addDocument(projectId: string, input: { label: string; fileUrl: string; docType?: DocType }): Promise<ProjectDocument> {
  const res = await api.post<ApiResponse<ProjectDocument>>(`/api/v1/projects/${projectId}/documents`, input);
  return res.data.data;
}
