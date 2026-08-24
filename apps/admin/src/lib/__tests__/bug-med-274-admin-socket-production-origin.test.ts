import { describe, expect, it } from 'vitest';
import { resolveAdminSocketUrl } from '../use-admin-socket';

describe('admin socket URL resolution', () => {
  it('Bug MED-274 — uses the browser origin when a production build has no configured API URL', () => {
    expect(resolveAdminSocketUrl(undefined, 'https://admin.onservice.ph')).toBe(
      'https://admin.onservice.ph',
    );
  });
});
