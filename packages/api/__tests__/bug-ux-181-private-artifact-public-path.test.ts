jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
jest.mock('../src/services/settings.service', () => ({ getSetting: jest.fn() }));

import { savePrivateArtifact } from '../src/services/upload.service';

it('BUG-UX-181 — private artifacts cannot be stored under nginx’s public upload subtree', async () => {
  await expect(savePrivateArtifact(
    Buffer.from('{"private":true}'),
    'data-exports/customer-1/export-1.json',
    'application/json',
  )).rejects.toThrow('Invalid private artifact path.');
});
