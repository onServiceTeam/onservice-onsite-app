import { db } from '../models/db';
import * as settingsService from './settings.service';

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

/**
 * Calculate commission breakdown for a booking.
 *
 * Phase 03: now async — reads commission rate, service-fee rate, fee min/max,
 * and guarantee-fund rate from the runtime settings service (DB → Redis →
 * in-memory defaults). Pure math otherwise.
 */
export async function calculateCommission(
  servicePrice: number,
  providerTier: string,
): Promise<CommissionBreakdown> {
  const commissionRate = await settingsService.getCommissionRate(providerTier);
  const commissionAmount = Math.round(servicePrice * commissionRate);

  const serviceFeeRate = await settingsService.getSettingPercent('service_fee_rate');
  let serviceFeeAmount = Math.round(servicePrice * serviceFeeRate);

  const minFee = await settingsService.getSettingNumber('service_fee_min');
  const maxFee = await settingsService.getSettingNumber('service_fee_max');
  serviceFeeAmount = Math.max(serviceFeeAmount, minFee);
  serviceFeeAmount = Math.min(serviceFeeAmount, maxFee);

  const guaranteeFundRate = await settingsService.getSettingPercent('guarantee_fund_rate');
  const guaranteeFundContribution = Math.round(serviceFeeAmount * guaranteeFundRate);

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
 * FR-102: cancellation refund split based on timing.
 *
 * Phase 03: now async — reads cancel_refund_* settings. Returned percentages
 * are 0..1 fractions (e.g. 0.80) for compatibility with prior callers.
 */
export async function calculateCancellationRefund(
  servicePrice: number,
  hoursUntilScheduled: number,
  providerArrived: boolean,
  customerNoShow = false,
): Promise<CancellationRefund> {
  let customerRefundPercentInt: number; // 0..100

  if (customerNoShow) {
    customerRefundPercentInt = await settingsService.getSettingNumber('cancel_refund_customer_noshow');
  } else if (providerArrived) {
    customerRefundPercentInt = await settingsService.getSettingNumber('cancel_refund_provider_arrived');
  } else if (hoursUntilScheduled < 0.5) {
    customerRefundPercentInt = await settingsService.getSettingNumber('cancel_refund_under_30min');
  } else if (hoursUntilScheduled < 1) {
    customerRefundPercentInt = await settingsService.getSettingNumber('cancel_refund_30min_to_1h');
  } else if (hoursUntilScheduled < 2) {
    customerRefundPercentInt = await settingsService.getSettingNumber('cancel_refund_1_to_2h');
  } else if (hoursUntilScheduled < 24) {
    customerRefundPercentInt = await settingsService.getSettingNumber('cancel_refund_2_to_24h');
  } else {
    customerRefundPercentInt = await settingsService.getSettingNumber('cancel_refund_over_24h');
  }

  const customerRefundPercent = customerRefundPercentInt / 100;
  const providerCompensationPercent = 1 - customerRefundPercent;

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
