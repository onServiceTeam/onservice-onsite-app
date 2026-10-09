import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';
import Review from '../app/provider-onboarding/review-pending';
import { applicant } from '../test-support/application-draft-fixture';

const mockApplicant = applicant;
jest.mock('@/stores/auth.store', () => ({ useAuthStore: Object.assign(() => ({ user: mockApplicant, isAuthenticated: true }), {
  getState: () => ({ user: mockApplicant, isAuthenticated: true }),
}) }));

it('Bug UX-1334 — review guidance stops describing a pending review after approval, rejection or an account restriction', async () => {
  for (const [status, title] of [
    ['pending', 'Application submitted'], ['approved', 'Application approved'], ['rejected', 'Application not approved'],
    ['suspended', 'Provider access suspended'], ['deactivated', 'Provider account deactivated'],
  ]) {
    jest.mocked(api.get).mockResolvedValue({ status: 200, ok: true, data: { success: true, data: { status, rejectionReason: null } } });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const view = render(<QueryClientProvider client={client}><Review /></QueryClientProvider>);
    expect(await screen.findByText(title!)).toBeTruthy();
    if (status === 'pending') expect(screen.getByText(/A completion date is not available yet/)).toBeTruthy();
    else {
      expect(screen.queryByText(/A completion date is not available yet/)).toBeNull();
      expect(screen.queryByText(/While you wait/)).toBeNull();
    }
    view.unmount();
    client.clear();
  }
});
