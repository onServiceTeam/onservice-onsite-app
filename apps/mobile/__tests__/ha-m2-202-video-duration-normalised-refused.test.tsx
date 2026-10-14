// HA-M2-202 (D38 Milestone 2, package P5a): a picked video's length is read
// in the right unit (the phone apps report milliseconds, the website reports
// seconds) and a video over 30 seconds is refused with plain guidance before
// anything is uploaded. Library picks ignore the camera's length limit, and
// the website ignores it entirely, so the app has to check.
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

const TOO_LONG = 'This video is 31 seconds. Videos can be up to 30 seconds. Trim it in your gallery, then add it again.';
const platform = Platform as { OS: string };
const originalOS = platform.OS;

function pickVideo(asset: Record<string, unknown>): void {
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({ canceled: false, assets: [asset] } as never);
}

beforeEach(() => {
  jest.mocked(api.post).mockReset();
  jest.mocked(api.post).mockImplementation((async () => ({ data: { success: true, data: {
    id: 'media-video', status: 'stored', kind: 'video', purpose: 'job_request', chunkBytes: 2097152,
    totalChunks: 1, bytesReceived: 1000, nextIndex: 1, rejectionCode: null, limits: { bytes: 83886080, durationMs: 30000 },
  } } })) as never);
});

afterEach(() => { platform.OS = originalOS; });

it('HA-M2-202: video length is normalised (phone ms, web seconds) and a 31 s pick is refused before upload', async () => {
  // Phone app: 31000 means 31 seconds.
  const phone = render(<Harness />);
  pickVideo({ uri: 'file:///tmp/cache/long.mp4', width: 1280, height: 720, type: 'video', mimeType: 'video/mp4', fileSize: 4_000_000, duration: 31000 });
  fireEvent.click(screen.getByRole('button', { name: 'Add a job video' }));
  expect(await screen.findByText(TOO_LONG)).toBeTruthy();
  expect(api.post).not.toHaveBeenCalled();
  phone.unmount();

  // Website: 31 means 31 seconds, and 12 means 12 seconds (12000 ms on the wire).
  platform.OS = 'web';
  render(<Harness />);
  const file = new Blob([new Uint8Array(1000)], { type: 'video/mp4' });
  pickVideo({ uri: 'blob:https://app.onservice.ph/31', width: 1280, height: 720, type: 'video', mimeType: 'video/mp4', fileSize: 1000, duration: 31, file });
  fireEvent.click(screen.getByRole('button', { name: 'Add a job video' }));
  expect(await screen.findByText(TOO_LONG)).toBeTruthy();
  expect(api.post).not.toHaveBeenCalled();

  pickVideo({ uri: 'blob:https://app.onservice.ph/12', width: 1280, height: 720, type: 'video', mimeType: 'video/mp4', fileSize: 1000, duration: 12, file });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add a job video' })); });
  await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
  expect(jest.mocked(api.post).mock.calls[0]![1]).toMatchObject({ purpose: 'job_request', kind: 'video', mime: 'video/mp4', totalBytes: 1000, durationMs: 12000 });
  expect(screen.queryByText(TOO_LONG)).toBeNull();
});
