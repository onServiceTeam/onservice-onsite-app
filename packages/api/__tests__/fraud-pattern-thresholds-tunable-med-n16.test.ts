// MED-N16 — fraud-pattern thresholds must be admin-tunable and retain safe
// built-in behavior if the settings store cannot be read.

const mockDbQuery = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => mockDbQuery(...args) },
}));

import * as settingsService from '../src/services/settings.service';
import { getCustomerDisputes } from '../src/services/customer-admin.service';

function disputeRow(index: number, favorsProvider: boolean): Record<string, unknown> {
  return {
    id: `dispute-${index}`,
    booking_id: `booking-${index}`,
    business_name: 'Test Provider',
    type: 'quality',
    status: 'resolved',
    resolution_type: favorsProvider ? 'no_refund' : 'full_refund',
    refund_amount: favorsProvider ? 0 : 10000,
    created_at: new Date(Date.now() - index * 24 * 60 * 60 * 1000),
  };
}

describe('fraud-pattern threshold settings', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    mockDbQuery.mockReset();
  });

  it('MED-N16 — applies configured thresholds and falls back to the documented defaults when settings are unavailable', async () => {
    expect(settingsService.SETTING_DEFAULTS.fraud_pattern_dispute_count_threshold).toBe('5');
    expect(settingsService.SETTING_DEFAULTS.fraud_pattern_window_days).toBe('30');
    expect(settingsService.SETTING_DEFAULTS.fraud_pattern_favor_provider_rate).toBe('0.80');

    const integerSetting = jest
      .spyOn(settingsService, 'getSettingInteger')
      .mockImplementation(async (key: string) => {
        if (key === 'fraud_pattern_dispute_count_threshold') return 2;
        if (key === 'fraud_pattern_window_days') return 7;
        throw new Error(`Unexpected setting: ${key}`);
      });
    const decimalSetting = jest
      .spyOn(settingsService, 'getSetting')
      .mockResolvedValue('0.50');

    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ count: '2' }] })
      .mockResolvedValueOnce({ rows: [disputeRow(1, true), disputeRow(2, true)] })
      .mockResolvedValueOnce({
        rows: [{ disputes_in_window: '2', resolved_in_window: '2', no_refund_in_window: '2' }],
      });

    const configured = await getCustomerDisputes('customer-1');

    expect(integerSetting).toHaveBeenCalledWith('fraud_pattern_dispute_count_threshold');
    expect(integerSetting).toHaveBeenCalledWith('fraud_pattern_window_days');
    expect(decimalSetting).toHaveBeenCalledWith('fraud_pattern_favor_provider_rate');
    expect(configured.fraudPattern).toMatchObject({
      disputesInWindow: 2,
      windowDays: 7,
      favorProviderRate: 1,
      flagged: true,
      reason: expect.stringContaining('in 7 days'),
    });

    integerSetting.mockRejectedValue(new Error('settings unavailable'));
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ count: '5' }] })
      .mockResolvedValueOnce({
        rows: [
          disputeRow(1, true),
          disputeRow(2, true),
          disputeRow(3, true),
          disputeRow(4, true),
          disputeRow(5, false),
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ disputes_in_window: '5', resolved_in_window: '5', no_refund_in_window: '4' }],
      });

    const fallback = await getCustomerDisputes('customer-1');

    expect(fallback.fraudPattern).toMatchObject({
      disputesInWindow: 5,
      windowDays: 30,
      favorProviderRate: 0.8,
      flagged: true,
      reason: expect.stringContaining('in 30 days'),
    });
  });
});
