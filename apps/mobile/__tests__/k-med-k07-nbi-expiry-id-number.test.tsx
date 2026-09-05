// Phase K MED-K07 - provider onboarding document metadata.
//
// These tests exercise the actual onboarding store, document inputs, and
// final application request. They intentionally do not inspect source text:
// the important contract is that a provider's entered values survive the
// onboarding steps and reach the canonical provider-application endpoint.

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPost = jest.fn();
const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: mockPush, replace: mockReplace }),
}));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('@/services/upload.service', () => ({ uploadImages: jest.fn() }));
jest.mock('@/services/api', () => ({
  __esModule: true,
  ApiError: class extends Error {},
  default: { post: (...args: unknown[]) => mockPost(...args), put: jest.fn() },
  storage: { delete: jest.fn() },
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1180, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));

import DocumentsScreen from '../app/provider-onboarding/documents';
import TermsScreen from '../app/provider-onboarding/terms';
import { useOnboardingStore } from '../src/stores/onboarding.store';
import { applicantId, completeApplicationFields, readyApplication, mockDraftSaves, revisionTwo } from '../test-support/application-draft-fixture';

function renderTerms(): void {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={client}>
      <TermsScreen />
    </QueryClientProvider>,
  );
}

function seedRequiredApplication(): void {
  readyApplication(completeApplicationFields());
  mockDraftSaves();
}

beforeEach(() => {
  jest.clearAllMocks();
  useOnboardingStore.getState().reset();
  mockPost.mockResolvedValue({ status: 201, data: { success: true, data: { id: revisionTwo } } });
});

describe('Phase K MED-K07 - document metadata survives the provider onboarding flow', () => {
  it('K07 - document inputs update the real onboarding store, including clearing optional values', () => {
    render(<DocumentsScreen />);

    const expiry = screen.getByLabelText('NBI expiry date, optional');
    const governmentId = screen.getByLabelText('Government ID number, optional');

    fireEvent.change(expiry, { target: { value: '2027-01-15' } });
    fireEvent.change(governmentId, { target: { value: 'PH-ID-1234' } });

    expect(useOnboardingStore.getState()).toMatchObject({
      nbiExpiryDate: '2027-01-15',
      governmentIdNumber: 'PH-ID-1234',
    });

    fireEvent.change(expiry, { target: { value: '' } });
    fireEvent.change(governmentId, { target: { value: '' } });

    expect(useOnboardingStore.getState()).toMatchObject({
      nbiExpiryDate: null,
      governmentIdNumber: null,
    });
  });

  it('K07 - populated optional metadata is sent to the canonical provider application endpoint', async () => {
    seedRequiredApplication();
    useOnboardingStore.getState().setNbiExpiryDate('2027-01-15');
    useOnboardingStore.getState().setGovernmentIdNumber('PH-ID-1234');
    renderTerms();

    fireEvent.click(screen.getByText(/I have read, understood, and agree/i).closest('button')!);
    fireEvent.click(screen.getByRole('button', { name: 'Submit Application' }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith(
      '/api/v1/providers/apply',
      expect.objectContaining({
        nbiExpiryDate: '2027-01-15',
        governmentIdNumber: 'PH-ID-1234',
        governmentIdFrontUrl: `onboarding/${applicantId}/front.jpg`,
        nbiClearanceUrl: `onboarding/${applicantId}/nbi.jpg`,
      }),
    ));
    expect(mockReplace).toHaveBeenCalled();
  });

  it('K07 - blank optional metadata is omitted instead of sending empty values to the API', async () => {
    seedRequiredApplication();
    renderTerms();

    fireEvent.click(screen.getByText(/I have read, understood, and agree/i).closest('button')!);
    fireEvent.click(screen.getByRole('button', { name: 'Submit Application' }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith(
      '/api/v1/providers/apply',
      expect.any(Object),
    ));
    const payload = mockPost.mock.calls[0]![1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('nbiExpiryDate');
    expect(payload).not.toHaveProperty('governmentIdNumber');
  });
});
