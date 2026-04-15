import { create } from 'zustand';
import * as businessApi from '@/services/business.service';
import type {
  BusinessAccount,
  BusinessMember,
  BusinessContract,
  BusinessInvoice,
  CreateBusinessParams,
  CreateContractParams,
} from '@/services/business.service';

interface BusinessState {
  accounts: BusinessAccount[];
  selectedAccount: BusinessAccount | null;
  members: BusinessMember[];
  contracts: BusinessContract[];
  invoices: BusinessInvoice[];
  isLoading: boolean;
  error: string | null;
  totalAccounts: number;
  totalContracts: number;
  totalInvoices: number;

  fetchAccounts: (page?: number) => Promise<void>;
  fetchAccount: (id: string) => Promise<void>;
  createAccount: (params: CreateBusinessParams) => Promise<BusinessAccount>;
  updateAccount: (id: string, updates: Partial<CreateBusinessParams>) => Promise<void>;
  fetchMembers: (businessId: string) => Promise<void>;
  addMember: (businessId: string, targetUserId: string, role: string, permissions?: { canBook?: boolean; canApprove?: boolean; canViewInvoices?: boolean }) => Promise<void>;
  removeMember: (businessId: string, userId: string) => Promise<void>;
  fetchContracts: (businessId: string, page?: number) => Promise<void>;
  createContract: (businessId: string, params: CreateContractParams) => Promise<BusinessContract>;
  activateContract: (businessId: string, contractId: string) => Promise<void>;
  cancelContract: (businessId: string, contractId: string) => Promise<void>;
  fetchInvoices: (businessId: string, page?: number) => Promise<void>;
  clearError: () => void;
}

export const useBusinessStore = create<BusinessState>((set) => ({
  accounts: [],
  selectedAccount: null,
  members: [],
  contracts: [],
  invoices: [],
  isLoading: false,
  error: null,
  totalAccounts: 0,
  totalContracts: 0,
  totalInvoices: 0,

  fetchAccounts: async (page = 1): Promise<void> => {
    set({ isLoading: true, error: null });
    try {
      const result = await businessApi.getBusinessAccounts(page);
      set({ accounts: result.items, totalAccounts: result.total, isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to load business accounts.',
        isLoading: false,
      });
    }
  },

  fetchAccount: async (id: string): Promise<void> => {
    set({ isLoading: true, error: null });
    try {
      const account = await businessApi.getBusinessAccount(id);
      set({ selectedAccount: account, isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to load business account.',
        isLoading: false,
      });
    }
  },

  createAccount: async (params: CreateBusinessParams): Promise<BusinessAccount> => {
    set({ isLoading: true, error: null });
    try {
      const account = await businessApi.createBusinessAccount(params);
      set((state) => ({
        accounts: [account, ...state.accounts],
        isLoading: false,
      }));
      return account;
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to create business account.',
        isLoading: false,
      });
      throw err;
    }
  },

  updateAccount: async (id: string, updates: Partial<CreateBusinessParams>): Promise<void> => {
    try {
      const updated = await businessApi.updateBusinessAccount(id, updates);
      set((state) => ({
        accounts: state.accounts.map((a) => (a.id === id ? updated : a)),
        selectedAccount: state.selectedAccount?.id === id ? updated : state.selectedAccount,
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to update account.' });
    }
  },

  fetchMembers: async (businessId: string): Promise<void> => {
    try {
      const members = await businessApi.getMembers(businessId);
      set({ members });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load members.' });
    }
  },

  addMember: async (businessId: string, targetUserId: string, role: string, permissions): Promise<void> => {
    try {
      const member = await businessApi.addMember(businessId, targetUserId, role, permissions);
      set((state) => ({ members: [...state.members, member] }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to add member.' });
    }
  },

  removeMember: async (businessId: string, userId: string): Promise<void> => {
    try {
      await businessApi.removeMember(businessId, userId);
      set((state) => ({
        members: state.members.filter((m) => m.userId !== userId),
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to remove member.' });
    }
  },

  fetchContracts: async (businessId: string, page = 1): Promise<void> => {
    try {
      const result = await businessApi.getContracts(businessId, page);
      set({ contracts: result.items, totalContracts: result.total });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load contracts.' });
    }
  },

  createContract: async (businessId: string, params: CreateContractParams): Promise<BusinessContract> => {
    set({ isLoading: true, error: null });
    try {
      const contract = await businessApi.createContract(businessId, params);
      set((state) => ({
        contracts: [contract, ...state.contracts],
        isLoading: false,
      }));
      return contract;
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to create contract.',
        isLoading: false,
      });
      throw err;
    }
  },

  activateContract: async (businessId: string, contractId: string): Promise<void> => {
    try {
      const updated = await businessApi.activateContract(businessId, contractId);
      set((state) => ({
        contracts: state.contracts.map((c) => (c.id === contractId ? updated : c)),
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to activate contract.' });
    }
  },

  cancelContract: async (businessId: string, contractId: string): Promise<void> => {
    try {
      const updated = await businessApi.cancelContract(businessId, contractId);
      set((state) => ({
        contracts: state.contracts.map((c) => (c.id === contractId ? updated : c)),
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to cancel contract.' });
    }
  },

  fetchInvoices: async (businessId: string, page = 1): Promise<void> => {
    try {
      const result = await businessApi.getInvoices(businessId, page);
      set({ invoices: result.items, totalInvoices: result.total });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load invoices.' });
    }
  },

  clearError: (): void => set({ error: null }),
}));
