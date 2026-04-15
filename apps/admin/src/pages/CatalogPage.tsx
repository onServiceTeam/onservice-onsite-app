import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import { Badge } from '@/components/ui';

interface Subcategory {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  description: string;
  pricingType: string;
  basePrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  estimatedDurationMinutes: number | null;
  displayOrder: number;
}

interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  iconUrl: string | null;
  displayOrder: number;
  subcategories: Subcategory[];
}

function formatCurrency(cents: number): string {
  return `₱${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

type ModalMode = null | 'addCategory' | 'editCategory' | 'addSubcategory' | 'editSubcategory';

export default function CatalogPage() {
  const queryClient = useQueryClient();
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalMode>(null);
  const [editTarget, setEditTarget] = useState<Category | Subcategory | null>(null);
  const [targetCategoryId, setTargetCategoryId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [iconUrl, setIconUrl] = useState('');
  const [displayOrder, setDisplayOrder] = useState('0');
  const [pricingType, setPricingType] = useState('fixed');
  const [basePrice, setBasePrice] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [estimatedDuration, setEstimatedDuration] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['adminCatalog'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: Category[] }>('/api/v1/catalog/full');
      return res.data.data;
    },
  });

  const categoryMutation = useMutation({
    mutationFn: async () => {
      if (modal === 'addCategory') {
        await api.post('/api/v1/catalog/admin/categories', {
          name, description, iconUrl: iconUrl || null, displayOrder: Number(displayOrder),
        });
      } else if (modal === 'editCategory' && editTarget) {
        await api.put(`/api/v1/catalog/admin/categories/${editTarget.id}`, {
          name, description, iconUrl: iconUrl || null, displayOrder: Number(displayOrder),
        });
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['adminCatalog'] });
      closeModal();
    },
    onError: (err) => setError(getErrorMessage(err)),
  });

  const subcategoryMutation = useMutation({
    mutationFn: async () => {
      const body = {
        categoryId: targetCategoryId,
        name,
        description,
        pricingType,
        basePrice: basePrice ? Number(basePrice) * 100 : null,
        minPrice: minPrice ? Number(minPrice) * 100 : null,
        maxPrice: maxPrice ? Number(maxPrice) * 100 : null,
        estimatedDurationMinutes: estimatedDuration ? Number(estimatedDuration) : null,
        displayOrder: Number(displayOrder),
      };
      if (modal === 'addSubcategory') {
        await api.post('/api/v1/catalog/admin/subcategories', body);
      } else if (modal === 'editSubcategory' && editTarget) {
        await api.put(`/api/v1/catalog/admin/subcategories/${editTarget.id}`, body);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['adminCatalog'] });
      closeModal();
    },
    onError: (err) => setError(getErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/catalog/admin/subcategories/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['adminCatalog'] }),
  });

  function closeModal() {
    setModal(null);
    setEditTarget(null);
    setTargetCategoryId(null);
    setError('');
    setName('');
    setDescription('');
    setIconUrl('');
    setDisplayOrder('0');
    setPricingType('fixed');
    setBasePrice('');
    setMinPrice('');
    setMaxPrice('');
    setEstimatedDuration('');
  }

  function openAddCategory() {
    closeModal();
    setModal('addCategory');
  }

  function openEditCategory(cat: Category) {
    closeModal();
    setEditTarget(cat);
    setName(cat.name);
    setDescription(cat.description);
    setIconUrl(cat.iconUrl ?? '');
    setDisplayOrder(String(cat.displayOrder));
    setModal('editCategory');
  }

  function openAddSubcategory(categoryId: string) {
    closeModal();
    setTargetCategoryId(categoryId);
    setModal('addSubcategory');
  }

  function openEditSubcategory(sub: Subcategory) {
    closeModal();
    setEditTarget(sub);
    setTargetCategoryId(sub.categoryId);
    setName(sub.name);
    setDescription(sub.description);
    setPricingType(sub.pricingType);
    setBasePrice(sub.basePrice ? String(sub.basePrice / 100) : '');
    setMinPrice(sub.minPrice ? String(sub.minPrice / 100) : '');
    setMaxPrice(sub.maxPrice ? String(sub.maxPrice / 100) : '');
    setEstimatedDuration(sub.estimatedDurationMinutes ? String(sub.estimatedDurationMinutes) : '');
    setDisplayOrder(String(sub.displayOrder));
    setModal('editSubcategory');
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (modal === 'addCategory' || modal === 'editCategory') {
      categoryMutation.mutate();
    } else {
      subcategoryMutation.mutate();
    }
  };

  const isCategoryModal = modal === 'addCategory' || modal === 'editCategory';
  const isPending = categoryMutation.isPending || subcategoryMutation.isPending;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-[var(--color-secondary)] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text)]">Service Catalog</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">Manage categories and services</p>
        </div>
        <button
          onClick={openAddCategory}
          className="px-4 py-2 bg-[var(--color-primary)] text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
        >
          + Add Category
        </button>
      </div>

      <div className="space-y-3">
        {(data ?? []).map((cat) => (
          <div key={cat.id} className="bg-white rounded-xl border border-[var(--color-border)] overflow-hidden">
            <div
              className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-slate-50 transition-colors"
              onClick={() => setExpandedCategory(expandedCategory === cat.id ? null : cat.id)}
            >
              <div className="flex items-center gap-3">
                {cat.iconUrl && <img src={cat.iconUrl} alt="" className="w-8 h-8 rounded-lg object-cover" />}
                <div>
                  <p className="font-medium text-[var(--color-text)]">{cat.name}</p>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    {cat.subcategories.length} service{cat.subcategories.length !== 1 ? 's' : ''} — Order: {cat.displayOrder}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); openEditCategory(cat); }}
                  className="px-2 py-1 text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-md transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); openAddSubcategory(cat.id); }}
                  className="px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors"
                >
                  + Service
                </button>
                <span className="text-[var(--color-text-secondary)] text-lg">
                  {expandedCategory === cat.id ? '▾' : '▸'}
                </span>
              </div>
            </div>

            {expandedCategory === cat.id && (
              <div className="border-t border-[var(--color-border)]">
                {cat.subcategories.length === 0 ? (
                  <p className="text-sm text-[var(--color-text-secondary)] px-5 py-4">No services in this category yet.</p>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50/70 text-xs text-[var(--color-text-secondary)] uppercase tracking-wider">
                        <th className="text-left px-5 py-2 font-semibold">Service</th>
                        <th className="text-left px-4 py-2 font-semibold">Pricing</th>
                        <th className="text-left px-4 py-2 font-semibold">Duration</th>
                        <th className="text-left px-4 py-2 font-semibold">Order</th>
                        <th className="text-right px-5 py-2 font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cat.subcategories.map((sub) => (
                        <tr key={sub.id} className="border-t border-[var(--color-border)]">
                          <td className="px-5 py-3">
                            <p className="text-sm font-medium text-[var(--color-text)]">{sub.name}</p>
                            <p className="text-xs text-[var(--color-text-secondary)] line-clamp-1">{sub.description}</p>
                          </td>
                          <td className="px-4 py-3">
                            <Badge label={sub.pricingType} variant="outline" />
                            {sub.basePrice != null && (
                              <span className="ml-2 text-sm font-medium text-[var(--color-text)]">
                                {formatCurrency(sub.basePrice)}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">
                            {sub.estimatedDurationMinutes ? `${sub.estimatedDurationMinutes} min` : '—'}
                          </td>
                          <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">{sub.displayOrder}</td>
                          <td className="px-5 py-3 text-right">
                            <button
                              onClick={() => openEditSubcategory(sub)}
                              className="px-2 py-1 text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-md transition-colors mr-1"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(`Deactivate "${sub.name}"?`)) deleteMutation.mutate(sub.id);
                              }}
                              className="px-2 py-1 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-md transition-colors"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        ))}

        {(data ?? []).length === 0 && (
          <div className="text-center py-12 text-[var(--color-text-secondary)]">
            <p className="text-4xl mb-3">📦</p>
            <p>No categories yet. Create one to get started.</p>
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-[var(--color-border)] w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-[var(--color-text)] mb-4 capitalize">
              {modal.replace(/([A-Z])/g, ' $1').trim()}
            </h3>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
                />
              </div>

              {isCategoryModal && (
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Icon URL</label>
                  <input
                    type="text"
                    value={iconUrl}
                    onChange={(e) => setIconUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
                  />
                </div>
              )}

              {!isCategoryModal && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Pricing Type</label>
                      <select
                        value={pricingType}
                        onChange={(e) => setPricingType(e.target.value)}
                        className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
                      >
                        <option value="fixed">Fixed</option>
                        <option value="range">Range</option>
                        <option value="quote">Quote</option>
                        <option value="hourly">Hourly</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Base Price (₱)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={basePrice}
                        onChange={(e) => setBasePrice(e.target.value)}
                        placeholder="0.00"
                        className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Min Price (₱)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={minPrice}
                        onChange={(e) => setMinPrice(e.target.value)}
                        placeholder="Optional"
                        className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Max Price (₱)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={maxPrice}
                        onChange={(e) => setMaxPrice(e.target.value)}
                        placeholder="Optional"
                        className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Estimated Duration (minutes)</label>
                    <input
                      type="number"
                      value={estimatedDuration}
                      onChange={(e) => setEstimatedDuration(e.target.value)}
                      placeholder="Optional"
                      className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Display Order</label>
                <input
                  type="number"
                  value={displayOrder}
                  onChange={(e) => setDisplayOrder(e.target.value)}
                  className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-sm border border-[var(--color-border)] rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending || !name.trim()}
                  className="px-4 py-2 text-sm bg-[var(--color-primary)] text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                >
                  {isPending ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
