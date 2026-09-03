import React, { useState, Fragment, type FormEvent } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import api, { getErrorMessage } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { Badge, ErrorState, Label, LoadingState, Input, Textarea, useReasonDialog } from '@/components/ui';
import { ChevronDown, ChevronRight, Package } from '@/components/icons';
import { IntakeFieldsManager } from '@/components/IntakeFieldsManager';
import { useAuthStore } from '@/stores/auth.store';

const CURRENCY_SYMBOL = '₱';
const CUSTOMER_SERVICE_SCOPE_MIN = 30;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  // D27 Phase 4 — per-unit rate (unitPrice is centavos per unitLabel).
  unitLabel: string | null;
  unitPrice: number | null;
  // D27 Phase 4b — hourly rate (centavos per hour).
  hourlyRate: number | null;
  displayOrder: number;
  isActive: boolean;
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

interface Addon {
  id: string;
  subcategoryId: string;
  name: string;
  description: string;
  price: number;
  isActive: boolean;
  displayOrder: number;
  exceedsCurrentPriceCap: boolean;
}

type ModalMode = null | 'addCategory' | 'editCategory' | 'addSubcategory' | 'editSubcategory' | 'addAddon' | 'editAddon';

export default function CatalogPage(): React.ReactElement {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { requestReason, reasonDialog } = useReasonDialog();
  const isSuperAdmin = useAuthStore((state) => state.user?.role === 'super_admin');
  const rawCategoryId = searchParams.get('categoryId')?.trim() ?? '';
  const rawSubcategoryId = searchParams.get('subcategoryId')?.trim() ?? '';
  const rawAddonId = searchParams.get('addonId')?.trim() ?? '';
  const rawView = searchParams.get('view')?.trim() ?? '';
  const requestedCategoryId = UUID_REGEX.test(rawCategoryId) ? rawCategoryId : '';
  const requestedSubcategoryId = UUID_REGEX.test(rawSubcategoryId) ? rawSubcategoryId : '';
  const requestedAddonId = UUID_REGEX.test(rawAddonId) ? rawAddonId : '';
  const catalogParamError = rawCategoryId && !requestedCategoryId
    ? 'The service category ID must be a complete UUID.'
    : rawSubcategoryId && !requestedSubcategoryId
      ? 'The customer service ID must be a complete UUID.'
      : rawAddonId && !requestedAddonId
        ? 'The service add-on ID must be a complete UUID.'
        : requestedSubcategoryId && !requestedCategoryId
          ? 'A customer service evidence link must include its category ID.'
          : requestedAddonId && (!requestedCategoryId || !requestedSubcategoryId)
            ? 'A service add-on evidence link must include its category and customer service IDs.'
            : rawView && rawView !== 'addons'
              ? 'The requested catalog view is not supported.'
              : rawView === 'addons' && (!requestedCategoryId || !requestedSubcategoryId)
                ? 'The add-on view must include its category and customer service IDs.'
            : '';
  const [localExpandedCategory, setLocalExpandedCategory] = useState<string | null>(null);
  const expandedCategory = requestedCategoryId || localExpandedCategory;
  const [serviceFilter, setServiceFilter] = useState<'all' | 'needsScope' | 'inactive'>('all');
  const [modal, setModal] = useState<ModalMode>(null);
  const [editTarget, setEditTarget] = useState<Category | Subcategory | null>(null);
  const [targetCategoryId, setTargetCategoryId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [addonSubcatId, setAddonSubcatId] = useState<string | null>(null);
  const [addonEditTarget, setAddonEditTarget] = useState<Addon | null>(null);
  const [addonName, setAddonName] = useState('');
  const [addonDesc, setAddonDesc] = useState('');
  const [addonPrice, setAddonPrice] = useState('');
  const [addonOrder, setAddonOrder] = useState('0');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [iconUrl, setIconUrl] = useState('');
  const [displayOrder, setDisplayOrder] = useState('0');
  const [pricingType, setPricingType] = useState('fixed');
  const [basePrice, setBasePrice] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [estimatedDuration, setEstimatedDuration] = useState('');
  // D27 Phase 4 — per-unit rate.
  const [unitLabel, setUnitLabel] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  // D27 Phase 4b — hourly rate.
  const [hourlyRate, setHourlyRate] = useState('');

  const { data, isLoading, isError, error: catalogError, refetch: refetchCatalog } = useQuery({
    queryKey: ['adminCatalog'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: Category[] }>('/api/v1/catalog/admin/full');
      return res.data.data;
    },
    refetchOnWindowFocus: false,
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

  // BUG-PHASE93-01 fix — pre-fix prices were converted with
  // `Number(x) * 100` and sent raw. JS floating-point makes
  // `500.55 * 100 === 50055.00000000001`. The server's
  // service_subcategories.base_price column is INTEGER (centavos,
  // per migration 003), so Postgres rejects the non-integer
  // parameter with "invalid input syntax for type integer". Admins
  // entering a price that wasn't a multiple of ₱0.50 saw an opaque
  // server error and had to retry. Math.round bakes off the float
  // rounding error to the nearest centavo before submit.
  const toCentavos = (raw: string): number | null => {
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return Math.round(n * 100);
  };

  const isFiniteNumber = (raw: string): boolean => raw === '' || Number.isFinite(Number(raw));

  const validateForm = (): string | null => {
    if (isAddonModal) {
      if (!addonName.trim()) return 'Add-on name is required.';
      if (!isFiniteNumber(addonPrice) || Number(addonPrice) < 0) return 'Add-on price must be a valid non-negative amount.';
      const addonPriceCentavos = Math.round(Number(addonPrice) * 100);
      const preservesGrandfatheredPrice = modal === 'editAddon'
        && addonEditTarget !== null
        && addonPriceCentavos === addonEditTarget.price;
      if (
        addonPriceCapCentavos !== null
        && !preservesGrandfatheredPrice
        && addonPriceCentavos > addonPriceCapCentavos
      ) {
        return `Add-on price cannot exceed the current ${formatCurrency(addonPriceCapCentavos)} authoring limit.`;
      }
      if (!isFiniteNumber(addonOrder)) return 'Display order must be a valid number.';
      return null;
    }

    if (!name.trim()) return 'Name is required.';
    if (!isFiniteNumber(displayOrder)) return 'Display order must be a valid number.';
    if (isCategoryModal) return null;
    if (description.trim().length < CUSTOMER_SERVICE_SCOPE_MIN) {
      return `Customer service scope must be at least ${CUSTOMER_SERVICE_SCOPE_MIN} characters.`;
    }

    if (![basePrice, minPrice, maxPrice, estimatedDuration].every(isFiniteNumber)) {
      return 'Prices and duration must be valid numbers.';
    }
    if ([basePrice, minPrice, maxPrice, estimatedDuration].some((value) => value !== '' && Number(value) < 0)) {
      return 'Prices and duration cannot be negative.';
    }
    if (pricingType === 'fixed' && basePrice === '') {
      return 'Base price is required for fixed services.';
    }
    // D27 Phase 4 — per-unit services need a unit label + a unit price.
    if (pricingType === 'per_unit') {
      if (!unitLabel.trim()) return 'Per-unit services need a unit label (e.g. "sqm").';
      if (unitPrice === '' || !Number.isFinite(Number(unitPrice)) || Number(unitPrice) < 0) {
        return 'Per-unit services need a valid unit price.';
      }
    }
    // D27 Phase 4b — hourly services need an hourly rate.
    if (pricingType === 'hourly') {
      if (hourlyRate === '' || !Number.isFinite(Number(hourlyRate)) || Number(hourlyRate) <= 0) {
        return 'Hourly services need a valid hourly rate.';
      }
    }
    // 'range' is no longer a selectable/saveable pricing type (DB CHECK in
    // migration 003 allows only fixed/quote/hourly); its dead validation branch
    // was removed. Legacy 'range' rows (none on prod) are coerced on edit below.
    return null;
  };

  const subcategoryMutation = useMutation({
    mutationFn: async () => {
      const body = {
        name: name.trim(),
        description: description.trim(),
        pricingType,
        basePrice: pricingType === 'fixed' ? toCentavos(basePrice) : null,
        minPrice: pricingType === 'fixed' ? toCentavos(minPrice) : null,
        maxPrice: pricingType === 'fixed' ? toCentavos(maxPrice) : null,
        estimatedDurationMinutes: estimatedDuration ? Number(estimatedDuration) : null,
        unitLabel: pricingType === 'per_unit' ? (unitLabel.trim() || null) : null,
        unitPrice: pricingType === 'per_unit' ? toCentavos(unitPrice) : null,
        hourlyRate: pricingType === 'hourly' ? toCentavos(hourlyRate) : null,
        displayOrder: Number(displayOrder),
      };
      if (modal === 'addSubcategory') {
        await api.post('/api/v1/catalog/admin/subcategories', { categoryId: targetCategoryId, ...body });
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
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.delete(`/api/v1/catalog/admin/subcategories/${id}`, { body: { reason } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['adminCatalog'] }),
    onError: (err) => setError(getErrorMessage(err)),
  });

  const reactivateServiceMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/api/v1/catalog/admin/subcategories/${id}/reactivate`, { reason }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['adminCatalog'] }),
    onError: (err) => setError(getErrorMessage(err)),
  });

  const [localExpandedAddons, setLocalExpandedAddons] = useState<string | null>(null);
  const expandedAddons = (requestedAddonId || rawView === 'addons') && requestedSubcategoryId
    ? requestedSubcategoryId
    : localExpandedAddons;
  // D27 Phase 2 — which subcategory's intake-field editor is open.
  const [expandedIntake, setExpandedIntake] = useState<string | null>(null);

  const {
    data: addonsData,
    isLoading: isAddonsLoading,
    isError: isAddonsError,
    refetch: refetchAddons,
  } = useQuery({
    queryKey: ['adminAddons', expandedAddons],
    queryFn: async () => {
      if (!expandedAddons) return { addons: [], priceCapCentavos: null };
      const res = await api.get<{ success: boolean; data: Addon[]; meta: { priceCapCentavos: number } }>(
        `/api/v1/catalog/admin/subcategories/${expandedAddons}/addons`,
      );
      return {
        addons: res.data.data,
        priceCapCentavos: res.data.meta.priceCapCentavos,
      };
    },
    enabled: !!expandedAddons,
  });

  const addonMutation = useMutation({
    mutationFn: async () => {
      const price = addonPrice ? Math.round(Number(addonPrice) * 100) : 0;
      const commonBody = {
        name: addonName.trim(),
        description: addonDesc.trim(),
        displayOrder: Number(addonOrder),
      };
      if (modal === 'addAddon') {
        await api.post('/api/v1/catalog/admin/addons', {
          subcategoryId: addonSubcatId,
          ...commonBody,
          price,
        });
      } else if (modal === 'editAddon' && addonEditTarget) {
        await api.put(`/api/v1/catalog/admin/addons/${addonEditTarget.id}`, {
          ...commonBody,
          ...(price !== addonEditTarget.price ? { price } : {}),
        });
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['adminAddons', expandedAddons] });
      closeModal();
    },
    onError: (err) => setError(getErrorMessage(err)),
  });

  const deleteAddonMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.delete(`/api/v1/catalog/admin/addons/${id}`, { body: { reason } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['adminAddons', expandedAddons] }),
    onError: (err) => setError(getErrorMessage(err)),
  });

  const reactivateAddonMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/api/v1/catalog/admin/addons/${id}/reactivate`, { reason }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['adminAddons', expandedAddons] }),
    onError: (err) => setError(getErrorMessage(err)),
  });

  function closeModal(): void {
    setModal(null);
    setEditTarget(null);
    setTargetCategoryId(null);
    setAddonEditTarget(null);
    setAddonSubcatId(null);
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
    setUnitLabel('');
    setUnitPrice('');
    setHourlyRate('');
    setAddonName('');
    setAddonDesc('');
    setAddonPrice('');
    setAddonOrder('0');
  }

  function openAddCategory(): void {
    closeModal();
    setModal('addCategory');
  }

  function openEditCategory(cat: Category): void {
    closeModal();
    setEditTarget(cat);
    setName(cat.name);
    setDescription(cat.description);
    setIconUrl(cat.iconUrl ?? '');
    setDisplayOrder(String(cat.displayOrder));
    setModal('editCategory');
  }

  function openAddSubcategory(categoryId: string): void {
    closeModal();
    setTargetCategoryId(categoryId);
    setModal('addSubcategory');
  }

  function openEditSubcategory(sub: Subcategory): void {
    closeModal();
    setEditTarget(sub);
    setTargetCategoryId(sub.categoryId);
    setName(sub.name);
    setDescription(sub.description);
    // Coerce any legacy/unsupported pricing type (e.g. an old 'range' row) to a
    // valid, selectable one so re-saving can't send a value the DB CHECK rejects.
    setPricingType(['fixed', 'quote', 'hourly', 'per_unit'].includes(sub.pricingType) ? sub.pricingType : 'quote');
    // Phase 200 zero-price fix — a legitimate 0-centavo price is falsy and
    // wrongly showed blank; check null/undefined explicitly instead.
    setBasePrice(sub.basePrice != null ? String(sub.basePrice / 100) : '');
    setMinPrice(sub.minPrice != null ? String(sub.minPrice / 100) : '');
    setMaxPrice(sub.maxPrice != null ? String(sub.maxPrice / 100) : '');
    setEstimatedDuration(sub.estimatedDurationMinutes ? String(sub.estimatedDurationMinutes) : '');
    setUnitLabel(sub.unitLabel ?? '');
    setUnitPrice(sub.unitPrice != null ? String(sub.unitPrice / 100) : '');
    setHourlyRate(sub.hourlyRate != null ? String(sub.hourlyRate / 100) : '');
    setDisplayOrder(String(sub.displayOrder));
    setModal('editSubcategory');
  }

  function openAddAddon(subcategoryId: string): void {
    closeModal();
    setAddonSubcatId(subcategoryId);
    setModal('addAddon');
  }

  function openEditAddon(addon: Addon): void {
    closeModal();
    setAddonEditTarget(addon);
    setAddonSubcatId(addon.subcategoryId);
    setAddonName(addon.name);
    setAddonDesc(addon.description);
    setAddonPrice(String(addon.price / 100));
    setAddonOrder(String(addon.displayOrder));
    setModal('editAddon');
  }

  function toggleCategory(categoryId: string): void {
    const nextCategoryId = expandedCategory === categoryId ? null : categoryId;
    setLocalExpandedCategory(nextCategoryId);
    setLocalExpandedAddons(null);
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      if (nextCategoryId) params.set('categoryId', nextCategoryId);
      else params.delete('categoryId');
      params.delete('subcategoryId');
      params.delete('addonId');
      params.delete('view');
      return params;
    });
  }

  function toggleAddons(categoryId: string, subcategoryId: string): void {
    const nextSubcategoryId = expandedAddons === subcategoryId ? null : subcategoryId;
    setLocalExpandedCategory(categoryId);
    setLocalExpandedAddons(nextSubcategoryId);
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.set('categoryId', categoryId);
      if (nextSubcategoryId) {
        params.set('subcategoryId', nextSubcategoryId);
        params.set('view', 'addons');
      } else {
        params.delete('subcategoryId');
        params.delete('view');
      }
      params.delete('addonId');
      return params;
    });
  }

  function clearCatalogEvidence(): void {
    setLocalExpandedCategory(null);
    setLocalExpandedAddons(null);
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.delete('categoryId');
      params.delete('subcategoryId');
      params.delete('addonId');
      params.delete('view');
      return params;
    });
  }

  async function deactivateService(service: Subcategory): Promise<void> {
    const reason = await requestReason({
      title: 'Deactivate customer service?',
      description: `“${service.name}” will stop appearing in customer booking and cannot receive new bookings. Historical bookings and their pricing evidence remain available.`,
      confirmLabel: 'Deactivate service',
      reasonLabel: 'Deactivation reason',
      minLength: 10,
      maxLength: 2000,
    });
    if (reason) deleteMutation.mutate({ id: service.id, reason });
  }

  async function deactivateAddon(addon: Addon): Promise<void> {
    const reason = await requestReason({
      title: 'Deactivate customer add-on?',
      description: `“${addon.name}” will stop appearing as an option on new customer bookings. Historical booking selections remain available.`,
      confirmLabel: 'Deactivate add-on',
      reasonLabel: 'Deactivation reason',
      minLength: 10,
      maxLength: 2000,
    });
    if (reason) deleteAddonMutation.mutate({ id: addon.id, reason });
  }

  async function reactivateService(service: Subcategory): Promise<void> {
    const reason = await requestReason({
      title: 'Restore customer service?',
      description: `“${service.name}” will return to customer discovery and new booking after its saved scope and pricing pass server validation. Historical records are unchanged.`,
      confirmLabel: 'Restore service',
      reasonLabel: 'Restoration reason',
      minLength: 10,
      maxLength: 2000,
    });
    if (reason) reactivateServiceMutation.mutate({ id: service.id, reason });
  }

  async function reactivateAddon(addon: Addon): Promise<void> {
    const reason = await requestReason({
      title: 'Restore customer add-on?',
      description: `“${addon.name}” will return as an option on new customer bookings if its parent service is active and its price remains within the configured limit.`,
      confirmLabel: 'Restore add-on',
      reasonLabel: 'Restoration reason',
      minLength: 10,
      maxLength: 2000,
    });
    if (reason) reactivateAddonMutation.mutate({ id: addon.id, reason });
  }

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    if (modal === 'addCategory' || modal === 'editCategory') {
      categoryMutation.mutate();
    } else if (modal === 'addAddon' || modal === 'editAddon') {
      addonMutation.mutate();
    } else {
      subcategoryMutation.mutate();
    }
  };

  const isCategoryModal = modal === 'addCategory' || modal === 'editCategory';
  const isAddonModal = modal === 'addAddon' || modal === 'editAddon';
  const isPending = categoryMutation.isPending || subcategoryMutation.isPending || addonMutation.isPending;
  const categories = data ?? [];
  const allServices = categories.flatMap((category) => category.subcategories);
  const activeServices = allServices.filter((service) => service.isActive !== false);
  const inactiveServices = allServices.filter((service) => service.isActive === false);
  const missingScopeCount = activeServices.filter(
    (service) => service.description.trim().length < CUSTOMER_SERVICE_SCOPE_MIN,
  ).length;
  const readyScopeCount = activeServices.length - missingScopeCount;
  const addons = addonsData?.addons ?? [];
  const addonPriceCapCentavos = addonsData?.priceCapCentavos ?? null;
  const activeAddonsAboveCap = addons.filter((addon) => addon.exceedsCurrentPriceCap);
  const selectedCategory = requestedCategoryId
    ? categories.find((category) => category.id === requestedCategoryId)
    : undefined;
  const selectedServiceOwner = requestedSubcategoryId
    ? categories.find((category) => (
        category.subcategories.some((subcategory) => subcategory.id === requestedSubcategoryId)
      ))
    : undefined;
  const selectedAddon = requestedAddonId
    ? addons.find((addon) => addon.id === requestedAddonId)
    : undefined;
  const catalogSelectionError = catalogParamError
    || (requestedCategoryId && !selectedCategory
      ? 'The selected service category is no longer present in the retained catalog.'
      : '')
    || (requestedSubcategoryId && !selectedServiceOwner
      ? 'The selected customer service is no longer present in the retained catalog.'
      : '')
    || (selectedServiceOwner && selectedServiceOwner.id !== requestedCategoryId
      ? 'The selected customer service does not belong to the category recorded in this link.'
      : '')
    || (requestedAddonId && !isAddonsLoading && !isAddonsError && !selectedAddon
      ? 'The selected service add-on is no longer present under the recorded customer service.'
      : '');
  const editingGrandfatheredAddon = modal === 'editAddon'
    && addonEditTarget !== null
    && addonPriceCapCentavos !== null
    && addonEditTarget.price > addonPriceCapCentavos;
  const visibleCategories = serviceFilter === 'all'
    ? categories
    : categories
      .map((category) => ({
        ...category,
        subcategories: category.subcategories.filter((service) => (
          serviceFilter === 'inactive'
            ? service.isActive === false
            : service.isActive !== false && service.description.trim().length < CUSTOMER_SERVICE_SCOPE_MIN
        )),
      }))
      .filter((category) => category.subcategories.length > 0);

  if (isLoading) {
    return <LoadingState label="Loading the service catalog…" className="min-h-72" />;
  }

  if (isError) {
    return (
      <ErrorState
        title="Service catalog unavailable"
        description={`${getErrorMessage(catalogError)} Published booking scope and pricing cannot be verified.`}
        action={
          <button
            type="button"
            onClick={(): void => { void refetchCatalog(); }}
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white"
          >
            Retry catalog
          </button>
        }
      />
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text)]">Service Catalog</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">Publish the service scope, pricing, intake questions, and add-ons customers use to book.</p>
        </div>
        {isSuperAdmin ? <button
          type="button"
          onClick={openAddCategory}
          className="min-h-11 px-4 py-2 bg-[var(--color-primary)] text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
        >
          + Add Category
        </button> : null}
      </div>

      {!isSuperAdmin && (
        <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
          You have read-only catalog access. A super admin must publish or change categories, services, pricing, add-ons, and intake fields.
        </div>
      )}

      {catalogSelectionError && (
        <div role="alert" className="mb-4 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-semibold">Catalog selection unavailable</p>
          <p className="mt-1">{catalogSelectionError}</p>
          <button
            type="button"
            onClick={clearCatalogEvidence}
            className="mt-3 min-h-11 rounded-md border border-red-300 bg-white px-3 py-2 font-semibold"
          >
            Remove catalog selection
          </button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-4" aria-label="Catalog publishing status">
        <button
          type="button"
          onClick={() => setServiceFilter('all')}
          aria-pressed={serviceFilter === 'all'}
          className={`min-h-24 rounded-xl border p-4 text-left transition-colors ${serviceFilter === 'all' ? 'border-[var(--color-primary)] bg-blue-50' : 'border-[var(--color-border)] bg-white hover:bg-slate-50'}`}
        >
          <span className="block text-2xl font-bold text-[var(--color-text)]">{activeServices.length}</span>
          <span className="text-sm text-[var(--color-text-secondary)]">Active services</span>
        </button>
        <button
          type="button"
          onClick={() => setServiceFilter('needsScope')}
          aria-pressed={serviceFilter === 'needsScope'}
          className={`min-h-24 rounded-xl border p-4 text-left transition-colors ${serviceFilter === 'needsScope' ? 'border-amber-500 bg-amber-50' : 'border-[var(--color-border)] bg-white hover:bg-slate-50'}`}
        >
          <span className="block text-2xl font-bold text-amber-800">{missingScopeCount}</span>
          <span className="text-sm text-amber-800">Need customer scope</span>
        </button>
        <div className="min-h-24 rounded-xl border border-[var(--color-border)] bg-white p-4">
          <span className="block text-2xl font-bold text-emerald-700">{readyScopeCount}</span>
          <span className="text-sm text-[var(--color-text-secondary)]">Scope ready</span>
        </div>
        <button
          type="button"
          onClick={() => setServiceFilter('inactive')}
          aria-pressed={serviceFilter === 'inactive'}
          className={`min-h-24 rounded-xl border p-4 text-left transition-colors ${serviceFilter === 'inactive' ? 'border-slate-600 bg-slate-100' : 'border-[var(--color-border)] bg-white hover:bg-slate-50'}`}
        >
          <span className="block text-2xl font-bold text-slate-700">{inactiveServices.length}</span>
          <span className="text-sm text-[var(--color-text-secondary)]">Inactive services</span>
        </button>
      </div>

      {missingScopeCount > 0 && (
        <div role="alert" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <span className="font-semibold">{missingScopeCount} active service{missingScopeCount === 1 ? '' : 's'} need customer scope.</span>{' '}
          These services currently show an honest fallback to customers. Add what is covered and important limits before changing any other service details.
        </div>
      )}

      {error && !modal && (
        <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {visibleCategories.map((cat) => {
          const categoryExpanded = serviceFilter !== 'all' || expandedCategory === cat.id;
          return (
          <div
            key={cat.id}
            className={`bg-white rounded-xl border overflow-hidden ${requestedCategoryId === cat.id ? 'border-sky-500 ring-2 ring-sky-200' : 'border-[var(--color-border)]'}`}
          >
            <div className="flex items-center justify-between gap-3 px-3 py-2 sm:px-5 sm:py-3">
              <button
                type="button"
                aria-expanded={categoryExpanded}
                aria-label={`${categoryExpanded ? 'Collapse' : 'Expand'} ${cat.name} services`}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-2 text-left hover:bg-[var(--color-surface-hover)]"
                onClick={() => {
                  if (serviceFilter === 'all') {
                    toggleCategory(cat.id);
                  }
                }}
              >
                {cat.iconUrl && <img src={cat.iconUrl} alt="" className="w-8 h-8 rounded-lg object-cover" />}
                <span className="min-w-0 flex-1">
                  <p className="font-medium text-[var(--color-text)]">
                    {cat.name}
                    {requestedCategoryId === cat.id && !requestedSubcategoryId ? (
                      <span className="sr-only"> Selected catalog record</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    {cat.subcategories.length} service{cat.subcategories.length !== 1 ? 's' : ''} — Order: {cat.displayOrder}
                  </p>
                </span>
                {categoryExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              </button>
              <div className="flex shrink-0 items-center gap-2">
                {isSuperAdmin && <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); openEditCategory(cat); }}
                  aria-label={`Edit category ${cat.name}`}
                  className="min-h-11 px-3 py-2 text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-md transition-colors"
                >
                  Edit
                </button>}
                {isSuperAdmin && <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); openAddSubcategory(cat.id); }}
                  aria-label={`Add service to ${cat.name}`}
                  className="min-h-11 px-3 py-2 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors"
                >
                  + Service
                </button>}
              </div>
            </div>

            {categoryExpanded && (
              <div className="border-t border-[var(--color-border)]">
                {cat.subcategories.length === 0 ? (
                  <p className="text-sm text-[var(--color-text-secondary)] px-5 py-4">No services in this category yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                  <table className="w-full min-w-[800px]">
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
                        <Fragment key={sub.id}>
                        <tr className={`border-t border-[var(--color-border)] ${requestedSubcategoryId === sub.id ? 'bg-sky-50' : ''}`}>
                          <td className="px-5 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-medium text-[var(--color-text)]">
                                {sub.name}
                                {requestedSubcategoryId === sub.id && !requestedAddonId ? (
                                  <span className="sr-only"> Selected catalog record</span>
                                ) : null}
                              </p>
                              {sub.isActive === false ? <Badge label="Inactive" variant="outline" /> : null}
                            </div>
                            {sub.description.trim().length >= CUSTOMER_SERVICE_SCOPE_MIN ? (
                              <p className="text-xs text-[var(--color-text-secondary)] line-clamp-2">{sub.description}</p>
                            ) : (
                              <div className="mt-1"><Badge label="Missing customer scope" variant="warning" /></div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {/* BUG-PHASE40-01 fix — pre-fix the Pricing
                                column showed only basePrice. For
                                pricingType=range services the basePrice
                                is typically null but minPrice/maxPrice
                                are set, so admin saw only the "range"
                                badge with no numbers — couldn't tell
                                the price band without opening the
                                edit modal. Now shows ₱min – ₱max for
                                range, ₱base/hr for hourly, "(quote on
                                request)" for quote, and ₱base for
                                fixed. */}
                            <Badge label={sub.pricingType} variant="outline" />
                            {sub.pricingType === 'range' && (sub.minPrice != null || sub.maxPrice != null) ? (
                              <span className="ml-2 text-sm font-medium text-[var(--color-text)]">
                                {sub.minPrice != null ? formatCurrency(sub.minPrice) : '—'} – {sub.maxPrice != null ? formatCurrency(sub.maxPrice) : '—'}
                              </span>
                            ) : sub.pricingType === 'quote' ? (
                              <span className="ml-2 text-sm text-[var(--color-text-secondary)]">
                                (quote on request)
                              </span>
                            ) : sub.pricingType === 'per_unit' && sub.unitPrice != null ? (
                              <span className="ml-2 text-sm font-medium text-[var(--color-text)]">
                                {formatCurrency(sub.unitPrice)}<span className="text-[var(--color-text-secondary)]">/{sub.unitLabel ?? 'unit'}</span>
                              </span>
                            ) : sub.pricingType === 'hourly' && sub.hourlyRate != null ? (
                              <span className="ml-2 text-sm font-medium text-[var(--color-text)]">
                                {formatCurrency(sub.hourlyRate)}<span className="text-[var(--color-text-secondary)]">/hr</span>
                              </span>
                            ) : sub.basePrice != null ? (
                              <span className="ml-2 text-sm font-medium text-[var(--color-text)]">
                                {formatCurrency(sub.basePrice)}
                                {sub.pricingType === 'hourly' && (
                                  <span className="text-[var(--color-text-secondary)]">/hr</span>
                                )}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">
                            {sub.estimatedDurationMinutes ? `${sub.estimatedDurationMinutes} min` : '—'}
                          </td>
                          <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">{sub.displayOrder}</td>
                          <td className="px-5 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => toggleAddons(cat.id, sub.id)}
                              aria-expanded={expandedAddons === sub.id}
                              aria-label={`${expandedAddons === sub.id ? 'Hide' : 'Show'} add-ons for ${sub.name}`}
                              className="min-h-11 px-3 py-2 text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-md transition-colors mr-1"
                            >
                              Add-ons
                            </button>
                            <button
                              type="button"
                              onClick={() => setExpandedIntake(expandedIntake === sub.id ? null : sub.id)}
                              aria-expanded={expandedIntake === sub.id}
                              aria-label={`${expandedIntake === sub.id ? 'Hide' : 'Show'} intake fields for ${sub.name}`}
                              className="min-h-11 px-3 py-2 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-md transition-colors mr-1"
                            >
                              Intake
                            </button>
                            {isSuperAdmin && <button
                              type="button"
                              onClick={() => openEditSubcategory(sub)}
                              aria-label={`Edit service ${sub.name}`}
                              className="min-h-11 px-3 py-2 text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-md transition-colors mr-1"
                            >
                              Edit
                            </button>}
                            {isSuperAdmin && sub.isActive !== false && <button
                              type="button"
                              onClick={() => void deactivateService(sub)}
                              aria-label={`Deactivate service ${sub.name}`}
                              className="min-h-11 px-3 py-2 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-md transition-colors"
                            >
                              Deactivate
                            </button>}
                            {isSuperAdmin && sub.isActive === false && <button
                              type="button"
                              onClick={() => void reactivateService(sub)}
                              aria-label={`Restore service ${sub.name}`}
                              className="min-h-11 px-3 py-2 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors"
                            >
                              Restore
                            </button>}
                          </td>
                        </tr>
                        {expandedAddons === sub.id && (
                          <tr>
                            <td colSpan={5} className="bg-purple-50/40 px-5 py-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-semibold text-purple-800 uppercase tracking-wider">
                                  Add-ons for {sub.name}
                                </span>
                                {isSuperAdmin && <button
                                  type="button"
                                  onClick={() => openAddAddon(sub.id)}
                                  aria-label={`Add add-on to ${sub.name}`}
                                  className="min-h-11 px-3 py-2 text-xs font-medium text-purple-700 bg-purple-100 hover:bg-purple-200 rounded-md transition-colors"
                                >
                                  + Add-on
                                </button>}
                              </div>
                              {isAddonsLoading ? (
                                <p className="text-xs text-[var(--color-text-secondary)]">Loading add-ons…</p>
                              ) : isAddonsError ? (
                                <div role="alert" className="flex flex-wrap items-center justify-between gap-2 text-xs text-red-700">
                                  <span>Add-ons are unavailable. Customer options cannot be verified.</span>
                                  <button
                                    type="button"
                                    onClick={() => { void refetchAddons(); }}
                                    className="min-h-11 rounded-md border border-red-300 bg-white px-3 py-2 font-semibold"
                                  >
                                    Retry add-ons
                                  </button>
                                </div>
                              ) : addons.length === 0 ? (
                                <p className="text-xs text-[var(--color-text-secondary)]">No add-ons yet.</p>
                              ) : (
                                <div className="space-y-1">
                                  {activeAddonsAboveCap.length > 0 && addonPriceCapCentavos !== null ? (
                                    <div role="alert" className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                                      <span className="font-semibold">
                                        {activeAddonsAboveCap.length} active add-on{activeAddonsAboveCap.length === 1 ? '' : 's'} {activeAddonsAboveCap.length === 1 ? 'is' : 'are'} above the current {formatCurrency(addonPriceCapCentavos)} authoring limit.
                                      </span>{' '}
                                      {activeAddonsAboveCap.length === 1 ? 'It remains' : 'They remain'} visible and bookable to customers until a super admin edits each price to the allowed range or deactivates the add-on. Historical booking prices do not change.
                                    </div>
                                  ) : null}
                                  {addons.map((addon) => (
                                    <div
                                      key={addon.id}
                                      className={`flex flex-col gap-3 bg-white rounded-md px-3 py-2 border sm:flex-row sm:items-center sm:justify-between ${requestedAddonId === addon.id ? 'border-sky-500 ring-2 ring-sky-200' : 'border-purple-100'}`}
                                    >
                                      <div className="min-w-0">
                                        <span className="text-sm font-medium text-[var(--color-text)]">
                                          {addon.name}
                                          {requestedAddonId === addon.id ? (
                                            <span className="sr-only"> Selected catalog record</span>
                                          ) : null}
                                        </span>
                                        {addon.description && (
                                          <span className="ml-2 text-xs text-[var(--color-text-secondary)]">{addon.description}</span>
                                        )}
                                      </div>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-sm font-medium text-[var(--color-text)]">{formatCurrency(addon.price)}</span>
                                        {addon.exceedsCurrentPriceCap && <Badge label="Above current price limit" variant="warning" />}
                                        {!addon.isActive && <span className="text-xs text-red-600">(inactive)</span>}
                                        {isSuperAdmin && <button
                                          type="button"
                                          onClick={() => openEditAddon(addon)}
                                          aria-label={`Edit add-on ${addon.name}`}
                                          className="min-h-11 px-3 py-2 text-xs text-sky-700 bg-sky-50 rounded hover:bg-sky-100 transition-colors"
                                        >
                                          Edit
                                        </button>}
                                        {isSuperAdmin && addon.isActive && <button
                                          type="button"
                                          onClick={() => void deactivateAddon(addon)}
                                          aria-label={`Deactivate add-on ${addon.name}`}
                                          className="min-h-11 px-3 py-2 text-xs text-red-700 bg-red-50 rounded hover:bg-red-100 transition-colors"
                                        >
                                          Deactivate
                                        </button>}
                                        {isSuperAdmin && !addon.isActive && <button
                                          type="button"
                                          onClick={() => void reactivateAddon(addon)}
                                          aria-label={`Restore add-on ${addon.name}`}
                                          className="min-h-11 px-3 py-2 text-xs text-emerald-800 bg-emerald-50 rounded hover:bg-emerald-100 transition-colors"
                                        >
                                          Restore
                                        </button>}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                        {expandedIntake === sub.id && (
                          <tr>
                            <td colSpan={5} className="p-0">
                              <IntakeFieldsManager subcategoryId={sub.id} subcategoryName={sub.name} readOnly={!isSuperAdmin} />
                            </td>
                          </tr>
                        )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                  </div>
                )}
              </div>
            )}
          </div>
          );
        })}

        {categories.length === 0 && (
          <div className="text-center py-12 text-[var(--color-text-secondary)]">
            <Package size={40} className="mx-auto mb-3 text-slate-400" />
            <p>No categories yet. Create one to get started.</p>
          </div>
        )}
        {categories.length > 0 && visibleCategories.length === 0 && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-8 text-center text-emerald-800">
            {serviceFilter === 'inactive'
              ? 'No inactive services. Every listed service is currently available for discovery.'
              : 'Every active service has customer scope copy.'}
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="catalog-modal-title"
            className="bg-white rounded-xl border border-[var(--color-border)] w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto"
          >
            <h3 id="catalog-modal-title" className="text-lg font-semibold text-[var(--color-text)] mb-4 capitalize">
              {modal.replace(/([A-Z])/g, ' $1').trim()}
            </h3>

            {error && (
              <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {isAddonModal ? (
                <>
                  <div>
                    <Label htmlFor="cat-addon-name" className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Add-on name</Label>
                    <Input
                      id="cat-addon-name"
                      type="text"
                      value={addonName}
                      onChange={(e) => setAddonName(e.target.value)}
                      maxLength={100}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="cat-addon-desc" className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Description</Label>
                    <Textarea
                      id="cat-addon-desc"
                      value={addonDesc}
                      onChange={(e) => setAddonDesc(e.target.value)}
                      maxLength={1000}
                      rows={2}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="cat-addon-price" className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Price ({CURRENCY_SYMBOL})</Label>
                      <Input
                        id="cat-addon-price"
                        type="number"
                        step="0.01"
                        min="0"
                        max={addonPriceCapCentavos !== null && !editingGrandfatheredAddon
                          ? String(addonPriceCapCentavos / 100)
                          : undefined}
                        value={addonPrice}
                        onChange={(e) => setAddonPrice(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="cat-addon-order" className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Display order</Label>
                      <Input
                        id="cat-addon-order"
                        type="number"
                        step="1"
                        value={addonOrder}
                        onChange={(e) => setAddonOrder(e.target.value)}
                      />
                    </div>
                  </div>
                </>
              ) : (
              <>
              <div>
                <Label htmlFor="cat-name" className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Name</Label>
                <Input
                  id="cat-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                  required
                />
              </div>

              <div>
                <Label htmlFor="cat-description" className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
                  {isCategoryModal ? 'Category description' : 'Customer service scope'}
                </Label>
                <Textarea
                  id="cat-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={isCategoryModal ? 2 : 5}
                  minLength={isCategoryModal ? undefined : CUSTOMER_SERVICE_SCOPE_MIN}
                  maxLength={2000}
                  required={!isCategoryModal}
                  aria-describedby={!isCategoryModal ? 'cat-description-help' : undefined}
                />
                {!isCategoryModal && (
                  <div id="cat-description-help" className="mt-1.5 flex flex-col gap-1 text-xs text-[var(--color-text-secondary)] sm:flex-row sm:items-start sm:justify-between">
                    <span>Shown before booking. State what is covered, important exclusions or limits, and the expected result. Do not promise unavailable materials or guarantees.</span>
                    <span className={description.trim().length < CUSTOMER_SERVICE_SCOPE_MIN ? 'font-semibold text-amber-700 whitespace-nowrap' : 'font-semibold text-emerald-700 whitespace-nowrap'}>
                      {description.trim().length}/2000
                    </span>
                  </div>
                )}
              </div>

              {isCategoryModal && (
                <div>
                  <Label htmlFor="cat-icon-url" className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Icon URL</Label>
                  <Input
                    id="cat-icon-url"
                    type="text"
                    value={iconUrl}
                    onChange={(e) => setIconUrl(e.target.value)}
                    maxLength={500}
                    placeholder="https://..."
                  />
                </div>
              )}

              {!isCategoryModal && (
                <>
                  <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4" aria-label="Customer service preview">
                    <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">Customer preview</p>
                    <p className="mt-2 font-semibold text-[var(--color-text)]">{name.trim() || 'Service name'}</p>
                    <p className={`mt-1 text-sm ${description.trim().length >= CUSTOMER_SERVICE_SCOPE_MIN ? 'text-[var(--color-text-secondary)]' : 'text-amber-700'}`}>
                      {description.trim() || 'Add customer-facing scope before this service can be saved.'}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge label={pricingType.replace('_', ' ')} variant="outline" />
                      <span className="text-sm font-semibold text-[var(--color-primary)]">
                        {pricingType === 'quote'
                          ? 'Quote on request'
                          : pricingType === 'per_unit'
                            ? `${unitPrice ? `${CURRENCY_SYMBOL}${unitPrice}` : 'Set rate'} / ${unitLabel || 'unit'}`
                            : pricingType === 'hourly'
                              ? `${hourlyRate ? `${CURRENCY_SYMBOL}${hourlyRate}` : 'Set rate'} / hour`
                              : basePrice ? `${CURRENCY_SYMBOL}${basePrice}` : 'Set price'}
                      </span>
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="cat-pricing-type" className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Pricing type</Label>
                      <select
                        id="cat-pricing-type"
                        value={pricingType}
                        onChange={(e) => setPricingType(e.target.value)}
                        className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
                      >
                        <option value="fixed">Fixed</option>
                        {/* 'range' removed: the DB pricing_type CHECK (migration 003)
                            only allows fixed/quote/hourly, so saving a 'range'
                            subcategory threw a raw constraint violation. Range
                            (price band + custom quote) is a future pricing model
                            tracked in the variable-pricing design (D27). */}
                        <option value="quote">Quote</option>
                        <option value="hourly">Hourly</option>
                        {/* D27 Phase 4 — per-unit rate (e.g. ₱/sqm). Advertises a
                            rate + estimate; the real price is provider-quoted. */}
                        <option value="per_unit">Per unit</option>
                      </select>
                    </div>
                    {pricingType === 'fixed' && <div>
                      <Label htmlFor="cat-base-price" className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Base price ({CURRENCY_SYMBOL})</Label>
                      <Input
                        id="cat-base-price"
                        type="number"
                        step="0.01"
                        min="0"
                        value={basePrice}
                        onChange={(e) => setBasePrice(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>}
                  </div>

                  {pricingType === 'fixed' && <div className="rounded-lg border border-[var(--color-border)] bg-slate-50/60 p-3">
                  <p className="mb-3 text-xs text-[var(--color-text-secondary)]">
                    Optional legacy provider-price bounds. Customers are charged the base catalog price; provider personal pricing remains inactive.
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="cat-min-price" className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Min price ({CURRENCY_SYMBOL})</Label>
                      <Input
                        id="cat-min-price"
                        type="number"
                        step="0.01"
                        min="0"
                        value={minPrice}
                        onChange={(e) => setMinPrice(e.target.value)}
                        placeholder="Optional"
                      />
                    </div>
                    <div>
                      <Label htmlFor="cat-max-price" className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Max price ({CURRENCY_SYMBOL})</Label>
                      <Input
                        id="cat-max-price"
                        type="number"
                        step="0.01"
                        min="0"
                        value={maxPrice}
                        onChange={(e) => setMaxPrice(e.target.value)}
                        placeholder="Optional"
                      />
                    </div>
                  </div>
                  </div>}

                  <div>
                    <Label htmlFor="cat-duration" className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Estimated duration (minutes)</Label>
                    <Input
                      id="cat-duration"
                      type="number"
                      step="1"
                      min="0"
                      value={estimatedDuration}
                      onChange={(e) => setEstimatedDuration(e.target.value)}
                      placeholder="Optional"
                    />
                  </div>

                  {pricingType === 'per_unit' && (
                    <div className="grid gap-4 rounded-lg bg-amber-50/50 p-3 border border-amber-100 sm:grid-cols-2">
                      <div>
                        <Label htmlFor="cat-unit-label" className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Unit label</Label>
                        <Input
                          id="cat-unit-label"
                          type="text"
                          value={unitLabel}
                          onChange={(e) => setUnitLabel(e.target.value)}
                          maxLength={30}
                          placeholder="sqm, room, panel"
                        />
                      </div>
                      <div>
                        <Label htmlFor="cat-unit-price" className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Price per unit ({CURRENCY_SYMBOL})</Label>
                        <Input
                          id="cat-unit-price"
                          type="number"
                          step="0.01"
                          min="0"
                          value={unitPrice}
                          onChange={(e) => setUnitPrice(e.target.value)}
                          placeholder="0.00"
                        />
                      </div>
                      <p className="text-xs text-[var(--color-text-secondary)] sm:col-span-2">
                        Shown to customers as a rate (e.g. ₱50 / sqm) with an estimate. The final price is
                        confirmed by the provider's quote, not auto-charged.
                      </p>
                    </div>
                  )}

                  {pricingType === 'hourly' && (
                    <div className="rounded-lg bg-sky-50/50 p-3 border border-sky-100">
                      <Label htmlFor="cat-hourly-rate" className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Hourly rate ({CURRENCY_SYMBOL} / hour)</Label>
                      <Input
                        id="cat-hourly-rate"
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={hourlyRate}
                        onChange={(e) => setHourlyRate(e.target.value)}
                        placeholder="0.00"
                      />
                      <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                        The customer authorizes estimated hours × this rate up front; they're billed only for
                        actual time worked (capped at the estimate) and the rest is refunded. Minimum 1 hour,
                        rounded to 30-minute increments.
                      </p>
                    </div>
                  )}
                </>
              )}

              <div>
                <Label htmlFor="cat-display-order" className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Display order</Label>
                <Input
                  id="cat-display-order"
                  type="number"
                  step="1"
                  value={displayOrder}
                  onChange={(e) => setDisplayOrder(e.target.value)}
                />
              </div>
              </>
              )}

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="min-h-11 px-4 py-2 text-sm border border-[var(--color-border)] rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending || (isAddonModal ? !addonName.trim() : !name.trim())}
                  className="min-h-11 px-4 py-2 text-sm bg-[var(--color-primary)] text-white rounded-lg hover:opacity-90 disabled:bg-slate-200 disabled:text-slate-600 disabled:cursor-not-allowed transition-opacity"
                >
                  {isPending ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {reasonDialog}
    </div>
  );
}
