import { create } from 'zustand';
import * as dataManagementApi from '@/services/data-management.service';
import type { DataExportEntry, AccountDeletionEntry } from '@/services/data-management.service';

interface DataManagementState {
  dataExports: DataExportEntry[];
  deletionStatus: AccountDeletionEntry | null;
  isLoading: boolean;
  error: string | null;

  fetchDataExports: () => Promise<void>;
  requestDataExport: (format?: 'json' | 'csv') => Promise<void>;
  fetchDeletionStatus: () => Promise<void>;
  requestAccountDeletion: (reason?: string) => Promise<void>;
  cancelAccountDeletion: () => Promise<void>;
  clearError: () => void;
}

export const useDataManagementStore = create<DataManagementState>((set) => ({
  dataExports: [],
  deletionStatus: null,
  isLoading: false,
  error: null,

  fetchDataExports: async (): Promise<void> => {
    set({ isLoading: true, error: null });
    try {
      const dataExports = await dataManagementApi.getDataExportStatus();
      set({ dataExports, isLoading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load data exports.', isLoading: false });
    }
  },

  requestDataExport: async (format = 'json'): Promise<void> => {
    set({ isLoading: true, error: null });
    try {
      const entry = await dataManagementApi.requestDataExport(format);
      set((state) => ({
        dataExports: [entry, ...state.dataExports],
        isLoading: false,
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to request data export.', isLoading: false });
      throw err;
    }
  },

  fetchDeletionStatus: async (): Promise<void> => {
    set({ isLoading: true, error: null });
    try {
      const deletionStatus = await dataManagementApi.getAccountDeletionStatus();
      set({ deletionStatus, isLoading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load deletion status.', isLoading: false });
    }
  },

  requestAccountDeletion: async (reason): Promise<void> => {
    set({ isLoading: true, error: null });
    try {
      const deletionStatus = await dataManagementApi.requestAccountDeletion(reason);
      set({ deletionStatus, isLoading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to request account deletion.', isLoading: false });
      throw err;
    }
  },

  cancelAccountDeletion: async (): Promise<void> => {
    set({ isLoading: true, error: null });
    try {
      await dataManagementApi.cancelAccountDeletion();
      set({ deletionStatus: null, isLoading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to cancel deletion.', isLoading: false });
    }
  },

  clearError: (): void => set({ error: null }),
}));
