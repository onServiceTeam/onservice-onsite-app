import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import { formatCurrency } from '@/lib/format';

interface PlatformSetting {
  key: string;
  value: unknown;
  description: string | null;
  updatedBy: string | null;
  updatedAt: string;
}

const SETTING_GROUPS: Record<string, { label: string; keys: string[] }> = {
  commission: {
    label: 'Commission Rates',
    keys: [
      'commission_rate_new',
      'commission_rate_verified',
      'commission_rate_pro',
      'commission_rate_elite',
    ],
  },
  fees: {
    label: 'Service Fees',
    keys: [
      'service_fee_rate',
      'minimum_service_fee',
      'maximum_service_fee',
      'guarantee_fund_rate',
      'vat_rate',
    ],
  },
  booking: {
    label: 'Booking & Escrow',
    keys: [
      'escrow_auto_confirm_hours',
      'quote_expiry_hours',
      'provider_no_show_minutes',
      'max_images_per_booking',
    ],
  },
  financial: {
    label: 'Financial',
    keys: ['min_withdrawal_amount'],
  },
  security: {
    label: 'Security',
    keys: [
      'otp_expiry_minutes',
      'suspicious_ip_threshold',
      'admin_session_timeout_hrs',
    ],
  },
  serviceArea: {
    label: 'Service Areas',
    keys: ['default_service_area_km', 'max_service_radius_km'],
  },
};

function formatLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/Hrs\b/, 'Hours')
    .replace(/Km\b/, 'km');
}

function formatDisplayValue(key: string, val: unknown): string {
  const num = Number(val);
  if (key.includes('rate') && num < 1) return `${(num * 100).toFixed(1)}%`;
  if (key.includes('fee') && !key.includes('rate')) return formatCurrency(num);
  if (key.includes('withdrawal')) return formatCurrency(num);
  return String(val);
}

export default function SystemSettingsPage(): React.ReactElement {
  const queryClient = useQueryClient();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data: settings, isLoading, error } = useQuery({
    queryKey: ['platform-settings'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: PlatformSetting[] }>('/api/v1/admin/settings');
      return res.data.data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: unknown }) => {
      await api.put(`/api/v1/admin/settings/${key}`, { value });
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['platform-settings'] });
      setSaveMessage(`"${formatLabel(variables.key)}" updated successfully.`);
      setSaveError(null);
      setEditingKey(null);
      setTimeout(() => setSaveMessage(null), 3000);
    },
    onError: (e) => {
      setSaveError(getErrorMessage(e));
      setTimeout(() => setSaveError(null), 5000);
    },
  });

  function startEdit(setting: PlatformSetting): void {
    setEditingKey(setting.key);
    setEditValue(String(setting.value));
    setSaveMessage(null);
  }

  function cancelEdit(): void {
    setEditingKey(null);
    setEditValue('');
  }

  function saveEdit(key: string): void {
    const parsed = Number(editValue);
    updateMutation.mutate({ key, value: isNaN(parsed) ? editValue : parsed });
  }

  const settingsMap = new Map((settings ?? []).map((s) => [s.key, s]));

  if (isLoading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">System Settings</h1>
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-gray-200 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">System Settings</h1>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          Failed to load settings. {getErrorMessage(error)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">System Settings</h1>
          <p className="text-gray-500 text-sm mt-1">
            Configure platform-wide settings. Changes take effect immediately.
          </p>
        </div>
      </div>

      {saveMessage && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-3 text-green-700 text-sm">
          {saveMessage}
        </div>
      )}

      {saveError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
          Failed to update setting. {saveError}
        </div>
      )}

      <div className="space-y-6">
        {Object.entries(SETTING_GROUPS).map(([groupKey, group]) => (
          <div key={groupKey} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
              <h2 className="font-semibold text-gray-800">{group.label}</h2>
            </div>

            <div className="divide-y divide-gray-100">
              {group.keys.map((key) => {
                const setting = settingsMap.get(key);
                if (!setting) return null;
                const isEditing = editingKey === key;

                return (
                  <div key={key} className="px-4 py-3 flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm">{formatLabel(key)}</p>
                      {setting.description && (
                        <p className="text-xs text-gray-500 mt-0.5">{setting.description}</p>
                      )}
                    </div>

                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="w-32 px-2 py-1 border border-blue-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEdit(key);
                            if (e.key === 'Escape') cancelEdit();
                          }}
                        />
                        <button
                          onClick={() => saveEdit(key)}
                          disabled={updateMutation.isPending}
                          className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
                        >
                          {updateMutation.isPending ? '...' : 'Save'}
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">
                          {formatDisplayValue(key, setting.value)}
                        </span>
                        <button
                          onClick={() => startEdit(setting)}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          Edit
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 text-xs text-gray-400">
        Only Super Admins can modify settings. All changes are logged in the Audit Log.
      </div>
    </div>
  );
}
