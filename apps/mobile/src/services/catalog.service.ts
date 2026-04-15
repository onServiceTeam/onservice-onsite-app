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

export async function getSubcategories(categorySlug: string): Promise<Subcategory[]> {
  const res = await api.get<ApiResponse<CategoryWithSubcategories>>(`/api/v1/catalog/${categorySlug}`);
  return res.data.data.subcategories;
}
