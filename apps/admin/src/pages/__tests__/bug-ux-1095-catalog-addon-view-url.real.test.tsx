import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const CATEGORY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SERVICE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ADDON_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('@/lib/api', () => ({ default: { get: apiMocks.get }, getErrorMessage: () => 'Request failed' }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { role: string } }) => unknown) => selector({ user: { role: 'super_admin' } }),
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import CatalogPage from '../CatalogPage';

function LocationProbe(): React.ReactElement {
  const location = useLocation();
  return <output aria-label="Current catalog URL">{`${location.pathname}${location.search}`}</output>;
}

function renderCatalog(initialEntry: string): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <CatalogPage />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it('Bug UX-1095 - opening a service add-on panel writes durable URL state that restores after remount', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/catalog/admin/full') return { data: { data: [{
      id: CATEGORY_ID, name: 'Cleaning', slug: 'cleaning', description: '', iconUrl: null,
      displayOrder: 1, subcategories: [{
        id: SERVICE_ID, categoryId: CATEGORY_ID, name: 'Deep Cleaning', slug: 'deep-cleaning',
        description: 'A complete customer-facing deep-cleaning service scope.', pricingType: 'fixed',
        basePrice: 250000, minPrice: null, maxPrice: null, estimatedDurationMinutes: 180,
        unitLabel: null, unitPrice: null, hourlyRate: null, displayOrder: 1, isActive: true,
      }],
    }] } };
    if (url === `/api/v1/catalog/admin/subcategories/${SERVICE_ID}/addons`) return {
      data: { data: [{
        id: ADDON_ID, subcategoryId: SERVICE_ID, name: 'Inside refrigerator', description: '',
        price: 45000, isActive: true, displayOrder: 1, exceedsCurrentPriceCap: false,
      }], meta: { priceCapCentavos: 5000000 } },
    };
    throw new Error(`Unexpected GET ${url}`);
  });

  const firstRender = renderCatalog('/catalog');
  fireEvent.click(await screen.findByRole('button', { name: 'Expand Cleaning services' }));
  fireEvent.click(screen.getByRole('button', { name: 'Show add-ons for Deep Cleaning' }));
  const durableUrl = `/catalog?categoryId=${CATEGORY_ID}&subcategoryId=${SERVICE_ID}&view=addons`;
  expect(screen.getByLabelText('Current catalog URL')).toHaveTextContent(durableUrl);
  expect(await screen.findByText('Inside refrigerator')).toBeVisible();
  firstRender.unmount();

  renderCatalog(durableUrl);
  expect(await screen.findByRole('button', { name: 'Hide add-ons for Deep Cleaning' })).toBeVisible();
  expect(await screen.findByText('Inside refrigerator')).toBeVisible();
});
