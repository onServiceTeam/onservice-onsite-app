import api from './api';
import type { ApiResponse } from './api';

export interface DeviceEntry {
  id: string;
  userId: string;
  fingerprint: string;
  deviceName: string | null;
  platform: 'ios' | 'android' | 'web' | null;
  isTrusted: boolean;
  lastSeenAt: string;
  lastIp: string | null;
  createdAt: string;
}

export async function getDevices(): Promise<DeviceEntry[]> {
  const res = await api.get<ApiResponse<DeviceEntry[]>>('/api/v1/security/devices');
  return res.data.data;
}

export async function trustDevice(deviceId: string): Promise<void> {
  await api.post(`/api/v1/security/devices/${deviceId}/trust`);
}

export async function removeDevice(deviceId: string): Promise<void> {
  await api.delete(`/api/v1/security/devices/${deviceId}`);
}
