import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it } from 'vitest';
import { ProfileTab, type ProviderProfile } from '../ProviderDetailPage';

it('Bug UX-1338 — reviewers see declared categories separately from priced services and unavailable legacy data', () => {
  const profile = {
    id: 'provider-1', userId: 'applicant-1', businessName: 'Synthetic Cleaning',
    description: '', tier: 'new', status: 'pending', averageRating: 0,
    totalReviews: 0, totalJobsCompleted: 0, serviceRadiusKm: 15,
    yearsExperience: 5, vettingAnswers: { mainSkills: 'Post-build cleaning' },
    city: 'Cebu City', province: 'Cebu', latitude: 10.32, longitude: 123.89,
    createdAt: '2026-09-06T00:00:00.000Z', updatedAt: '2026-09-06T00:00:00.000Z',
    user: { id: 'applicant-1', fullName: 'Synthetic Applicant', phone: '', email: null,
      contactMasked: true, avatarUrl: null, isVerified: false, isActive: true, lastLoginAt: null },
    documents: { nbiClearanceUrl: null, nbiExpiryDate: null, nbiExpiryNotified: false,
      avatarUrl: null, governmentIdUrl: null, governmentIdBackUrl: null, selfieUrl: null },
    // The deprecated categories projection describes priced services, not application selections.
    categories: [{ id: 'legacy', name: 'Not an application selection', basePrice: 90000 }],
    declaredCategories: [{ id: 'cleaning', name: 'Cleaning', isActive: true },
      { id: 'painting', name: 'Painting', isActive: false }],
    services: [], serviceAreas: [], certifications: [], portfolio: [],
  };
  const show = (value: ProviderProfile) => <MemoryRouter><ProfileTab profile={value} /></MemoryRouter>;
  const view = render(show(profile));
  const section = screen.getByRole('region', { name: 'Declared service categories' });
  expect(within(section).getByText('Cleaning')).toBeVisible();
  expect(within(section).getByText('Painting')).toBeVisible();
  expect(within(section).getByText('Currently inactive in catalog')).toBeVisible();
  expect(within(section).getByText(/not approval or configured bookable services/i)).toBeVisible();
  expect(within(section).queryByText(/₱|Not an application selection/)).not.toBeInTheDocument();
  expect(screen.getByText('No active services on file.')).toBeVisible();
  expect(screen.getByText('Post-build cleaning')).toBeVisible();

  view.rerender(show({ ...profile, declaredCategories: [] }));
  expect(screen.getByText('No category-only selections on file.')).toBeVisible();
  expect(screen.queryByText('Cleaning')).not.toBeInTheDocument();
  view.rerender(show({ ...profile, declaredCategories: undefined }));
  expect(screen.getByText('Category selections are unavailable from this server.')).toBeVisible();
  expect(screen.queryByText('No category-only selections on file.')).not.toBeInTheDocument();
  expect(screen.queryByText('Not an application selection')).not.toBeInTheDocument();
});
