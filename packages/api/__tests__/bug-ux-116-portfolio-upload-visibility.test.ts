import { getUploadVisibility } from '../src/services/upload.service';

it('BUG-UX-116 — portfolio uploads are public while onboarding identity uploads remain private', () => {
  expect(getUploadVisibility('portfolio')).toBe('public');
  expect(getUploadVisibility('onboarding')).toBe('private');
});
