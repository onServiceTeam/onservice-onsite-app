const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { addPortfolioItem, formatPortfolioItem } from '../src/services/provider.service';

it('BUG-UX-118 — publishing a portfolio photo records timestamped customer-consent evidence', async () => {
  const consentAt = new Date('2026-08-24T08:00:00.000Z');
  dbQueryMock.mockResolvedValueOnce({
    rows: [{
      id: 'portfolio-1',
      provider_id: 'provider-1',
      image_url: 'https://cdn.example/portfolio/user-1/work.jpg',
      caption: 'Completed aircon cleaning',
      category_id: null,
      display_order: 0,
      is_active: true,
      customer_consent_confirmed_at: consentAt,
      created_at: consentAt,
      updated_at: consentAt,
    }],
    rowCount: 1,
  });

  const item = await addPortfolioItem('provider-1', {
    imageUrl: 'https://cdn.example/portfolio/user-1/work.jpg',
    customerConsentConfirmed: true,
  });

  const sql = String(dbQueryMock.mock.calls[0]![0]);
  expect(sql).toMatch(/customer_consent_confirmed_at[\s\S]*NOW\(\)/i);
  expect(formatPortfolioItem(item)).toMatchObject({ customerConsentConfirmed: true });
});
