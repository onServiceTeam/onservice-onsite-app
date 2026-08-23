import React, { useState, type FormEvent } from 'react';
// D27 Phase 2 — admin editor for per-subcategory structured intake fields.
// Renders inline under a subcategory row in CatalogPage. Lets a super-admin
// define the questions a customer answers when requesting a custom quote for
// this service (area in sqm, door material, # of rooms, etc.). The mobile
// job-request screen renders these dynamically.
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import { Badge, Label, Input, Textarea } from '@/components/ui';

export type IntakeFieldType = 'number' | 'text' | 'choice' | 'boolean';

export interface IntakeField {
  id: string;
  subcategoryId: string;
  fieldKey: string;
  label: string;
  helpText: string | null;
  fieldType: IntakeFieldType;
  unit: string | null;
  options: string[] | null;
  placeholder: string | null;
  isRequired: boolean;
  sortOrder: number;
  isActive: boolean;
}

interface FormState {
  fieldKey: string;
  label: string;
  helpText: string;
  fieldType: IntakeFieldType;
  unit: string;
  options: string; // comma-separated in the form, split on submit
  placeholder: string;
  isRequired: boolean;
  sortOrder: string;
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  fieldKey: '',
  label: '',
  helpText: '',
  fieldType: 'number',
  unit: '',
  options: '',
  placeholder: '',
  isRequired: false,
  sortOrder: '0',
  isActive: true,
};

// Mirror the server: field_key must be lowercase letters, numbers, underscores.
function slugifyKey(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
}

