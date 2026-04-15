import api from './api';
import type { ApiResponse } from './api';

export interface EarningsSummary {
  earnedToday: number;
  earnedThisWeek: number;
  earnedThisMonth: number;
  pendingEscrow: number;
  jobsToday: number;
  jobsThisWeek: number;
  jobsThisMonth: number;
}

export interface EarningsTrend {
  period: string;
  totalEarned: number;
  totalCommission: number;
  netEarned: number;
  jobCount: number;
}

export interface CategoryEarnings {
  categoryId: string;
  categoryName: string;
  totalEarned: number;
  jobCount: number;
}

export interface EarningsGoal {
  id: string;
  providerId: string;
  periodType: 'daily' | 'weekly' | 'monthly';
  targetAmount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GoalProgress {
  periodType: string;
  targetAmount: number;
  currentAmount: number;
  progressPercent: number;
  remainingAmount: number;
}

export interface DemandInsights {
  bestHours: Array<{ hour: number; bookingCount: number }>;
  bestDays: Array<{ dayOfWeek: number; dayName: string; bookingCount: number }>;
  peakTimes: string[];
}

export interface BookingReceipt {
  provider: { businessName: string; name: string; phone: string; tier: string };
  booking: {
    id: string;
    description: string;
    scheduledAt: string;
    completedAt: string | null;
    serviceName: string;
    address: string;
    customer: { name: string; phone: string };
  };
  financial: {
    servicePrice: number;
    serviceFee: number;
    commissionRate: number;
    commissionAmount: number;
    netEarnings: number;
  };
  receiptNumber: string;
  generatedAt: string;
}

export interface MonthlySummary {
  year: number;
  month: number;
  totalGrossEarnings: number;
  totalCommission: number;
  totalNetEarnings: number;
  totalTips: number;
  totalJobs: number;
  totalPayouts: number;
  breakdown: Array<{
    date: string;
    bookingId: string;
    description: string;
    grossAmount: number;
    commission: number;
    netAmount: number;
  }>;
}

export interface MaterialsListItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
  itemType: string;
}

export interface MaterialsList {
  booking: {
    id: string;
    customerName: string;
    description: string;
    scheduledAt: string;
    address: string;
    serviceName: string;
  };
  materials: MaterialsListItem[];
  totalMaterialsCost: number;
  totalLaborCost: number;
  totalEquipmentCost: number;
  grandTotal: number;
}

export async function getMaterialsList(bookingId: string): Promise<MaterialsList> {
  const res = await api.get<ApiResponse<MaterialsList>>(`/api/v1/providers/me/materials-list/${bookingId}`);
  return res.data.data;
}

export async function getEarningsSummary(): Promise<EarningsSummary> {
  const res = await api.get<ApiResponse<EarningsSummary>>('/api/v1/providers/me/earnings/summary');
  return res.data.data;
}

export async function getEarningsTrends(
  period: 'daily' | 'weekly' | 'monthly' = 'daily',
  days = 30,
): Promise<EarningsTrend[]> {
  const res = await api.get<ApiResponse<EarningsTrend[]>>('/api/v1/providers/me/earnings/trends', {
    params: { period, days },
  });
  return res.data.data;
}

export async function getEarningsByCategory(days = 90): Promise<CategoryEarnings[]> {
  const res = await api.get<ApiResponse<CategoryEarnings[]>>('/api/v1/providers/me/earnings/categories', {
    params: { days },
  });
  return res.data.data;
}

export async function getGoals(): Promise<{ goals: EarningsGoal[]; progress: GoalProgress[] }> {
  const res = await api.get<ApiResponse<{ goals: EarningsGoal[]; progress: GoalProgress[] }>>('/api/v1/providers/me/goals');
  return res.data.data;
}

export async function setGoal(
  periodType: 'daily' | 'weekly' | 'monthly',
  targetAmount: number,
): Promise<EarningsGoal> {
  const res = await api.post<ApiResponse<EarningsGoal>>('/api/v1/providers/me/goals', { periodType, targetAmount });
  return res.data.data;
}

export async function removeGoal(periodType: 'daily' | 'weekly' | 'monthly'): Promise<void> {
  await api.delete(`/api/v1/providers/me/goals/${periodType}`);
}

export async function getDemandInsights(days = 90): Promise<DemandInsights> {
  const res = await api.get<ApiResponse<DemandInsights>>('/api/v1/providers/me/demand-insights', {
    params: { days },
  });
  return res.data.data;
}

export async function getReceipt(bookingId: string): Promise<BookingReceipt> {
  const res = await api.get<ApiResponse<BookingReceipt>>(`/api/v1/providers/me/receipts/${bookingId}`);
  return res.data.data;
}

export async function getMonthlySummary(year: number, month: number): Promise<MonthlySummary> {
  const res = await api.get<ApiResponse<MonthlySummary>>('/api/v1/providers/me/monthly-summary', {
    params: { year, month },
  });
  return res.data.data;
}
