// Web-compat audit (2026-06-10) — provider onboarding selfie on the web app.
//
// Pre-fix the selfie step called launchCameraAsync directly; on web that
// resolves canceled without UI, so the capture button did nothing, the Next
// button stayed disabled, and provider onboarding was IMPOSSIBLE in a
// browser. The screen now captures through the web-aware helper (library
// picker on web) and labels the button "Upload Selfie" there. Real render
// test at Platform.OS='web'.

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { Platform } from 'react-native';

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock('@/services/upload.service', () => ({
  uploadImages: jest.fn(),
}));

import { useOnboardingStore } from '@/stores/onboarding.store';
import { readyApplication } from '../../test-support/application-draft-fixture';
beforeEach(() => readyApplication());

import SelfieScreen from '../../app/provider-onboarding/selfie';
import * as ImagePicker from 'expo-image-picker';
import { uploadImages } from '@/services/upload.service';

const mockPicker = ImagePicker as jest.Mocked<typeof ImagePicker>;

afterEach(() => {
  Platform.OS = 'ios';
  jest.clearAllMocks();
});

describe('provider onboarding selfie — web capture path', () => {
  it('labels the capture button "Upload Selfie" and routes through the file picker on web', async () => {
    Platform.OS = 'web';
    mockPicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'blob:https://app.onservice.ph/selfie-1' }],
    } as never);
    (uploadImages as jest.Mock).mockResolvedValue([{ url: 'https://cdn/selfie.png' }]);

    const { container } = render(<SelfieScreen />);
    expect(container.textContent).toContain('Upload Selfie');
    expect(container.textContent).not.toContain('Take Selfie');

    const btn = Array.from(container.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes('Upload Selfie'),
    );
    expect(btn).toBeTruthy();
    fireEvent.click(btn!);

    await waitFor(() => {
      expect(uploadImages).toHaveBeenCalledWith(['blob:https://app.onservice.ph/selfie-1'], 'onboarding', expect.any(Function));
    });
    expect(mockPicker.launchCameraAsync).not.toHaveBeenCalled();
    expect(mockPicker.requestCameraPermissionsAsync).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(useOnboardingStore.getState().selfieUri).toBe('https://cdn/selfie.png');
    });
  });

  it('keeps the native camera flow ("Take Selfie") off web', () => {
    Platform.OS = 'ios';
    const { container } = render(<SelfieScreen />);
    expect(container.textContent).toContain('Take Selfie');
  });
});
