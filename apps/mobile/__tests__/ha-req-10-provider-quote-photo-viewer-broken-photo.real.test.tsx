// HA-REQ-10 (customer human audit 2026-10-13, D38): the full-screen viewer on
// the provider quote screen keeps working when one customer photo is broken.
// LazyImage remembers a load failure in its own state. The viewer used one
// LazyImage for every photo, so after one broken photo, Previous and Next
// showed the "image unavailable" placeholder for photos that load fine.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const BROKEN_PHOTO = 'https://app.onservice.ph/uploads/job-request/deleted.jpg';
const GOOD_PHOTO = 'https://app.onservice.ph/uploads/job-request/two.jpg';

const mockRequest = {
  id: 'booking-1', categoryId: 'category-1', subcategoryId: 'subcategory-1',
  categoryName: 'Aircon Services', serviceName: 'Aircon repair',
  description: 'Bedroom aircon blows warm air and drips water.',
  urgency: 'same_day', budgetMin: null, budgetMax: null,
  jobPhotos: [BROKEN_PHOTO, GOOD_PHOTO],
  jobVideoUrl: null,
  intakeAnswers: null,
  intakeQuestions: [],
  barangay: 'Lahug', city: 'Cebu City', province: 'Cebu', customerName: 'Ana Cruz',
  distanceKm: 2.1, createdAt: '2026-10-13T01:00:00.000Z',
};

// expo-image stand-in: the deleted photo fails to load the way a 404 does on
// a device (onError fires once the image tries to load); every other photo
// loads normally.
jest.mock('expo-image', () => {
  const ReactLocal = jest.requireActual('react');
  function Image(props: { source?: unknown; onError?: () => void }) {
    ReactLocal.useEffect(() => {
      if (props.source === 'https://app.onservice.ph/uploads/job-request/deleted.jpg') props.onError?.();
    }, [props.source]);
    return ReactLocal.createElement('Image', props);
  }
  return { Image, ImageContentFit: { Cover: 'cover', Contain: 'contain' }, ImageContentPosition: {} };
});
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/services/booking.service', () => ({
  getProviderJobRequest: jest.fn().mockImplementation(async () => mockRequest),
  submitQuote: jest.fn(),
}));
jest.mock('@/services/provider-crm.service', () => ({ listTemplates: jest.fn().mockResolvedValue([]) }));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn().mockResolvedValue({ data: { data: { tier: 'new', commissionRate: 0.15 } } }) },
}));

import QuoteBuilderScreen from '../app/provider/job/[id]/quote';

it('HA-REQ-10: after a broken photo in the viewer, Next still shows the next photo instead of the unavailable placeholder', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><QuoteBuilderScreen /></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'Open customer photo 1 of 2' }));
  expect(screen.getByText('Photo 1 of 2')).toBeTruthy();
  // The broken photo shows the placeholder, which has no image inside it.
  expect(screen.getByLabelText('Customer photo 1, full screen').querySelector('Image')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Next photo' }));

  expect(screen.getByText('Photo 2 of 2')).toBeTruthy();
  const second = screen.getByLabelText('Customer photo 2, full screen');
  expect(second.querySelector('Image')?.getAttribute('source')).toBe(GOOD_PHOTO);
});
