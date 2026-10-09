jest.mock('../src/models/db', () => ({
  db: { query: jest.fn(), transaction: jest.fn() },
}));
jest.mock('../src/config/redis.config', () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), keys: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { getSettingRuntimeControl } from '../src/services/settings.service';

it('Bug UX-1003 — upload controls disclose per-user quota scope and the deployed image-format boundary', () => {
  expect(getSettingRuntimeControl('upload_rate_limit_window_ms')).toMatchObject({
    status: 'live', editable: true,
    summary: expect.stringMatching(/Within 60 seconds.*booking-photo.*signature.*general-upload.*project-image.*one user/i),
  });
  expect(getSettingRuntimeControl('upload_rate_limit_max_requests')).toMatchObject({
    status: 'live', editable: true,
    summary: expect.stringMatching(/combined upload-request cap.*authenticated user.*Existing files are unchanged.*multiple images/i),
  });
  expect(getSettingRuntimeControl('allowed_image_mime_types')).toMatchObject({
    status: 'live', editable: true,
    summary: expect.stringMatching(/booking photos.*signatures.*project images.*tester-feedback screenshots.*JPEG, PNG, and WebP.*coordinated release/i),
  });
});
