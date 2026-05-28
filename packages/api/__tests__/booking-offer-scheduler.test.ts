import { readFileSync } from 'fs';
import { resolve } from 'path';

const WORKERS = readFileSync(resolve(__dirname, '../src/jobs/workers.ts'), 'utf8');

describe('booking offer sweep scheduler wiring', () => {
  it('imports booking-offer.service for scheduler execution', () => {
    expect(WORKERS).toMatch(/import \* as bookingOfferService from '\.\.\/services\/booking-offer\.service'/);
  });

  it('runs sweepExpiredOffers from a scheduler switch case', () => {
    expect(WORKERS).toMatch(/case 'booking-offers-sweep':/);
    expect(WORKERS).toMatch(/bookingOfferService\.sweepExpiredOffers\(\)/);
  });

  it('schedules booking-offers-sweep every 5 seconds', () => {
    expect(WORKERS).toMatch(/schedulerQueue\.add\('booking-offers-sweep'[\s\S]*?repeat:\s*\{ every: 5000 \}/);
  });
});
