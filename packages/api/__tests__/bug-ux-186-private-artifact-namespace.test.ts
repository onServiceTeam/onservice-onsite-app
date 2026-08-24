jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
jest.mock('../src/services/settings.service', () => ({ getSetting: jest.fn() }));

import { deletePrivateArtifact, getPrivateArtifactStream } from '../src/services/upload.service';

it('BUG-UX-186 — private artifact streaming and cleanup reject keys outside the private namespace', async () => {
  await expect(getPrivateArtifactStream('booking-photos/customer-1/photo.jpg')).rejects.toMatchObject({ statusCode: 404 });
  await expect(deletePrivateArtifact('onboarding/provider-1/id.jpg')).rejects.toThrow('Invalid private artifact path.');
});