export function IntakeFieldsManager({
  subcategoryId,
  subcategoryName,
  readOnly = false,
}: {
  subcategoryId: string;
  subcategoryName: string;
  readOnly?: boolean;
}): React.ReactElement {
  const queryClient = useQueryClient();
  const queryKey = ['adminIntakeFields', subcategoryId];

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  // Tracks whether the admin has manually edited the key, so we stop
  // auto-deriving it from the label once they take control.
  const [keyTouched, setKeyTouched] = useState(false);
  const [error, setError] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: IntakeField[] }>(
        `/api/v1/catalog/admin/subcategories/${subcategoryId}/intake-fields`,
      );
      return res.data.data;
    },
  });

  function resetForm(): void {
    setForm(EMPTY_FORM);
    setEditId(null);
    setKeyTouched(false);
    setError('');
    setShowForm(false);
  }

  function buildBody(): Record<string, unknown> {
    const options =
      form.fieldType === 'choice'
        ? form.options.split(',').map((o) => o.trim()).filter(Boolean)
        : null;
    return {
      fieldKey: form.fieldKey.trim(),
      label: form.label.trim(),
      helpText: form.helpText.trim() || null,
      fieldType: form.fieldType,
      unit: form.fieldType === 'number' ? form.unit.trim() || null : null,
      options,
      placeholder: form.placeholder.trim() || null,
      isRequired: form.isRequired,
      sortOrder: Number(form.sortOrder) || 0,
      isActive: form.isActive,
    };
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const body = buildBody();
      if (editId) {
        await api.patch(`/api/v1/catalog/admin/intake-fields/${editId}`, body);
      } else {
        await api.post(`/api/v1/catalog/admin/subcategories/${subcategoryId}/intake-fields`, body);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      resetForm();
    },
    onError: (err) => setError(getErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/catalog/admin/intake-fields/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
    onError: (err) => setError(getErrorMessage(err)),
  });

  function openAdd(): void {
    setForm(EMPTY_FORM);
    setEditId(null);
    setKeyTouched(false);
    setError('');
    setShowForm(true);
  }

  function openEdit(f: IntakeField): void {
    setForm({
      fieldKey: f.fieldKey,
      label: f.label,
      helpText: f.helpText ?? '',
      fieldType: f.fieldType,
      unit: f.unit ?? '',
      options: (f.options ?? []).join(', '),
      placeholder: f.placeholder ?? '',
      isRequired: f.isRequired,
      sortOrder: String(f.sortOrder),
      isActive: f.isActive,
    });
    setEditId(f.id);
    setKeyTouched(true);
    setError('');
    setShowForm(true);
  }

  function validate(): string | null {
    if (!form.label.trim()) return 'Label is required.';
    if (!form.fieldKey.trim()) return 'Field key is required.';
    if (!/^[a-z0-9_]+$/.test(form.fieldKey.trim())) {
      return 'Field key must be lowercase letters, numbers, or underscores only.';
    }
    if (form.fieldType === 'choice') {
      const opts = form.options.split(',').map((o) => o.trim()).filter(Boolean);
      if (opts.length < 2) return 'Choice fields need at least 2 options (comma-separated).';
    }
    return null;
  }

  function handleSubmit(e: FormEvent): void {
    e.preventDefault();
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError('');
    mutation.mutate();
  }

  function onLabelChange(value: string): void {
    setForm((prev) => ({
      ...prev,
      label: value,
      fieldKey: keyTouched ? prev.fieldKey : slugifyKey(value),
    }));
  }

  const fields = data ?? [];

  return (
    <div className="bg-amber-50/40 px-5 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-amber-800 uppercase tracking-wider">
          Intake fields for {subcategoryName}
        </span>
        {!readOnly && !showForm && (
          <button
            onClick={openAdd}
            aria-label={`Add intake field to ${subcategoryName}`}
            className="px-2 py-1 text-xs font-medium text-amber-800 bg-amber-100 hover:bg-amber-200 rounded-md transition-colors"
          >
            + Field
          </button>
        )}
      </div>

      <p className="text-xs text-[var(--color-text-secondary)] mb-2">
        Questions the customer answers when requesting a custom quote for this service. Helps providers
        quote accurately (e.g. area in sqm, material, number of rooms).
      </p>

      {error && (
        <div role="alert" className="mb-2 p-2 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">
          {error}
        </div>
      )}

      {isLoading ? (
        <p className="text-xs text-[var(--color-text-secondary)]">Loading intake fields…</p>
      ) : isError ? (
        <p role="alert" className="text-xs text-red-600">Failed to load intake fields. Please try again.</p>
      ) : fields.length === 0 ? (
        <p className="text-xs text-[var(--color-text-secondary)]">No intake fields yet.</p>
      ) : (
        <div className="space-y-1">
          {fields.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between bg-white rounded-md px-3 py-2 border border-amber-100"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-[var(--color-text)]">{f.label}</span>
                  <Badge label={f.fieldType} variant="outline" />
                  {f.isRequired && <Badge label="required" variant="info" />}
                  {!f.isActive && <Badge label="inactive" variant="danger" />}
                </div>
                <p className="text-xs text-[var(--color-text-secondary)] truncate">
                  <code className="text-[11px]">{f.fieldKey}</code>
                  {f.unit ? ` · unit: ${f.unit}` : ''}
                  {f.options && f.options.length > 0 ? ` · ${f.options.join(' / ')}` : ''}
                  {f.helpText ? ` · ${f.helpText}` : ''}
                </p>
              </div>
              {!readOnly && <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => openEdit(f)}
                  aria-label={`Edit intake field ${f.label}`}
                  className="px-2 py-0.5 text-xs text-sky-700 bg-sky-50 rounded hover:bg-sky-100 transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`Remove intake field "${f.label}"?`)) deleteMutation.mutate(f.id);
                  }}
                  aria-label={`Remove intake field ${f.label}`}
                  className="px-2 py-0.5 text-xs text-red-700 bg-red-50 rounded hover:bg-red-100 transition-colors"
                >
                  Remove
                </button>
              </div>}
            </div>
          ))}
        </div>
      )}

      {!readOnly && showForm && (
        <form onSubmit={handleSubmit} className="mt-3 bg-white rounded-lg border border-amber-200 p-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="intake-label" className="block text-xs font-medium text-[var(--color-text)] mb-1">
                Label
              </Label>
              <Input
                id="intake-label"
                type="text"
                value={form.label}
                onChange={(e) => onLabelChange(e.target.value)}
                placeholder="Area to be painted"
                required
              />
            </div>
            <div>
              <Label htmlFor="intake-key" className="block text-xs font-medium text-[var(--color-text)] mb-1">
                Field key
              </Label>
              <Input
                id="intake-key"
                type="text"
                value={form.fieldKey}
                onChange={(e) => {
                  setKeyTouched(true);
                  setForm((prev) => ({ ...prev, fieldKey: e.target.value }));
                }}
                placeholder="area_sqm"
                disabled={!!editId}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="intake-type" className="block text-xs font-medium text-[var(--color-text)] mb-1">
                Type
              </Label>
              <select
                id="intake-type"
                value={form.fieldType}
                onChange={(e) => setForm((prev) => ({ ...prev, fieldType: e.target.value as IntakeFieldType }))}
                className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
              >
                <option value="number">Number</option>
                <option value="text">Text</option>
                <option value="choice">Choice</option>
                <option value="boolean">Yes / No</option>
              </select>
            </div>
            <div>
              <Label htmlFor="intake-order" className="block text-xs font-medium text-[var(--color-text)] mb-1">
                Sort order
              </Label>
              <Input
                id="intake-order"
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm((prev) => ({ ...prev, sortOrder: e.target.value }))}
              />
            </div>
          </div>

          {form.fieldType === 'number' && (
            <div>
              <Label htmlFor="intake-unit" className="block text-xs font-medium text-[var(--color-text)] mb-1">
                Unit (optional)
              </Label>
              <Input
                id="intake-unit"
                type="text"
                value={form.unit}
                onChange={(e) => setForm((prev) => ({ ...prev, unit: e.target.value }))}
                placeholder="sqm"
              />
            </div>
          )}

          {form.fieldType === 'choice' && (
            <div>
              <Label htmlFor="intake-options" className="block text-xs font-medium text-[var(--color-text)] mb-1">
                Options (comma-separated, at least 2)
              </Label>
              <Input
                id="intake-options"
                type="text"
                value={form.options}
                onChange={(e) => setForm((prev) => ({ ...prev, options: e.target.value }))}
                placeholder="Wood, Aluminum, PVC"
              />
            </div>
          )}

          <div>
            <Label htmlFor="intake-help" className="block text-xs font-medium text-[var(--color-text)] mb-1">
              Help text (optional)
            </Label>
            <Textarea
              id="intake-help"
              value={form.helpText}
              onChange={(e) => setForm((prev) => ({ ...prev, helpText: e.target.value }))}
              rows={2}
              placeholder="Shown under the field to guide the customer."
            />
          </div>

          {(form.fieldType === 'number' || form.fieldType === 'text') && (
            <div>
              <Label htmlFor="intake-placeholder" className="block text-xs font-medium text-[var(--color-text)] mb-1">
                Placeholder (optional)
              </Label>
              <Input
                id="intake-placeholder"
                type="text"
                value={form.placeholder}
                onChange={(e) => setForm((prev) => ({ ...prev, placeholder: e.target.value }))}
              />
            </div>
          )}

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-xs text-[var(--color-text)] cursor-pointer">
              <input
                type="checkbox"
                checked={form.isRequired}
                onChange={(e) => setForm((prev) => ({ ...prev, isRequired: e.target.checked }))}
                className="h-4 w-4 rounded border-[var(--color-border)]"
              />
              Required
            </label>
            <label className="flex items-center gap-2 text-xs text-[var(--color-text)] cursor-pointer">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                className="h-4 w-4 rounded border-[var(--color-border)]"
              />
              Active
            </label>
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <button
              type="button"
              onClick={resetForm}
              className="px-3 py-1.5 text-xs border border-[var(--color-border)] rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending || !form.label.trim()}
              className="px-3 py-1.5 text-xs bg-[var(--color-primary)] text-white rounded-lg hover:opacity-90 disabled:bg-slate-200 disabled:text-slate-600 disabled:cursor-not-allowed transition-opacity"
            >
              {mutation.isPending ? 'Saving…' : editId ? 'Update field' : 'Add field'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default IntakeFieldsManager;
