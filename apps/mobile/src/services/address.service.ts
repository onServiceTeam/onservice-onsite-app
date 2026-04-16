import api from './api';

export interface SavedAddress {
  id: string;
  label: 'Home' | 'Work' | 'Other';
  fullAddress: string;
  barangay: string;
  city: string;
  province: string;
  region: string | null;
  zipCode: string | null;
  latitude: number | null;
  longitude: number | null;
  isDefault: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ApiResponse<T> { success: boolean; data: T }

export async function getAddresses(): Promise<SavedAddress[]> {
  const res = await api.get<ApiResponse<SavedAddress[]>>('/api/v1/addresses');
  return res.data.data;
}

export async function createAddress(data: {
  label: 'Home' | 'Work' | 'Other';
  fullAddress: string;
  barangay: string;
  city: string;
  province: string;
  region?: string;
  zipCode?: string;
  latitude?: number;
  longitude?: number;
  isDefault?: boolean;
  notes?: string;
}): Promise<SavedAddress> {
  const res = await api.post<ApiResponse<SavedAddress>>('/api/v1/addresses', data);
  return res.data.data;
}

export async function updateAddress(id: string, data: Partial<{
  label: 'Home' | 'Work' | 'Other';
  fullAddress: string;
  barangay: string;
  city: string;
  province: string;
  region: string;
  zipCode: string;
  latitude: number;
  longitude: number;
  isDefault: boolean;
  notes: string;
}>): Promise<SavedAddress> {
  const res = await api.patch<ApiResponse<SavedAddress>>(`/api/v1/addresses/${id}`, data);
  return res.data.data;
}

export async function deleteAddress(id: string): Promise<void> {
  await api.delete(`/api/v1/addresses/${id}`);
}
