// Real behavioral test for the "Add Photo" source picker on web.
//
// Bug (reported by a web tester, 2026-06-16): the Add Photo action sheet showed
// a "Camera" option, but tapping Camera opened the photo library. Root cause: on
// web, expo-image-picker's launchCameraAsync builds an <input capture="camera">,
// which desktop browsers ignore and render as the ordinary file/library chooser.
// Fix: on web, showPickerOptions skips the action sheet and opens the library
// directly (mirroring the audited image-capture helper). Native is unchanged.
//
// We render a tiny harness that uses the hook and exposes showPickerOptions on a
// button, then assert which expo-image-picker launcher actually fires.

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { Platform, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useImagePicker } from '../../src/hooks/useImagePicker';

jest.mock('expo-image-picker', () => ({
  launchCameraAsync: jest.fn().mockResolvedValue({ canceled: true, assets: [] }),
  launchImageLibraryAsync: jest.fn().mockResolvedValue({ canceled: true, assets: [] }),
  requestCameraPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
}));

// uploadImages pulls the api client; the picker path under test never calls it.
jest.mock('../../src/services/upload.service', () => ({ uploadImages: jest.fn() }));

function Harness(): React.ReactElement {
  const api = useImagePicker({ context: 'job-request' });
  return React.createElement('button', { onClick: () => api.showPickerOptions() }, 'add');
}

describe('useImagePicker — Add Photo source picker', () => {
  const originalOS = Platform.OS;
  afterEach(() => {
    Platform.OS = originalOS;
    jest.clearAllMocks();
  });

  it('Bug 2026-06-16 — on web, Add Photo opens the library directly (no "Camera" option that secretly opened the library)', async () => {
    Platform.OS = 'web';
    const { getByText } = render(React.createElement(Harness));
    fireEvent.click(getByText('add'));

    await waitFor(() => {
      expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1);
    });
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('on native, Add Photo still presents the Camera / Photo Library action sheet', () => {
    Platform.OS = 'ios';
    const { getByText } = render(React.createElement(Harness));
    fireEvent.click(getByText('add'));

    expect(Alert.alert).toHaveBeenCalledWith('Add Photo', 'Choose a source', expect.any(Array));
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
  });
});
