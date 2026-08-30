import React from 'react';
import { Redirect, useSegments } from 'expo-router';
import { Routes } from '@/config/navigation';
import { useOnboardingStore, type OnboardingState } from '@/stores/onboarding.store';

type DraftState = Pick<
  OnboardingState,
  | 'selectedRole'
  | 'businessName'
  | 'categoryIds'
  | 'serviceAreaId'
  | 'latitude'
  | 'longitude'
  | 'city'
  | 'province'
  | 'yearsExperience'
  | 'vetting'
  | 'governmentIdFrontUri'
  | 'governmentIdBackUri'
  | 'nbiClearanceUri'
  | 'selfieUri'
>;

const DRAFT_STEP_INDEX: Record<string, number> = {
  'role-select': 0,
  categories: 1,
  'service-area': 2,
  vetting: 3,
  documents: 4,
  'identity-verification': 4,
  selfie: 5,
  terms: 6,
};

function firstIncompleteStep(draft: DraftState): { index: number; route: string } | null {
  if (draft.selectedRole !== 'provider') {
    return { index: 0, route: Routes.PROVIDER_ONBOARDING.ROLE_SELECT };
  }
  if (draft.businessName.trim().length < 2 || draft.categoryIds.length === 0) {
    return { index: 1, route: Routes.PROVIDER_ONBOARDING.CATEGORIES };
  }
  if (
    !draft.serviceAreaId
    || draft.latitude == null
    || draft.longitude == null
    || !draft.city.trim()
    || !draft.province.trim()
  ) {
    return { index: 2, route: Routes.PROVIDER_ONBOARDING.SERVICE_AREA };
  }
  const firstReference = draft.vetting.references[0];
  if (
    draft.yearsExperience == null
    || draft.vetting.mainSkills.trim().length < 2
    || !firstReference
    || firstReference.name.trim().length < 2
    || firstReference.contact.trim().length < 5
  ) {
    return { index: 3, route: Routes.PROVIDER_ONBOARDING.VETTING };
  }
  if (!draft.governmentIdFrontUri || !draft.governmentIdBackUri || !draft.nbiClearanceUri) {
    return { index: 4, route: Routes.PROVIDER_ONBOARDING.DOCUMENTS };
  }
  if (!draft.selfieUri) {
    return { index: 5, route: Routes.PROVIDER_ONBOARDING.SELFIE };
  }
  return null;
}

export function getProviderOnboardingDraftRedirect(
  routeName: string | undefined,
  draft: DraftState,
): string | null {
  if (!routeName || routeName === 'review-pending' || routeName === 'background-check-status') {
    return null;
  }
  const targetIndex = DRAFT_STEP_INDEX[routeName];
  if (targetIndex == null) return null;
  const incomplete = firstIncompleteStep(draft);
  return incomplete && incomplete.index < targetIndex ? incomplete.route : null;
}

export function ProviderOnboardingDraftGuard({ children }: { children: React.ReactNode }): React.ReactElement {
  const segments = useSegments();
  const draft = useOnboardingStore();
  const routeName = segments[segments.length - 1];
  const redirect = getProviderOnboardingDraftRedirect(routeName, draft);

  if (redirect) return <Redirect href={redirect} />;
  return <>{children}</>;
}

export default ProviderOnboardingDraftGuard;
