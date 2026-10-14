// HA-REQ-9 (customer human audit 2026-10-13, D38): the form mirrors the API
// rule. Pressing "Send request" with nothing filled in explains what is
// missing inline and never calls the API. Before D38 the button simply stayed
// greyed out until 50 characters and 2 photos were added, with no reason.
// The message only mentions quick questions when the service has some on the
// screen; a service without admin-written questions never asks for an answer.
// D38 Milestone 2: a video or voice note also counts, so the copy names them.
// Files now upload as soon as they are added (not on Send), so the old
// "no upload on an empty send" check on useImagePicker no longer applies.
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockDraft = {
  categoryId: 'category-1', categoryName: 'Aircon Services', categorySlug: 'aircon',
  subcategoryId: 'subcategory-1', subcategoryName: 'Aircon repair',
  serviceDescription: '', pricingType: 'fixed',
  address: '22 Mango Avenue', barangay: 'Kamputhaw', city: 'Cebu City', province: 'Cebu',
  latitude: 10.3157, longitude: 123.8854,
};
const mockCreateJobRequest = jest.fn();
const mockGetIntakeFields = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/stores/booking.store', () => ({
  useBookingStore: (selector: (state: { draft: typeof mockDraft }) => unknown) => selector({ draft: mockDraft }),
}));
jest.mock('@/services/booking.service', () => ({
  createJobRequest: (...args: unknown[]) => mockCreateJobRequest(...args),
  getSubcategoryIntakeFields: (...args: unknown[]) => mockGetIntakeFields(...args),
}));

import JobRequestScreen from '../app/customer/booking/job-request';

const EMPTY_MESSAGE = 'Tell the pro about the job: write at least 10 characters, or add a photo, video or voice note.';
const EMPTY_MESSAGE_WITH_QUESTIONS =
  'Tell the pro about the job: write at least 10 characters, add a photo, video or voice note, or answer a quick question.';
const UNIT_COUNT_QUESTION = {
  id: 'field-1', subcategoryId: 'subcategory-1', fieldKey: 'unit_count', label: 'How many aircon units need work?',
  helpText: null, fieldType: 'number', unit: 'units', options: null, placeholder: null,
  isRequired: false, sortOrder: 0, isActive: true,
};

function renderScreen(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><JobRequestScreen /></QueryClientProvider>);
}

beforeEach(() => {
  mockCreateJobRequest.mockClear();
  mockGetIntakeFields.mockReset();
  mockGetIntakeFields.mockResolvedValue([]);
});

it('HA-REQ-9: sending with nothing filled in shows the inline message and does not call the API', async () => {
  renderScreen();

  expect(screen.queryByText(EMPTY_MESSAGE)).toBeNull();
  const send = screen.getByRole('button', { name: 'Send request' }) as HTMLButtonElement;
  await waitFor(() => expect(send.disabled).toBe(false));
  // This service has no quick questions, so neither the hint nor the message
  // asks the customer to answer one.
  expect(screen.queryByText('Quick questions')).toBeNull();
  expect(screen.getByText('A few words, a photo or a voice note is enough. More detail helps the pro price it right.')).toBeTruthy();
  fireEvent.click(send);

  expect(await screen.findByText(EMPTY_MESSAGE)).toBeTruthy();
  expect(screen.queryByText(EMPTY_MESSAGE_WITH_QUESTIONS)).toBeNull();
  expect(screen.getByText('Check the sections marked in red, then send again.')).toBeTruthy();
  expect(mockCreateJobRequest).not.toHaveBeenCalled();
});

it('HA-REQ-9: nine letters spread out with spaces still count as nothing written', async () => {
  renderScreen();

  const send = screen.getByRole('button', { name: 'Send request' }) as HTMLButtonElement;
  await waitFor(() => expect(send.disabled).toBe(false));
  fireEvent.change(screen.getByLabelText('Describe the job'), { target: { value: 'a i r c o n l e a' } });
  fireEvent.click(send);

  expect(await screen.findByText(EMPTY_MESSAGE)).toBeTruthy();
  expect(mockCreateJobRequest).not.toHaveBeenCalled();
});

it('HA-REQ-9: on a service with quick questions, the empty-request message offers answering one', async () => {
  mockGetIntakeFields.mockResolvedValue([UNIT_COUNT_QUESTION]);
  renderScreen();

  expect(await screen.findByText('How many aircon units need work?')).toBeTruthy();
  expect(screen.getByText('A few words, a photo, a voice note or an answer above is enough. More detail helps the pro price it right.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Send request' }));

  expect(await screen.findByText(EMPTY_MESSAGE_WITH_QUESTIONS)).toBeTruthy();
  expect(screen.queryByText(EMPTY_MESSAGE)).toBeNull();
  expect(mockCreateJobRequest).not.toHaveBeenCalled();
});
