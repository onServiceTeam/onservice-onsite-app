jest.mock('../src/models/db', () => ({ db: { query: jest.fn(), transaction: jest.fn() } }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/escrow.service', () => ({}));
jest.mock('../src/services/socket.service', () => ({}));
jest.mock('../src/services/settings.service', () => ({}));
jest.mock('../src/services/gateway-retry.service', () => ({}));

import { assertDisputeResolutionAvailable } from '../src/services/dispute.service';

it('Bug OPS-316 — incomplete redo and provider-warning remedies fail closed instead of recording outcomes they do not perform', () => {
  expect(() => assertDisputeResolutionAvailable('free_redo')).toThrow(expect.objectContaining({ statusCode: 409 }));
  expect(() => assertDisputeResolutionAvailable('refund_with_warning')).toThrow(expect.objectContaining({ statusCode: 409 }));
  expect(() => assertDisputeResolutionAvailable('full_refund')).not.toThrow();
  expect(() => assertDisputeResolutionAvailable('refund_with_suspension')).not.toThrow();
});
