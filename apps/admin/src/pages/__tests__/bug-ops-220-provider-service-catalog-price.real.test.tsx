import React from 'react';
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { ProfileTab, type ProviderProfile } from '../ProviderDetailPage';

it('Bug OPS-220 — Provider 360 identifies catalog-backed customer service prices', () => {
  const profile = {
    id: 'provider-1',
    userId: 'user-1',
    businessName: 'Cebu Home Care',
    description: '',
    tier: 'new',
    status: 'approved',
    averageRating: 0,
    totalReviews: 0,
    totalJobsCompleted: 0,
    serviceRadiusKm: 10,
    yearsExperience: null,
    vettingAnswers: null,
    city: 'Cebu City',
    province: 'Cebu',
    latitude: null,
    longitude: null,
    createdAt: '2026-08-24T08:00:00.000Z',
    updatedAt: '2026-08-24T08:00:00.000Z',
    user: {
      id: 'user-1', fullName: 'Test Provider', phone: '•••• 4567', email: null,
      contactMasked: true, avatarUrl: null, isVerified: true, isActive: true, lastLoginAt: null,
    },
    documents: {
      nbiClearanceUrl: null, nbiExpiryDate: null, nbiExpiryNotified: false,
      avatarUrl: null, governmentIdUrl: null, governmentIdBackUrl: null, selfieUrl: null,
    },
    categories: [],
    services: [{
      id: 'service-1', name: 'Aircon deep clean', categoryName: 'Aircon Services',
      pricingType: 'fixed', basePrice: 95000, hourlyRate: null, unitLabel: null,
      unitPrice: null, minPrice: null, maxPrice: null,
    }],
    serviceAreas: [],
    certifications: [],
    portfolio: [],
  } satisfies ProviderProfile;

  render(<ProfileTab profile={profile} />);

  expect(screen.getByText('Aircon deep clean')).toBeInTheDocument();
  expect(screen.getByText('Aircon Services')).toBeInTheDocument();
  expect(screen.getByText('₱950.00')).toBeInTheDocument();
  expect(screen.getByText(/prices below come from the admin catalog/i)).toBeInTheDocument();
});
