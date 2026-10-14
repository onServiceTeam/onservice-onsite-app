// HA-M2-509 (D38 Milestone 2, package P5a review fix): on the website, a
// video whose length the browser cannot read is refused with honest copy
// that says what works (add videos in the onService app; photos and a
// description work here). The web picker measures a video by loading it
// from a blob: address, which the live site's security policy still blocks
// until a separate server step, so every web video reads as length 0.
// Before, the copy blamed the customer's video ("Choose another video"),
// and every other video failed the same way. Nothing is uploaded.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import api from '@/services/api';
import { useJobMediaUploads } from '@/hooks/useJobMediaUploads';
import { REQUEST_CONFIG_DEFAULTS } from '@/hooks/useRequestConfig';
import { JobMediaPicker } from '@/components/job-media/JobMediaPicker';

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestCameraPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
}));

function Harness(): React.ReactElement {
  const uploads = useJobMediaUploads({ purpose: 'job_request', backoffMs: [0] });
  return <JobMediaPicker uploads={uploads} limits={REQUEST_CONFIG_DEFAULTS.jobMedia} />;
}

const platform = Platform as { OS: string };
const originalOS = platform.OS;

beforeEach(() => jest.mocked(api.post).mockReset());
afterEach(() => { platform.OS = originalOS; });

it('HA-M2-509: on the website a video with an unreadable length says to add videos in the app, and uploads nothing', async () => {
  platform.OS = 'web';
  render(<Harness />);
  const file = new Blob([new Uint8Array(4000)], { type: 'video/mp4' });
  // expo-image-picker's web build resolves duration 0 when the blob: load fails.
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({
    canceled: false,
    assets: [{ uri: 'blob:https://app.onservice.ph/9d1e', width: 0, height: 0, type: 'video', mimeType: 'video/mp4', fileSize: 4000, duration: 0, file }],
  } as never);

  fireEvent.click(screen.getByRole('button', { name: 'Add a job video' }));

  expect(await screen.findByText(
    'This website could not read the video. Add videos in the onService app for now. Here, you can add photos or describe the job.',
  )).toBeTruthy();
  expect(screen.queryByText('We could not read how long this video is. Choose another video.')).toBeNull();
  expect(api.post).not.toHaveBeenCalled();
});
