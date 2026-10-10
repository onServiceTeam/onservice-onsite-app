import api from '@/services/api';
import { getApplicationStatus } from '@/services/provider-api.service';

it('Bug UX-1328 — application status rejects malformed or unknown decisions instead of treating them as pending', async () => {
  for (const body of [
    { success: true, data: { status: 'unrecognized-review-stage', rejectionReason: null } },
    { success: false, data: { status: 'approved', rejectionReason: null } },
    { success: true },
    { success: true, data: { status: 'pending', rejectionReason: { private: 'invalid shape' } } },
  ]) {
    jest.mocked(api.get).mockResolvedValueOnce({ status: 200, ok: true, data: body });
    await expect(getApplicationStatus()).rejects.toThrow('application status');
  }
  for (const status of ['pending', 'approved', 'rejected', 'suspended', 'deactivated']) {
    jest.mocked(api.get).mockResolvedValueOnce({ status: 200, ok: true, data: { success: true, data: { status, rejectionReason: null } } });
    await expect(getApplicationStatus()).resolves.toEqual({ status, rejectionReason: null });
  }
  jest.mocked(api.get).mockResolvedValueOnce({ status: 200, ok: true, data: { success: true, data: null } });
  await expect(getApplicationStatus()).resolves.toBeNull();
});
