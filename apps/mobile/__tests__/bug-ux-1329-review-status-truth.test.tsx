import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api, { refreshAuthSession } from '@/services/api';
import Review from '../app/provider-onboarding/review-pending';
import Background from '../app/provider-onboarding/background-check-status';
import { applicant } from '../test-support/application-draft-fixture';

const mockApplicant = applicant;
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn() }), Redirect: () => null }));
jest.mock('@/stores/auth.store', () => ({ useAuthStore: Object.assign(() => ({ user: mockApplicant, isAuthenticated: true }), {
  getState: () => ({ user: mockApplicant, isAuthenticated: true }),
}) }));
const response = (status: string) => ({ status: 200, ok: true, data: { success: true, data: { status, rejectionReason: 'Recorded application rejection, not a suspension reason.' } } });

it('Bug UX-1329 — both review URLs distinguish recorded restrictions from rejection and never infer a review stage or decision from an error', async () => {
  for (const Screen of [Review, Background]) {
    for (const [status, title] of [
      ['pending', 'Application submitted'], ['rejected', 'Application not approved'],
      ['suspended', 'Provider access suspended'], ['deactivated', 'Provider account deactivated'],
      ['future-stage', 'Status unavailable'],
    ]) {
      jest.mocked(api.get).mockResolvedValueOnce(response(status!));
      const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
      const view = render(<QueryClientProvider client={client}><Screen /></QueryClientProvider>);
      expect(await screen.findByText(title!)).toBeTruthy();
      expect(screen.queryByText('In review')).toBeNull();
      expect(screen.queryByText('Your provider application is under review.')).toBeNull();
      expect(screen.queryByText('24-48 hours')).toBeNull();
      if (status !== 'rejected') expect(screen.queryByText('Recorded application rejection, not a suspension reason.')).toBeNull();
      expect(refreshAuthSession).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Contact support' }));
      expect(mockPush).toHaveBeenLastCalledWith('/support');
      if (status === 'pending') {
        jest.mocked(api.get).mockRejectedValueOnce(new Error('Unavailable'));
        fireEvent.click(screen.getByRole('button', { name: 'Refresh application status' }));
        await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('last confirmed status'));
        expect(screen.getByText('Application submitted')).toBeTruthy();
      }
      view.unmount();
      client.clear();
    }
  }
});
