import api from './api';
import type { ApiResponse } from './api';

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  iconUrl: string | null;
  displayOrder: number;
}

export interface Subcategory {
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
  categoryName?: string;
  categorySlug?: string;
}

interface CategoryWithSubcategories extends Category {
  subcategories: Subcategory[];
}

export async function getCategories(): Promise<Category[]> {
  const res = await api.get<ApiResponse<Category[]>>('/api/v1/catalog');
  return res.data.data;
}

export interface SubcategoryListResult {
  categoryName: string;
  subcategories: Subcategory[];
}

export async function getSubcategories(categorySlug: string): Promise<SubcategoryListResult> {
  const res = await api.get<ApiResponse<CategoryWithSubcategories & { name: string }>>(`/api/v1/catalog/${categorySlug}`);
  return { categoryName: res.data.data.name, subcategories: res.data.data.subcategories };
}

export interface Promotion {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  badge: string | null;
  ctaText: string | null;
  ctaLink: string | null;
  targetAudience: string;
  startDate: string;
  endDate: string | null;
}

export async function getActivePromotions(): Promise<Promotion[]> {
  const res = await api.get<ApiResponse<Promotion[]>>('/api/v1/promotions/active');
  return res.data.data;
}
