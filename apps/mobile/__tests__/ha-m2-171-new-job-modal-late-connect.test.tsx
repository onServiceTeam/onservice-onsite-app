// HA-M2-171 (D38 Milestone 2, package P5a): the fixed-price "New Job" pop-up
// hears an offer that arrives after the live connection came up late. Before
// D38 it looked for the socket once when it mounted (usually before the
// socket existed) and so never heard an offer at all.
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

it('HA-M2-171: NewJobModal shows an offer that arrives after a late connect', async () => {
  render(<QueryClientProvider client={new QueryClient()}><NewJobModal /></QueryClientProvider>);
  expect(mockIo).not.toHaveBeenCalled();

  const socket = connectSocket() as unknown as FakeSocket;
  socket.simulateConnect();
  act(() => {
    socket.serve('new:job', {
      bookingId: 'booking-31', offerId: 'offer-31', serviceName: 'Aircon Cleaning',
      amount: 120000, city: 'Mandaue City', title: 'New job', body: 'A job near you',
    });
  });

  expect(await screen.findByText('Aircon Cleaning')).toBeTruthy();
  expect(screen.getByText('Mandaue City')).toBeTruthy();
});
