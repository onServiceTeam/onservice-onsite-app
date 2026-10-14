// HA-M2-172 (D38 Milestone 2, package P5a): the "New Job" pop-up counts
// down from 45 seconds, the server's offer window
// (booking-offer.service.ts OFFER_TIMEOUT_SECONDS). It said 60 before, so the
// last 15 seconds showed an offer the server had already moved on from.
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FakeSocket } from '../test-support/fake-socket';

const mockIo = jest.fn();

jest.mock('socket.io-client', () => ({ io: (...args: unknown[]) => mockIo(...args) }));
jest.mock('../src/services/secure-storage', () => ({ getAccessToken: () => 'access-token' }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/services/booking.service', () => ({ acceptOffer: jest.fn(), declineOffer: jest.fn() }));

import NewJobModal from '@/components/provider/NewJobModal';
import { connectSocket, __resetSocketForTests } from '@/services/socket.service';

beforeEach(() => {
  __resetSocketForTests();
  mockIo.mockReset();
  mockIo.mockImplementation((url: string, options: object) => new FakeSocket(url, options));
});

it('HA-M2-172: the NewJobModal countdown starts at 45 seconds', async () => {
  const socket = connectSocket() as unknown as FakeSocket;
  socket.simulateConnect();
  render(<QueryClientProvider client={new QueryClient()}><NewJobModal /></QueryClientProvider>);

  act(() => {
    socket.serve('new:job', {
      bookingId: 'booking-32', offerId: 'offer-32', serviceName: 'Plumbing',
      amount: 90000, city: 'Cebu City', title: 'New job', body: 'A job near you',
    });
  });

  expect(await screen.findByText('45s to respond')).toBeTruthy();
  expect(screen.queryByText('60s to respond')).toBeNull();
});
