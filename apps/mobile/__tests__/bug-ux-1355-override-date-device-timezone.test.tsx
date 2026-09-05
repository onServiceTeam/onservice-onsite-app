import React from 'react';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Availability from '../app/provider/availability';

jest.mock('@/services/provider-api.service', () => ({
  getAvailabilityStatus: jest.fn().mockResolvedValue(false),
  getAvailabilityOverrides: jest.fn().mockResolvedValue([
    { id: 'future-block', overrideDate: '2099-08-31', isAvailable: false, reason: 'Synthetic month boundary', startTime: null, endTime: null },
    { id: 'leap-block', overrideDate: '2104-02-29', isAvailable: false, reason: 'Synthetic leap day', startTime: null, endTime: null },
  ]),
  addAvailabilityOverride: jest.fn(), removeAvailabilityOverride: jest.fn(), toggleAvailability: jest.fn(),
}));

it('Bug UX-1355 — date override labels preserve the saved Manila calendar day in other device timezones', async () => {
  const childTimezone = process.env.ONSERVICE_DATE_LABEL_TEST_CHILD;
  if (!childTimezone) {
    // A fresh Node process is required: changing process.env.TZ inside Jest's
    // sandbox does not reliably change its already initialized Date runtime.
    // Each child executes the real render/assertions below, without recursion.
    const run = promisify(execFile);
    for (const timezone of ['Pacific/Auckland', 'America/Los_Angeles', 'UTC']) {
      await run(process.execPath, [require.resolve('jest/bin/jest'), '--config', path.resolve(__dirname, '../jest.config.js'),
        '--runInBand', '--silent', '--runTestsByPath', __filename], {
        cwd: path.resolve(__dirname, '..'),
        env: { ...process.env, TZ: timezone, ONSERVICE_DATE_LABEL_TEST_CHILD: timezone, DEBUG_PRINT_LIMIT: '450' },
        timeout: 15000, maxBuffer: 1024 * 1024,
      });
    }
  } else {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(childTimezone);
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(<QueryClientProvider client={client}><Availability /></QueryClientProvider>);
  try {
    expect(await screen.findByText('Mon, Aug 31, 2099')).toBeTruthy();
    expect(screen.getByText('Fri, Feb 29, 2104')).toBeTruthy();
    expect(screen.queryByText('Sun, Aug 30, 2099')).toBeNull();
    expect(screen.queryByText('Thu, Feb 28, 2104')).toBeNull();
  } finally { view.unmount(); client.clear(); }
}, 60000);
