const transactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: jest.fn(), transaction: (...args: unknown[]) => transactionMock(...args) },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import {
  createPricingRule,
  deletePricingRule,
  togglePricingRule,
  updatePricingRule,
} from '../src/services/pricing.service';

it('Bug SEC-026 — legacy direct create, update, toggle, and delete entry points cannot bypass publication controls', async () => {
  const outcomes = await Promise.allSettled([
    createPricingRule({ name: 'Unsafe', type: 'rush', multiplier: 2, rushHoursThreshold: 2 }, 'actor-1'),
    updatePricingRule('rule-1', { multiplier: 2 }, 'actor-1'),
    togglePricingRule('rule-1', true, 'actor-1'),
    deletePricingRule('rule-1', 'actor-1'),
  ]);

  expect(outcomes).toEqual([
    expect.objectContaining({ status: 'rejected', reason: expect.objectContaining({ statusCode: 409 }) }),
    expect.objectContaining({ status: 'rejected', reason: expect.objectContaining({ statusCode: 409 }) }),
    expect.objectContaining({ status: 'rejected', reason: expect.objectContaining({ statusCode: 409 }) }),
    expect.objectContaining({ status: 'rejected', reason: expect.objectContaining({ statusCode: 409 }) }),
  ]);
  expect(transactionMock).not.toHaveBeenCalled();
});
