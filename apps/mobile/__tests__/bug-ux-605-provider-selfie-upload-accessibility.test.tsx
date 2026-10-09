import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { uploadImages } from '@/services/upload.service';
import { captureImageAsync } from '@/utils/image-capture';

import { useOnboardingStore } from '@/stores/onboarding.store';
import { readyApplication } from '../test-support/application-draft-fixture';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({ useResponsive: () => ({ isPhone: false }) }));
jest.mock('@/utils/image-capture', () => ({
  isCameraCaptureAvailable: () => false,
  captureImageAsync: jest.fn().mockResolvedValue({
    status: 'done', result: { canceled: false, assets: [{ uri: 'blob:selfie-audit' }] },
  }),
}));
jest.mock('@/services/upload.service', () => ({
  uploadImages: jest.fn().mockResolvedValue([{ url: 'https://private.invalid/onboarding/selfie.png' }]),
}));

import SelfieScreen from '../app/provider-onboarding/selfie';

it('Bug UX-605 — browser selfie upload is a named button and stores the uploaded private reference', async () => {
  readyApplication();
  render(<SelfieScreen />);

  const uploadButton = screen.getByRole('button', { name: 'Upload Selfie' });
  fireEvent.click(uploadButton);

  await waitFor(() => expect(captureImageAsync).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(uploadImages).toHaveBeenCalledWith(['blob:selfie-audit'], 'onboarding', expect.any(Function)));
  await waitFor(() => expect(useOnboardingStore.getState().selfieUri).toBe('https://private.invalid/onboarding/selfie.png'));
});
