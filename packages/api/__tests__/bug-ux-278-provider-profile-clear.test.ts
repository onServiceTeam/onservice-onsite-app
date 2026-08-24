const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/upload.service', () => ({}));

import { updateProfileSchema } from '../src/validators/provider.validators';
import { updateProfile } from '../src/services/provider.service';

it('Bug UX-278 — provider profile accepts explicit bio and experience clearing and persists both values', async () => {
  const parsed = updateProfileSchema.safeParse({ bio: '', yearsExperience: null });
  expect(parsed.success).toBe(true);

  dbQueryMock.mockResolvedValueOnce({
    rows: [{ id: 'provider-1', bio: '', years_experience: null }],
    rowCount: 1,
  });

  await updateProfile('provider-1', { bio: '', yearsExperience: null });

  expect(dbQueryMock).toHaveBeenCalledWith(
    expect.stringMatching(/bio = \$1[\s\S]*years_experience = \$2/),
    ['', null, 'provider-1'],
  );
});
