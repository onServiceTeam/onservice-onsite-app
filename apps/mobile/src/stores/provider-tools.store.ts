import { create } from 'zustand';
import * as providerToolsApi from '@/services/provider-tools.service';
import type {
  EarningsSummary,
  EarningsTrend,
  CategoryEarnings,
  EarningsGoal,
  GoalProgress,
  DemandInsights,
  MonthlySummary,
  MaterialsList,
} from '@/services/provider-tools.service';

interface ProviderToolsState {
  summary: EarningsSummary | null;
  trends: EarningsTrend[];
  categoryEarnings: CategoryEarnings[];
  goals: EarningsGoal[];
  goalProgress: GoalProgress[];
  demandInsights: DemandInsights | null;
  monthlySummary: MonthlySummary | null;
  materialsList: MaterialsList | null;
  isLoading: boolean;
  error: string | null;

  fetchSummary: () => Promise<void>;
  fetchTrends: (period?: 'daily' | 'weekly' | 'monthly', days?: number) => Promise<void>;
  fetchCategoryEarnings: (days?: number) => Promise<void>;
  fetchGoals: () => Promise<void>;
  setGoal: (periodType: 'daily' | 'weekly' | 'monthly', targetAmount: number) => Promise<void>;
  removeGoal: (periodType: 'daily' | 'weekly' | 'monthly') => Promise<void>;
  fetchDemandInsights: (days?: number) => Promise<void>;
  fetchMonthlySummary: (year: number, month: number) => Promise<void>;
  fetchMaterialsList: (bookingId: string) => Promise<void>;
  clearError: () => void;
}

export const useProviderToolsStore = create<ProviderToolsState>((set) => ({
  summary: null,
  trends: [],
  categoryEarnings: [],
  goals: [],
  goalProgress: [],
  demandInsights: null,
  monthlySummary: null,
  materialsList: null,
  isLoading: false,
  error: null,

  fetchSummary: async (): Promise<void> => {
    set({ isLoading: true, error: null });
    try {
      const summary = await providerToolsApi.getEarningsSummary();
      set({ summary, isLoading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load earnings summary.', isLoading: false });
    }
  },

  fetchTrends: async (period = 'daily', days = 30): Promise<void> => {
    set({ isLoading: true, error: null });
    try {
      const trends = await providerToolsApi.getEarningsTrends(period, days);
      set({ trends, isLoading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load earnings trends.', isLoading: false });
    }
  },

  fetchCategoryEarnings: async (days = 90): Promise<void> => {
    set({ isLoading: true, error: null });
    try {
      const categoryEarnings = await providerToolsApi.getEarningsByCategory(days);
      set({ categoryEarnings, isLoading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load category earnings.', isLoading: false });
    }
  },

  fetchGoals: async (): Promise<void> => {
    set({ isLoading: true, error: null });
    try {
      const { goals, progress } = await providerToolsApi.getGoals();
      set({ goals, goalProgress: progress, isLoading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load goals.', isLoading: false });
    }
  },

  setGoal: async (periodType, targetAmount): Promise<void> => {
    set({ isLoading: true, error: null });
    try {
      await providerToolsApi.setGoal(periodType, targetAmount);
      const { goals, progress } = await providerToolsApi.getGoals();
      set({ goals, goalProgress: progress, isLoading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to set goal.', isLoading: false });
      throw err;
    }
  },

  removeGoal: async (periodType): Promise<void> => {
    try {
      await providerToolsApi.removeGoal(periodType);
      set((state) => ({
        goals: state.goals.filter((g) => g.periodType !== periodType),
        goalProgress: state.goalProgress.filter((g) => g.periodType !== periodType),
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to remove goal.' });
    }
  },

  fetchDemandInsights: async (days = 90): Promise<void> => {
    set({ isLoading: true, error: null });
    try {
      const demandInsights = await providerToolsApi.getDemandInsights(days);
      set({ demandInsights, isLoading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load demand insights.', isLoading: false });
    }
  },

  fetchMonthlySummary: async (year, month): Promise<void> => {
    set({ isLoading: true, error: null });
    try {
      const monthlySummary = await providerToolsApi.getMonthlySummary(year, month);
      set({ monthlySummary, isLoading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load monthly summary.', isLoading: false });
    }
  },

  fetchMaterialsList: async (bookingId): Promise<void> => {
    set({ isLoading: true, error: null });
    try {
      const materialsList = await providerToolsApi.getMaterialsList(bookingId);
      set({ materialsList, isLoading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load materials list.', isLoading: false });
    }
  },

  clearError: (): void => set({ error: null }),
}));
