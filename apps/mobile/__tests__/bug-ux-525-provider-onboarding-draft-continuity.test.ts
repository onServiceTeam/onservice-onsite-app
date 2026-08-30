import { Routes } from '@/config/navigation';
import { emptyVetting } from '@/stores/onboarding.store';
import { getProviderOnboardingDraftRedirect } from '@/components/ProviderOnboardingDraftGuard';

it('Bug UX-525 — a later onboarding URL redirects to the earliest incomplete application step', () => {
  const emptyDraft = {
    selectedRole: null,
    businessName: '',
    categoryIds: [] as string[],
    serviceAreaId: null,
    latitude: null,
    longitude: null,
    city: '',
    province: '',
    yearsExperience: null,
    vetting: { ...emptyVetting },
    governmentIdFrontUri: null,
    governmentIdBackUri: null,
    nbiClearanceUri: null,
    selfieUri: null,
  };

  expect(getProviderOnboardingDraftRedirect('terms', emptyDraft)).toBe(
    Routes.PROVIDER_ONBOARDING.ROLE_SELECT,
  );

  const categoriesComplete = {
    ...emptyDraft,
    selectedRole: 'provider' as const,
    businessName: 'Cebu Home Care',
    categoryIds: ['category-1'],
  };
  expect(getProviderOnboardingDraftRedirect('documents', categoriesComplete)).toBe(
    Routes.PROVIDER_ONBOARDING.SERVICE_AREA,
  );

  const areaComplete = {
    ...categoriesComplete,
    serviceAreaId: 'area-1',
    latitude: 10.32,
    longitude: 123.89,
    city: 'Cebu City',
    province: 'Cebu',
  };
  expect(getProviderOnboardingDraftRedirect('terms', areaComplete)).toBe(
    Routes.PROVIDER_ONBOARDING.VETTING,
  );

  const completeDraft = {
    ...areaComplete,
    yearsExperience: 4,
    vetting: {
      ...emptyVetting,
      mainSkills: 'Aircon servicing',
      references: [{ name: 'Maria Santos', contact: '09171234567', relation: 'Client' }],
    },
    governmentIdFrontUri: 'private/front.jpg',
    governmentIdBackUri: 'private/back.jpg',
    nbiClearanceUri: 'private/nbi.jpg',
    selfieUri: 'private/selfie.jpg',
  };
  expect(getProviderOnboardingDraftRedirect('terms', completeDraft)).toBeNull();
});
