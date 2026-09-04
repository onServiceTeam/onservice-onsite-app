// Phase L MED-L02/L03/L05 - runtime contract verification.
//
// L02/L03 are exercised through the real error helper and feature-flag hook.
// L05 imports the actual admin Playwright config and evaluates its fallback,
// so the test checks the value used by Playwright rather than its source text.

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGet = jest.fn();

jest.mock('@/services/api', () => ({
  __esModule: true,
  ApiError: class TestApiError extends Error {},
  default: { get: (...args: unknown[]) => mockGet(...args) },
}));
jest.mock('@playwright/test', () => ({
  defineConfig: (config: unknown) => config,
}));

import useFeatureFlags from '../src/hooks/useFeatureFlags';
import { getErrorMessage } from '../src/utils/errors';

function FeatureFlagProbe(): React.ReactElement {
  const flags = useFeatureFlags();
  return (
    <div>
      <span>promo:{String(flags.promoRedemptionEnabled)}</span>
      <span>ab:{String(flags.abTestingEnabled)}</span>
      <span>business:{String(flags.businessContractBookingEnabled)}</span>
    </div>
  );
}

function renderFlags(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <FeatureFlagProbe />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  delete process.env.STAGING_ADMIN_URL;
});

describe('Phase L MED-L02/L03 - shared helper and client config envelope', () => {
  it('L02 - getErrorMessage extracts a real Error message and uses fallback for unknown values', () => {
    expect(getErrorMessage(new Error('server said no'), 'Could not save.')).toBe('server said no');
    expect(getErrorMessage(null, 'Could not save.')).toBe('Could not save.');
  });

  it('L03 - the rendered feature-flag hook reads featureFlags from the inner API data object', async () => {
    mockGet.mockResolvedValueOnce({ data: {
      success: true,
      data: {
        featureFlags: {
          promoRedemptionEnabled: true,
          abTestingEnabled: true,
          businessContractBookingEnabled: true,
        },
        appVersion: '1.0.0',
      },
    } });
    renderFlags();

    await waitFor(() => expect(screen.getByText('promo:true')).toBeTruthy());
    expect(screen.getByText('ab:true')).toBeTruthy();
    expect(screen.getByText('business:true')).toBeTruthy();
    expect(mockGet).toHaveBeenCalledWith('/api/v1/config');
  });
});

describe('Phase L MED-L05 - Playwright uses the Vite admin port by default', () => {
  it('L05 - runtime config fallback is localhost:7382 and an explicit staging URL wins', () => {
    delete process.env.STAGING_ADMIN_URL;
    let config: { use?: { baseURL?: string } };
    jest.isolateModules(() => {
      config = require('../../admin/playwright.config').default as { use?: { baseURL?: string } };
    });
    expect(config!.use!.baseURL).toBe('http://localhost:7382');

    process.env.STAGING_ADMIN_URL = 'https://admin.staging.example';
    jest.isolateModules(() => {
      config = require('../../admin/playwright.config').default as { use?: { baseURL?: string } };
    });
    expect(config!.use!.baseURL).toBe('https://admin.staging.example');
  });
});
