const queryMock = jest.fn();
jest.mock('../src/models/db', () => ({ db: { query: (...args: unknown[]) => queryMock(...args) } }));
const refundFromEscrowMock = jest.fn();
jest.mock('../src/services/escrow.service', () => ({
  refundFromEscrow: (...args: unknown[]) => refundFromEscrowMock(...args),
  releaseEscrow: jest.fn(),
  releasePartialEscrow: jest.fn(),
}));
const processRefundMock = jest.fn();
jest.mock('../src/services/payment.service', () => ({
  processRefund: (...args: unknown[]) => processRefundMock(...args),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { processRetries } from '../src/services/gateway-retry.service';

it('Bug OPS-286 — a post-commit refund retry processes payment without debiting escrow again', async () => {
  queryMock
    .mockResolvedValueOnce({
      rows: [{
        id: 'retry-286', action_type: 'process_payment_refund',
        booking_id: 'booking-286', dispute_id: null,
        amount_centavos: '12500', description: 'Support-approved refund',
        attempts: 0, max_attempts: 5,
      }],
      rowCount: 1,
    })
    .mockResolvedValueOnce({ rows: [], rowCount: 1 });
  processRefundMock.mockResolvedValue(undefined);

  await processRetries(1);

  expect(processRefundMock).toHaveBeenCalledWith('booking-286', 12500, 'Support-approved refund');
  expect(refundFromEscrowMock).not.toHaveBeenCalled();
  expect(String(queryMock.mock.calls[1]?.[0])).toContain("status = 'succeeded'");
});
