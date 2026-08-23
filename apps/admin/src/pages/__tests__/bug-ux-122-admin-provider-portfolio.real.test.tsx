import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProfileTab, type ProviderProfile } from '../ProviderDetailPage';

describe('Provider 360 customer-facing portfolio', () => {
  it('BUG-UX-122 — support staff can see the published photo and its consent evidence', () => {
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
        id: 'user-1',
        fullName: 'Test Provider',
        phone: '•••• 4567',
        email: null,
        contactMasked: true,
        avatarUrl: null,
        isVerified: true,
        isActive: true,
        lastLoginAt: null,
      },
      documents: {
        nbiClearanceUrl: null,
        nbiExpiryDate: null,
        nbiExpiryNotified: false,
        avatarUrl: null,
        governmentIdUrl: null,
        governmentIdBackUrl: null,
        selfieUrl: null,
      },
      categories: [],
      serviceAreas: [],
      certifications: [],
      portfolio: [{
        id: 'portfolio-1',
        imageUrl: 'https://cdn.example/portfolio/user-1/work.jpg',
        caption: 'Aircon deep clean',
        customerConsentConfirmedAt: '2026-08-24T08:00:00.000Z',
        createdAt: '2026-08-24T08:00:00.000Z',
      }],
    } satisfies ProviderProfile;

    render(<ProfileTab profile={profile} />);

    const image = screen.getByAltText('Aircon deep clean');
    expect(image).toHaveAttribute('src', 'https://cdn.example/portfolio/user-1/work.jpg');
    expect(screen.getByText(/Consent confirmed/)).toBeInTheDocument();
    expect(screen.getByText('1 published')).toBeInTheDocument();
  });
});
