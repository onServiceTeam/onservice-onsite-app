import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as Location from 'expo-location';
import { useOnboardingStore } from '@/stores/onboarding.store';
import { deferred, mockDraftSaves, readyApplication, revisionOne, revisionTwo } from '../test-support/application-draft-fixture';
import ServiceArea from '../app/provider-onboarding/service-area';

const mockPush = jest.fn();
const mockAreas = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Metro Cebu', city: 'Cebu City', province: 'Cebu', status: 'active', centerLat: 10.3157, centerLng: 123.8854, radiusKm: 35 },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Davao', city: 'Davao City', province: 'Davao del Sur', status: 'active', centerLat: 7.1907, centerLng: 125.4553, radiusKm: 35 },
];
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));
jest.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: mockAreas, isLoading: false, isError: false }) }));
jest.mock('@/services/config.service', () => ({ getConfig: () => ({ maxServiceRadius: 30 }) }));
jest.mock('@/services/service-area.service', () => ({ getProviderApplicationAreas: jest.fn() }));
jest.mock('expo-location', () => ({ Accuracy: { Balanced: 3 }, requestForegroundPermissionsAsync: jest.fn(), getCurrentPositionAsync: jest.fn() }));

it('Bug UX-1326 — changing applicant markets cancels the previous location result before it can become the new market pin', async () => {
  readyApplication();
  mockDraftSaves();
  jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({ status: 'granted' } as never);
  const oldLocation = deferred<Location.LocationObject>();
  jest.mocked(Location.getCurrentPositionAsync).mockReturnValueOnce(oldLocation.promise);
  render(<ServiceArea />);
  fireEvent.click(screen.getByRole('radio', { name: 'Metro Cebu, Active market' }));
  fireEvent.click(screen.getByRole('button', { name: 'Capture exact provider operating location' }));
  await waitFor(() => expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('radio', { name: 'Davao, Active market' }));
  await act(async () => oldLocation.resolve({ coords: { latitude: 10.32, longitude: 123.89 } } as never));
  expect(screen.queryByText(/GPS captured:/)).toBeNull();
  expect(screen.getByRole('button', { name: 'Save & continue' })).toHaveProperty('disabled', true);
  jest.mocked(Location.getCurrentPositionAsync).mockResolvedValueOnce({ coords: { latitude: 7.2, longitude: 125.46 } } as never);
  fireEvent.click(screen.getByRole('button', { name: 'Capture exact provider operating location' }));
  await screen.findByText('Exact operating location captured inside Davao.');
  fireEvent.click(screen.getByRole('button', { name: 'Save & continue' }));
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/provider-onboarding/vetting'));
  expect(useOnboardingStore.getState()).toMatchObject({ serviceAreaId: revisionTwo, latitude: 7.2, longitude: 125.46 });
  expect(useOnboardingStore.getState().serviceAreaId).not.toBe(revisionOne);
});
