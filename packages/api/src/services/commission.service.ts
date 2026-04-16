import { db } from '../models/db';
import { platformConfig } from '../config/platform.config';

interface ProviderTierRow {
  tier: string;
}

export interface CommissionBreakdown {
  servicePrice: number;
  commissionRate: number;
  commissionAmount: number;
  serviceFeeRate: number;
  serviceFeeAmount: number;
  guaranteeFundContribution: number;
  providerReceives: number;
  platformRetains: number;
}

export function calculateCommission(servicePrice: number, providerTier: string): CommissionBreakdown {
  const commissionRate = platformConfig.commissionRates[providerTier] ?? platformConfig.commissionRates['new']!;
  const commissionAmount = Math.round(servicePrice * commissionRate);

  const serviceFeeRate = platformConfig.serviceFeeRate;
  let serviceFeeAmount = Math.round(servicePrice * serviceFeeRate);

  serviceFeeAmount = Math.max(serviceFeeAmount, platformConfig.minimumServiceFee);
  serviceFeeAmount = Math.min(serviceFeeAmount, platformConfig.maximumServiceFee);

  const guaranteeFundContribution = Math.round(serviceFeeAmount * platformConfig.guaranteeFundRate);

  const providerReceives = servicePrice - commissionAmount;
  const platformRetains = commissionAmount + serviceFeeAmount;

  return {
    servicePrice,
    commissionRate,
    commissionAmount,
    serviceFeeRate,
    serviceFeeAmount,
    guaranteeFundContribution,
    providerReceives,
    platformRetains,
  };
}

export interface CancellationRefund {
  customerRefundPercent: number;
  providerCompensationPercent: number;
  customerRefundAmount: number;
  providerCompensationAmount: number;
}

/**
 * FR-102: Cancellation refund rules based on timing (per spec).
 *
 * Spec tiers:
 *   - >2h before scheduled: 100% customer / 0% provider
 *   - <2h before scheduled: 80% customer / 20% provider
 *   - Provider has arrived:  50% customer / 50% provider
 *   - Customer no-show:       0% customer / 100% provider
 *
 * @param servicePrice in centavos
 * @param hoursUntilScheduled hours until the scheduled service time (negative = after scheduled time)
 * @param providerArrived whether the provider has already arrived at the location
 * @param customerNoShow whether the customer failed to show up
 */
export function calculateCancellationRefund(
  servicePrice: number,
  hoursUntilScheduled: number,
  providerArrived: boolean,
  customerNoShow = false,
): CancellationRefund {
  let customerRefundPercent: number;
  let providerCompensationPercent: number;

  if (customerNoShow) {
    customerRefundPercent = 0;
    providerCompensationPercent = 1.00;
  } else if (providerArrived) {
    customerRefundPercent = 0.50;
    providerCompensationPercent = 0.50;
  } else if (hoursUntilScheduled < 2) {
    customerRefundPercent = 0.80;
    providerCompensationPercent = 0.20;
  } else {
    customerRefundPercent = 1.00;
    providerCompensationPercent = 0;
  }

  return {
    customerRefundPercent,
    providerCompensationPercent,
    customerRefundAmount: Math.round(servicePrice * customerRefundPercent),
    providerCompensationAmount: Math.round(servicePrice * providerCompensationPercent),
  };
}

export async function getProviderTier(providerId: string): Promise<string> {
  const result = await db.query<ProviderTierRow>(
    `SELECT tier FROM providers WHERE id = $1`,
    [providerId],
  );
  return result.rows[0]?.tier ?? 'new';
}
