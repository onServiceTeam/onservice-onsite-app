import type { QueryResult, QueryResultRow } from 'pg';

import { createAppError } from '../middleware/error.middleware';
import { db } from '../models/db';

export type PgClient = {
  query: <R extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ) => Promise<QueryResult<R>>;
};

export type FinancialTermsEvent =
  | 'wallet_payment_authorized'
  | 'external_payment_authorized'
  | 'recurring_payment_authorized'
  | 'provider_assigned'
  | 'provider_reassigned'
  | 'change_order_authorized'
  | 'hourly_settled'
  | 'admin_financial_correction'
  | 'legacy_reviewed_backfill';

export interface CancellationPolicySnapshot {
  over24HoursPercent: number;
  twoTo24HoursPercent: number;
  oneToTwoHoursPercent: number;
  thirtyMinutesToOneHourPercent: number;
  underThirtyMinutesPercent: number;
  providerArrivedPercent: number;
  customerNoShowPercent: number;
}

export interface BookingFinancialTerms {
  id: string;
  bookingId: string;
  version: number;
  supersedesTermsId: string | null;
  termsState: 'provisional' | 'final';
  pricingVersion: string;
  providerId: string | null;
  providerTier: string | null;
  commissionSource: 'tier_default' | 'provider_contract' | 'manual_quote' | 'legacy_review' | null;
  commissionRateVersionId: string | null;
  commissionRateBasisPoints: number | null;
  servicePriceCentavos: number;
  serviceFeeRateBasisPoints: number;
  serviceFeeMinCentavos: number;
  serviceFeeMaxCentavos: number;
  serviceFeeAmountCentavos: number;
  guaranteeFundRateBasisPoints: number;
  guaranteeFundAmountCentavos: number;
  commissionAmountCentavos: number | null;
  providerReceivesCentavos: number | null;
  platformRetainsCentavos: number | null;
  totalAmountCentavos: number;
  currency: 'PHP';
  cancellationPolicy: CancellationPolicySnapshot;
  settingSources: Record<string, unknown>;
  fixedByEvent: FinancialTermsEvent;
  sourceEventId: string;
  fixedAt: Date;
  createdBy: string | null;
  metadata: Record<string, unknown>;
}

interface BookingTermsRow extends QueryResultRow {
  id: string;
  booking_id: string;
  version: number;
  supersedes_terms_id: string | null;
  terms_state: 'provisional' | 'final';
  pricing_version: string;
  provider_id: string | null;
  provider_tier: string | null;
  commission_source: BookingFinancialTerms['commissionSource'];
  commission_rate_version_id: string | null;
  commission_rate_basis_points: number | null;
  service_price_centavos: string;
  service_fee_rate_basis_points: number;
  service_fee_min_centavos: string;
  service_fee_max_centavos: string;
  service_fee_amount_centavos: string;
  guarantee_fund_rate_basis_points: number;
  guarantee_fund_amount_centavos: string;
  commission_amount_centavos: string | null;
  provider_receives_centavos: string | null;
  platform_retains_centavos: string | null;
  total_amount_centavos: string;
  currency: 'PHP';
  cancellation_policy: CancellationPolicySnapshot;
  setting_sources: Record<string, unknown>;
  fixed_by_event: FinancialTermsEvent;
  source_event_id: string;
  fixed_at: Date;
  created_by: string | null;
  metadata: Record<string, unknown>;
}

interface BookingMoneyRow extends QueryResultRow {
  id: string;
  provider_id: string | null;
  category_id: string | null;
  subcategory_id: string | null;
  status: string;
  escrow_status: string;
  service_price: string;
  service_fee: string;
  total_amount: string;
}

interface SettingSnapshotRow extends QueryResultRow {
  key: string;
  value: string;
  updated_at: Date;
}

interface CommissionRateRow extends QueryResultRow {
  id: string;
  scope_type: 'tier' | 'provider';
  rate_basis_points: number;
  effective_from: Date;
  source: string;
}

interface ProviderTierRow extends QueryResultRow {
  id: string;
  tier: string;
}

const SETTING_KEYS = [
  'service_fee_rate',
  'service_fee_min',
  'service_fee_max',
  'guarantee_fund_rate',
  'cancel_refund_over_24h',
  'cancel_refund_2_to_24h',
  'cancel_refund_1_to_2h',
  'cancel_refund_30min_to_1h',
  'cancel_refund_under_30min',
  'cancel_refund_provider_arrived',
  'cancel_refund_customer_noshow',
] as const;

type SnapshotSettingKey = (typeof SETTING_KEYS)[number];

function money(value: string | number | null, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw createAppError(`Invalid ${field} in financial terms.`, 500);
  }
  return parsed;
}

function percentToBasisPoints(value: string, key: string): number {
  const parsed = Number(value);
  const basisPoints = Math.round(parsed * 100);
  if (!Number.isFinite(parsed) || basisPoints < 0 || basisPoints > 10000) {
    throw createAppError(`Invalid percentage setting "${key}" for financial terms.`, 500);
  }
  return basisPoints;
}

function percentageSetting(value: string, key: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw createAppError(`Invalid percentage setting "${key}" for financial terms.`, 500);
  }
  return parsed;
}

function integerSetting(value: string, key: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw createAppError(`Invalid amount setting "${key}" for financial terms.`, 500);
  }
  return parsed;
}

function mapRow(row: BookingTermsRow): BookingFinancialTerms {
  return {
    id: row.id,
    bookingId: row.booking_id,
    version: Number(row.version),
    supersedesTermsId: row.supersedes_terms_id,
    termsState: row.terms_state,
    pricingVersion: row.pricing_version,
    providerId: row.provider_id,
    providerTier: row.provider_tier,
    commissionSource: row.commission_source,
    commissionRateVersionId: row.commission_rate_version_id,
    commissionRateBasisPoints: row.commission_rate_basis_points === null
      ? null
      : Number(row.commission_rate_basis_points),
    servicePriceCentavos: money(row.service_price_centavos, 'service price'),
    serviceFeeRateBasisPoints: Number(row.service_fee_rate_basis_points),
    serviceFeeMinCentavos: money(row.service_fee_min_centavos, 'service fee minimum'),
    serviceFeeMaxCentavos: money(row.service_fee_max_centavos, 'service fee maximum'),
    serviceFeeAmountCentavos: money(row.service_fee_amount_centavos, 'service fee'),
    guaranteeFundRateBasisPoints: Number(row.guarantee_fund_rate_basis_points),
    guaranteeFundAmountCentavos: money(row.guarantee_fund_amount_centavos, 'guarantee contribution'),
    commissionAmountCentavos: row.commission_amount_centavos === null
      ? null
      : money(row.commission_amount_centavos, 'commission'),
    providerReceivesCentavos: row.provider_receives_centavos === null
      ? null
      : money(row.provider_receives_centavos, 'provider amount'),
    platformRetainsCentavos: row.platform_retains_centavos === null
      ? null
      : money(row.platform_retains_centavos, 'platform amount'),
    totalAmountCentavos: money(row.total_amount_centavos, 'total'),
    currency: row.currency,
    cancellationPolicy: row.cancellation_policy,
    settingSources: row.setting_sources,
    fixedByEvent: row.fixed_by_event,
    sourceEventId: row.source_event_id,
    fixedAt: row.fixed_at,
    createdBy: row.created_by,
    metadata: row.metadata,
  };
}

function assertBookingMoney(booking: BookingMoneyRow): {
  servicePrice: number;
  serviceFee: number;
  totalAmount: number;
} {
  const servicePrice = money(booking.service_price, 'booking service price');
  const serviceFee = money(booking.service_fee, 'booking service fee');
  const totalAmount = money(booking.total_amount, 'booking total');
  if (servicePrice + serviceFee !== totalAmount) {
    throw createAppError(
      'Booking amounts do not reconcile. Financial terms cannot be fixed until operations corrects the booking.',
      409,
    );
  }
  return { servicePrice, serviceFee, totalAmount };
}

async function loadBookingForUpdate(client: PgClient, bookingId: string): Promise<BookingMoneyRow> {
  const result = await client.query<BookingMoneyRow>(
    `SELECT id, provider_id, category_id, subcategory_id, status, escrow_status,
            service_price::text, service_fee::text, total_amount::text
       FROM bookings
      WHERE id = $1
      FOR UPDATE`,
    [bookingId],
  );
  const booking = result.rows[0];
  if (!booking) throw createAppError('Booking not found.', 404);
  return booking;
}

async function loadSettings(client: PgClient): Promise<{
  serviceFeeRateBasisPoints: number;
  serviceFeeMinCentavos: number;
  serviceFeeMaxCentavos: number;
  guaranteeFundRateBasisPoints: number;
  cancellationPolicy: CancellationPolicySnapshot;
  settingSources: Record<string, unknown>;
}> {
  const result = await client.query<SettingSnapshotRow>(
    `SELECT key, value, updated_at
       FROM platform_settings
      WHERE key = ANY($1::text[])
        AND is_active = TRUE`,
    [[...SETTING_KEYS]],
  );
  const byKey = new Map<SnapshotSettingKey, SettingSnapshotRow>();
  for (const row of result.rows) {
    if ((SETTING_KEYS as readonly string[]).includes(row.key)) {
      byKey.set(row.key as SnapshotSettingKey, row);
    }
  }
  for (const key of SETTING_KEYS) {
    if (!byKey.has(key)) {
      throw createAppError(`Required financial setting "${key}" is missing.`, 500);
    }
  }

  const value = (key: SnapshotSettingKey): string => byKey.get(key)!.value;
  const percentage = (key: SnapshotSettingKey): number => percentageSetting(value(key), key);
  const sources: Record<string, unknown> = {};
  for (const key of SETTING_KEYS) {
    const row = byKey.get(key)!;
    sources[key] = { value: row.value, updatedAt: row.updated_at };
  }

  const serviceFeeMinCentavos = integerSetting(value('service_fee_min'), 'service_fee_min');
  const serviceFeeMaxCentavos = integerSetting(value('service_fee_max'), 'service_fee_max');
  if (serviceFeeMaxCentavos < serviceFeeMinCentavos) {
    throw createAppError('Service fee maximum is below the minimum.', 500);
  }

  return {
    serviceFeeRateBasisPoints: percentToBasisPoints(value('service_fee_rate'), 'service_fee_rate'),
    serviceFeeMinCentavos,
    serviceFeeMaxCentavos,
    guaranteeFundRateBasisPoints: percentToBasisPoints(value('guarantee_fund_rate'), 'guarantee_fund_rate'),
    cancellationPolicy: {
      over24HoursPercent: percentage('cancel_refund_over_24h'),
      twoTo24HoursPercent: percentage('cancel_refund_2_to_24h'),
      oneToTwoHoursPercent: percentage('cancel_refund_1_to_2h'),
      thirtyMinutesToOneHourPercent: percentage('cancel_refund_30min_to_1h'),
      underThirtyMinutesPercent: percentage('cancel_refund_under_30min'),
      providerArrivedPercent: percentage('cancel_refund_provider_arrived'),
      customerNoShowPercent: percentage('cancel_refund_customer_noshow'),
    },
    settingSources: sources,
  };
}

async function loadLatestTerms(client: PgClient, bookingId: string): Promise<BookingFinancialTerms | null> {
  const result = await client.query<BookingTermsRow>(
    `SELECT *
       FROM booking_financial_terms
      WHERE booking_id = $1
      ORDER BY version DESC
      LIMIT 1`,
    [bookingId],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

async function loadIdempotentTerms(
  client: PgClient,
  bookingId: string,
  event: FinancialTermsEvent,
  sourceEventId: string,
): Promise<BookingFinancialTerms | null> {
  const result = await client.query<BookingTermsRow>(
    `SELECT *
       FROM booking_financial_terms
      WHERE booking_id = $1
        AND fixed_by_event = $2
        AND source_event_id = $3`,
    [bookingId, event, sourceEventId],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

async function resolveCommissionRate(
  client: PgClient,
  booking: BookingMoneyRow,
  providerId: string,
  effectiveAt: Date,
): Promise<{
  providerTier: string;
  commissionSource: 'tier_default' | 'provider_contract';
  rateVersionId: string;
  rateBasisPoints: number;
}> {
  const providerResult = await client.query<ProviderTierRow>(
    `SELECT id, tier FROM providers WHERE id = $1`,
    [providerId],
  );
  const provider = providerResult.rows[0];
  if (!provider) throw createAppError('Provider not found.', 404);

  const rateResult = await client.query<CommissionRateRow>(
    `SELECT crv.id, crv.scope_type, crv.rate_basis_points, crv.effective_from, crv.source
       FROM commission_rate_versions crv
       LEFT JOIN commission_rate_version_cancellations cancelled
         ON cancelled.commission_rate_version_id = crv.id
      WHERE cancelled.id IS NULL
        AND crv.effective_from <= $1
        AND (
          (crv.scope_type = 'provider' AND crv.provider_id = $2)
          OR
          (crv.scope_type = 'tier' AND crv.tier = $3)
        )
        AND (crv.service_category_id IS NULL OR crv.service_category_id = $4)
        AND (crv.service_subcategory_id IS NULL OR crv.service_subcategory_id = $5)
      ORDER BY
        CASE WHEN crv.scope_type = 'provider' THEN 0 ELSE 1 END,
        CASE
          WHEN crv.service_subcategory_id IS NOT NULL THEN 0
          WHEN crv.service_category_id IS NOT NULL THEN 1
          ELSE 2
        END,
        crv.effective_from DESC,
        crv.created_at DESC
      LIMIT 1`,
    [effectiveAt, providerId, provider.tier, booking.category_id, booking.subcategory_id],
  );
  const rate = rateResult.rows[0];
  if (!rate) {
    throw createAppError(
      `No effective commission agreement exists for provider tier "${provider.tier}". Payment cannot be finalized.`,
      409,
    );
  }

  return {
    providerTier: provider.tier,
    commissionSource: rate.scope_type === 'provider' ? 'provider_contract' : 'tier_default',
    rateVersionId: rate.id,
    rateBasisPoints: Number(rate.rate_basis_points),
  };
}

export type BookingCommissionSource = Exclude<BookingFinancialTerms['commissionSource'], null>;
export type EffectiveCommissionSource = 'tier_default' | 'provider_contract';

export interface ProviderCommissionPreview {
  providerTier: string;
  commissionRate: number;
  commissionRateBasisPoints: number;
  commissionSource: BookingCommissionSource;
  commissionRateVersionId: string;
  isFixedForBooking: boolean;
  termsVersion: number | null;
}

export interface EffectiveProviderCommissionPreview extends ProviderCommissionPreview {
  commissionSource: EffectiveCommissionSource;
}

export interface TierBaseCommissionPreview {
  tier: string;
  commissionRate: number;
  commissionRateBasisPoints: number;
  commissionRateVersionId: string;
}

export interface ProviderTierCommissionOverview {
  currentProviderAgreement: EffectiveProviderCommissionPreview;
  tierBaseRates: TierBaseCommissionPreview[];
}

export const LEGACY_REVIEW_CONFIRMATION = 'REVIEW LEGACY FINANCIAL TERMS';

export interface LegacyFinancialReviewRequest {
  providerTier?: unknown;
  commissionRateBasisPoints?: unknown;
  serviceFeeRateBasisPoints: unknown;
  serviceFeeMinCentavos: unknown;
  serviceFeeMaxCentavos: unknown;
  guaranteeFundRateBasisPoints: unknown;
  cancellationPolicy: unknown;
  evidenceNote: unknown;
  evidenceReferences: unknown;
  confirmation: unknown;
}

interface NormalizedLegacyFinancialReview {
  providerTier: string | null;
  commissionRateBasisPoints: number | null;
  serviceFeeRateBasisPoints: number;
  serviceFeeMinCentavos: number;
  serviceFeeMaxCentavos: number;
  guaranteeFundRateBasisPoints: number;
  cancellationPolicy: CancellationPolicySnapshot;
  evidenceNote: string;
  evidenceReferences: string[];
}

const LEGACY_PROVIDER_TIERS = new Set(['founding', 'new', 'verified', 'pro', 'elite']);
const LEGACY_POLICY_KEYS: readonly (keyof CancellationPolicySnapshot)[] = [
  'over24HoursPercent',
  'twoTo24HoursPercent',
  'oneToTwoHoursPercent',
  'thirtyMinutesToOneHourPercent',
  'underThirtyMinutesPercent',
  'providerArrivedPercent',
  'customerNoShowPercent',
];

function reviewInteger(value: unknown, field: string, minimum: number, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw createAppError(`${field} must be an integer between ${minimum} and ${maximum}.`, 400);
  }
  return parsed;
}

function normalizeLegacyReview(input: LegacyFinancialReviewRequest): NormalizedLegacyFinancialReview {
  if (input.confirmation !== LEGACY_REVIEW_CONFIRMATION) {
    throw createAppError(`Type "${LEGACY_REVIEW_CONFIRMATION}" to confirm this money-control action.`, 400);
  }
  const providerTierValue = typeof input.providerTier === 'string' ? input.providerTier.trim() : '';
  const providerTier = providerTierValue || null;
  if (providerTier !== null && !LEGACY_PROVIDER_TIERS.has(providerTier)) {
    throw createAppError('providerTier is invalid.', 400);
  }
  const commissionRateBasisPoints = input.commissionRateBasisPoints === undefined
    || input.commissionRateBasisPoints === null || input.commissionRateBasisPoints === ''
    ? null
    : reviewInteger(input.commissionRateBasisPoints, 'commissionRateBasisPoints', 0, 5000);
  const serviceFeeRateBasisPoints = reviewInteger(
    input.serviceFeeRateBasisPoints,
    'serviceFeeRateBasisPoints',
    0,
    10000,
  );
  const serviceFeeMinCentavos = reviewInteger(
    input.serviceFeeMinCentavos,
    'serviceFeeMinCentavos',
    0,
    Number.MAX_SAFE_INTEGER,
  );
  const serviceFeeMaxCentavos = reviewInteger(
    input.serviceFeeMaxCentavos,
    'serviceFeeMaxCentavos',
    serviceFeeMinCentavos,
    Number.MAX_SAFE_INTEGER,
  );
  const guaranteeFundRateBasisPoints = reviewInteger(
    input.guaranteeFundRateBasisPoints,
    'guaranteeFundRateBasisPoints',
    0,
    10000,
  );
  if (!input.cancellationPolicy || typeof input.cancellationPolicy !== 'object'
      || Array.isArray(input.cancellationPolicy)) {
    throw createAppError('cancellationPolicy is required.', 400);
  }
  const cancellationPolicy = {} as CancellationPolicySnapshot;
  for (const key of LEGACY_POLICY_KEYS) {
    const parsed = Number((input.cancellationPolicy as Record<string, unknown>)[key]);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100
        || Math.round(parsed * 100) !== parsed * 100) {
      throw createAppError(`cancellationPolicy.${key} must be between 0 and 100 with at most two decimals.`, 400);
    }
    cancellationPolicy[key] = parsed;
  }
  const evidenceNote = typeof input.evidenceNote === 'string' ? input.evidenceNote.trim() : '';
  if (evidenceNote.length < 30 || evidenceNote.length > 2000) {
    throw createAppError('evidenceNote must be 30 to 2000 characters.', 400);
  }
  if (!Array.isArray(input.evidenceReferences) || input.evidenceReferences.length < 1
      || input.evidenceReferences.length > 20) {
    throw createAppError('evidenceReferences must contain 1 to 20 references.', 400);
  }
  const evidenceReferences = input.evidenceReferences.map((value) => (
    typeof value === 'string' ? value.trim() : ''
  ));
  if (evidenceReferences.some((value) => value.length < 3 || value.length > 500)) {
    throw createAppError('Each evidence reference must be 3 to 500 characters.', 400);
  }
  return {
    providerTier,
    commissionRateBasisPoints,
    serviceFeeRateBasisPoints,
    serviceFeeMinCentavos,
    serviceFeeMaxCentavos,
    guaranteeFundRateBasisPoints,
    cancellationPolicy,
    evidenceNote,
    evidenceReferences,
  };
}

function ratePreview(
  rate: Awaited<ReturnType<typeof resolveCommissionRate>>,
  termsVersion: number | null,
): EffectiveProviderCommissionPreview {
  return {
    providerTier: rate.providerTier,
    commissionRate: rate.rateBasisPoints / 10000,
    commissionRateBasisPoints: rate.rateBasisPoints,
    commissionSource: rate.commissionSource,
    commissionRateVersionId: rate.rateVersionId,
    isFixedForBooking: termsVersion !== null,
    termsVersion,
  };
}

export async function getCurrentProviderCommissionPreview(
  providerId: string,
): Promise<EffectiveProviderCommissionPreview> {
  return db.transaction(async (client) => {
    const now = await databaseNow(client);
    const rate = await resolveCommissionRate(client, {
      id: 'commission-preview',
      provider_id: providerId,
      category_id: null,
      subcategory_id: null,
      status: 'preview',
      escrow_status: 'pending',
      service_price: '0',
      service_fee: '0',
      total_amount: '0',
    }, providerId, now);
    return ratePreview(rate, null);
  });
}

export async function getProviderTierCommissionOverview(
  providerId: string,
  tiers: readonly string[],
): Promise<ProviderTierCommissionOverview> {
  return db.transaction(async (client) => {
    const now = await databaseNow(client);
    const currentRate = await resolveCommissionRate(client, {
      id: 'commission-overview',
      provider_id: providerId,
      category_id: null,
      subcategory_id: null,
      status: 'preview',
      escrow_status: 'pending',
      service_price: '0',
      service_fee: '0',
      total_amount: '0',
    }, providerId, now);

    const tierResult = await client.query<CommissionRateRow & { tier: string }>(
      `SELECT DISTINCT ON (crv.tier)
              crv.id, crv.tier, crv.scope_type, crv.rate_basis_points,
              crv.effective_from, crv.source
         FROM commission_rate_versions crv
         LEFT JOIN commission_rate_version_cancellations cancelled
           ON cancelled.commission_rate_version_id = crv.id
        WHERE cancelled.id IS NULL
          AND crv.scope_type = 'tier'
          AND crv.tier = ANY($2::text[])
          AND crv.service_category_id IS NULL
          AND crv.service_subcategory_id IS NULL
          AND crv.effective_from <= $1
        ORDER BY crv.tier, crv.effective_from DESC, crv.created_at DESC`,
      [now, [...tiers]],
    );
    const ratesByTier = new Map(tierResult.rows.map((row) => [row.tier, row]));
    const missingTiers = tiers.filter((tier) => !ratesByTier.has(tier));
    if (missingTiers.length > 0) {
      throw createAppError(
        `No effective base commission agreement exists for provider tier(s): ${missingTiers.join(', ')}.`,
        409,
      );
    }

    return {
      currentProviderAgreement: ratePreview(currentRate, null),
      tierBaseRates: tiers.map((tier) => {
        const rate = ratesByTier.get(tier)!;
        const rateBasisPoints = Number(rate.rate_basis_points);
        return {
          tier,
          commissionRate: rateBasisPoints / 10000,
          commissionRateBasisPoints: rateBasisPoints,
          commissionRateVersionId: rate.id,
        };
      }),
    };
  });
}

export async function getBookingCommissionPreview(
  providerId: string,
  bookingId: string,
): Promise<ProviderCommissionPreview> {
  return db.transaction(async (client) => {
    const bookingResult = await client.query<BookingMoneyRow>(
      `SELECT id, provider_id, category_id, subcategory_id, status, escrow_status,
              service_price::text, service_fee::text, total_amount::text
         FROM bookings
        WHERE id = $1`,
      [bookingId],
    );
    const booking = bookingResult.rows[0];
    if (!booking) throw createAppError('Booking not found.', 404);
    const accessResult = await client.query<{ allowed: boolean }>(
      `SELECT EXISTS (
         SELECT 1
           FROM bookings b
           JOIN providers p ON p.id = $2 AND p.status = 'approved'
          WHERE b.id = $1
            AND (
              b.provider_id = p.id
              OR EXISTS (
                SELECT 1 FROM booking_offers bo
                 WHERE bo.booking_id = b.id
                   AND bo.provider_id = p.id
                   AND bo.status IN ('pending', 'accepted')
              )
              OR EXISTS (
                SELECT 1 FROM booking_quotes bq
                 WHERE bq.booking_id = b.id AND bq.provider_id = p.id
              )
              OR (
                b.booking_type = 'quote_based'
                AND b.status IN ('requested', 'quoted')
                AND NOT EXISTS (
                  SELECT 1 FROM booking_quotes accepted
                   WHERE accepted.booking_id = b.id AND accepted.status = 'accepted'
                )
                AND EXISTS (
                  SELECT 1
                    FROM provider_services ps
                    LEFT JOIN service_subcategories ssc ON ssc.id = ps.subcategory_id
                   WHERE ps.provider_id = p.id
                     AND ps.is_active = TRUE
                     AND (ps.category_id = b.category_id OR ssc.category_id = b.category_id)
                )
                AND (
                  b.latitude IS NULL OR b.longitude IS NULL
                  OR p.latitude IS NULL OR p.longitude IS NULL
                  OR (6371 * acos(LEAST(1.0, GREATEST(-1.0,
                    cos(radians(b.latitude::numeric)) * cos(radians(p.latitude::numeric))
                      * cos(radians(p.longitude::numeric) - radians(b.longitude::numeric))
                    + sin(radians(b.latitude::numeric)) * sin(radians(p.latitude::numeric))
                  )))) <= COALESCE(p.service_radius_km, 1000000)
                )
              )
            )
       ) AS allowed`,
      [bookingId, providerId],
    );
    if (accessResult.rows[0]?.allowed !== true) {
      // Use the same response as a missing booking so a provider cannot use
      // commission previews to enumerate another provider's work.
      throw createAppError('Booking not found.', 404);
    }
    const terms = await loadLatestTerms(client, bookingId);
    if (terms?.termsState === 'final') {
      if (terms.providerId !== providerId || terms.providerTier === null
          || terms.commissionSource === null || terms.commissionRateVersionId === null
          || terms.commissionRateBasisPoints === null) {
        throw createAppError('This booking is fixed to a different provider agreement.', 403);
      }
      return {
        providerTier: terms.providerTier,
        commissionRate: terms.commissionRateBasisPoints / 10000,
        commissionRateBasisPoints: terms.commissionRateBasisPoints,
        commissionSource: terms.commissionSource,
        commissionRateVersionId: terms.commissionRateVersionId,
        isFixedForBooking: true,
        termsVersion: terms.version,
      };
    }
    const rate = await resolveCommissionRate(client, booking, providerId, await databaseNow(client));
    return ratePreview(rate, null);
  });
}

export function computeFinalAllocation(input: {
  servicePriceCentavos: number;
  serviceFeeAmountCentavos: number;
  commissionRateBasisPoints: number;
  guaranteeFundRateBasisPoints: number;
}): {
  commissionAmountCentavos: number;
  guaranteeFundAmountCentavos: number;
  providerReceivesCentavos: number;
  platformRetainsCentavos: number;
  totalAmountCentavos: number;
} {
  const commissionAmountCentavos = Math.round(
    input.servicePriceCentavos * input.commissionRateBasisPoints / 10000,
  );
  const guaranteeFundAmountCentavos = Math.round(
    input.serviceFeeAmountCentavos * input.guaranteeFundRateBasisPoints / 10000,
  );
  const providerReceivesCentavos = input.servicePriceCentavos - commissionAmountCentavos;
  const platformRetainsCentavos = commissionAmountCentavos
    + input.serviceFeeAmountCentavos
    - guaranteeFundAmountCentavos;
  const totalAmountCentavos = input.servicePriceCentavos + input.serviceFeeAmountCentavos;

  if (
    commissionAmountCentavos < 0
    || guaranteeFundAmountCentavos < 0
    || providerReceivesCentavos < 0
    || platformRetainsCentavos < 0
    || providerReceivesCentavos + platformRetainsCentavos + guaranteeFundAmountCentavos !== totalAmountCentavos
  ) {
    throw createAppError('Financial terms do not conserve money.', 500);
  }

  return {
    commissionAmountCentavos,
    guaranteeFundAmountCentavos,
    providerReceivesCentavos,
    platformRetainsCentavos,
    totalAmountCentavos,
  };
}

async function insertTerms(
  client: PgClient,
  input: {
    booking: BookingMoneyRow;
    previous: BookingFinancialTerms | null;
    event: FinancialTermsEvent;
    sourceEventId: string;
    createdBy?: string;
    fixedAt: Date;
    providerId: string | null;
    providerTier: string | null;
    commissionSource: BookingFinancialTerms['commissionSource'];
    commissionRateVersionId: string | null;
    commissionRateBasisPoints: number | null;
    serviceFeeRateBasisPoints: number;
    serviceFeeMinCentavos: number;
    serviceFeeMaxCentavos: number;
    guaranteeFundRateBasisPoints: number;
    cancellationPolicy: CancellationPolicySnapshot;
    settingSources: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  },
): Promise<BookingFinancialTerms> {
  const amounts = assertBookingMoney(input.booking);
  const allocation = input.providerId !== null && input.commissionRateBasisPoints !== null
    ? computeFinalAllocation({
      servicePriceCentavos: amounts.servicePrice,
      serviceFeeAmountCentavos: amounts.serviceFee,
      commissionRateBasisPoints: input.commissionRateBasisPoints,
      guaranteeFundRateBasisPoints: input.guaranteeFundRateBasisPoints,
    })
    : null;

  const version = (input.previous?.version ?? 0) + 1;
  const inserted = await client.query<BookingTermsRow>(
    `INSERT INTO booking_financial_terms (
       booking_id, version, supersedes_terms_id, terms_state, pricing_version,
       provider_id, provider_tier, commission_source, commission_rate_version_id,
       commission_rate_basis_points, service_price_centavos,
       service_fee_rate_basis_points, service_fee_min_centavos, service_fee_max_centavos,
       service_fee_amount_centavos, guarantee_fund_rate_basis_points,
       guarantee_fund_amount_centavos, commission_amount_centavos,
       provider_receives_centavos, platform_retains_centavos, total_amount_centavos,
       cancellation_policy, setting_sources, fixed_by_event, source_event_id,
       fixed_at, created_by, metadata
     ) VALUES (
       $1, $2, $3, $4, 'booking-v1',
       $5, $6, $7, $8,
       $9, $10,
       $11, $12, $13,
       $14, $15,
       $16, $17,
       $18, $19, $20,
       $21::jsonb, $22::jsonb, $23, $24,
       $25, $26, $27::jsonb
     )
     RETURNING *`,
    [
      input.booking.id,
      version,
      input.previous?.id ?? null,
      allocation ? 'final' : 'provisional',
      input.providerId,
      input.providerTier,
      input.commissionSource,
      input.commissionRateVersionId,
      input.commissionRateBasisPoints,
      amounts.servicePrice,
      input.serviceFeeRateBasisPoints,
      input.serviceFeeMinCentavos,
      input.serviceFeeMaxCentavos,
      amounts.serviceFee,
      input.guaranteeFundRateBasisPoints,
      allocation?.guaranteeFundAmountCentavos
        ?? Math.round(amounts.serviceFee * input.guaranteeFundRateBasisPoints / 10000),
      allocation?.commissionAmountCentavos ?? null,
      allocation?.providerReceivesCentavos ?? null,
      allocation?.platformRetainsCentavos ?? null,
      amounts.totalAmount,
      JSON.stringify(input.cancellationPolicy),
      JSON.stringify(input.settingSources),
      input.event,
      input.sourceEventId,
      input.fixedAt,
      input.createdBy ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
  const row = inserted.rows[0];
  if (!row) throw createAppError('Financial terms could not be recorded.', 500);
  return mapRow(row);
}

async function databaseNow(client: PgClient): Promise<Date> {
  const result = await client.query<{ now: Date }>('SELECT clock_timestamp() AS now');
  const now = result.rows[0]?.now;
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw createAppError('Database clock could not be read for immutable financial terms.', 500);
  }
  return now;
}

export async function appendAuthorizationTermsInTransaction(
  client: PgClient,
  input: {
    bookingId: string;
    event: 'wallet_payment_authorized' | 'external_payment_authorized' | 'recurring_payment_authorized';
    sourceEventId: string;
    createdBy?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<BookingFinancialTerms> {
  const booking = await loadBookingForUpdate(client, input.bookingId);
  const existing = await loadIdempotentTerms(client, input.bookingId, input.event, input.sourceEventId);
  if (existing) return existing;
  const previous = await loadLatestTerms(client, input.bookingId);
  const settings = await loadSettings(client);
  const fixedAt = await databaseNow(client);

  let rate: Awaited<ReturnType<typeof resolveCommissionRate>> | null = null;
  if (booking.provider_id) {
    rate = await resolveCommissionRate(client, booking, booking.provider_id, fixedAt);
  }

  return insertTerms(client, {
    booking,
    previous,
    event: input.event,
    sourceEventId: input.sourceEventId,
    ...(input.createdBy ? { createdBy: input.createdBy } : {}),
    fixedAt,
    providerId: booking.provider_id,
    providerTier: rate?.providerTier ?? null,
    commissionSource: rate?.commissionSource ?? null,
    commissionRateVersionId: rate?.rateVersionId ?? null,
    commissionRateBasisPoints: rate?.rateBasisPoints ?? null,
    ...settings,
    ...(input.metadata ? { metadata: input.metadata } : {}),
  });
}

export async function appendProviderAssignmentTermsInTransaction(
  client: PgClient,
  input: {
    bookingId: string;
    providerId: string;
    event: 'provider_assigned' | 'provider_reassigned';
    sourceEventId: string;
    createdBy?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<BookingFinancialTerms | null> {
  const booking = await loadBookingForUpdate(client, input.bookingId);
  if (booking.provider_id !== input.providerId) {
    throw createAppError('Booking provider changed before financial terms could be fixed.', 409);
  }

  // Pre-payment assignment has no held customer money yet. Authorization will
  // create the first terms version later.
  if (booking.escrow_status !== 'held' && booking.escrow_status !== 'partially_refunded') {
    return null;
  }

  const existing = await loadIdempotentTerms(client, input.bookingId, input.event, input.sourceEventId);
  if (existing) return existing;
  const previous = await loadLatestTerms(client, input.bookingId);
  if (!previous) {
    throw createAppError(
      'This paid booking has no reviewed financial terms. Operations must complete the E50 legacy review before assignment or release.',
      409,
    );
  }

  const fixedAt = await databaseNow(client);
  const rate = await resolveCommissionRate(client, booking, input.providerId, fixedAt);
  return insertTerms(client, {
    booking,
    previous,
    event: input.event,
    sourceEventId: input.sourceEventId,
    ...(input.createdBy ? { createdBy: input.createdBy } : {}),
    fixedAt,
    providerId: input.providerId,
    providerTier: rate.providerTier,
    commissionSource: rate.commissionSource,
    commissionRateVersionId: rate.rateVersionId,
    commissionRateBasisPoints: rate.rateBasisPoints,
    serviceFeeRateBasisPoints: previous.serviceFeeRateBasisPoints,
    serviceFeeMinCentavos: previous.serviceFeeMinCentavos,
    serviceFeeMaxCentavos: previous.serviceFeeMaxCentavos,
    guaranteeFundRateBasisPoints: previous.guaranteeFundRateBasisPoints,
    cancellationPolicy: previous.cancellationPolicy,
    settingSources: previous.settingSources,
    ...(input.metadata ? { metadata: input.metadata } : {}),
  });
}

export async function appendAmendedTermsInTransaction(
  client: PgClient,
  input: {
    bookingId: string;
    event: 'change_order_authorized' | 'hourly_settled' | 'admin_financial_correction';
    sourceEventId: string;
    createdBy?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<BookingFinancialTerms> {
  const booking = await loadBookingForUpdate(client, input.bookingId);
  const existing = await loadIdempotentTerms(client, input.bookingId, input.event, input.sourceEventId);
  if (existing) return existing;
  const previous = await loadLatestTerms(client, input.bookingId);
  if (!previous || previous.termsState !== 'final' || previous.providerId === null
      || previous.providerTier === null || previous.commissionSource === null
      || previous.commissionRateVersionId === null || previous.commissionRateBasisPoints === null) {
    throw createAppError(
      'Booking financial terms are missing or provisional. Operations review is required before changing the amount.',
      409,
    );
  }
  if (booking.provider_id !== previous.providerId) {
    throw createAppError('Booking provider does not match its latest financial terms.', 409);
  }

  return insertTerms(client, {
    booking,
    previous,
    event: input.event,
    sourceEventId: input.sourceEventId,
    ...(input.createdBy ? { createdBy: input.createdBy } : {}),
    fixedAt: await databaseNow(client),
    providerId: previous.providerId,
    providerTier: previous.providerTier,
    commissionSource: previous.commissionSource,
    commissionRateVersionId: previous.commissionRateVersionId,
    commissionRateBasisPoints: previous.commissionRateBasisPoints,
    serviceFeeRateBasisPoints: previous.serviceFeeRateBasisPoints,
    serviceFeeMinCentavos: previous.serviceFeeMinCentavos,
    serviceFeeMaxCentavos: previous.serviceFeeMaxCentavos,
    guaranteeFundRateBasisPoints: previous.guaranteeFundRateBasisPoints,
    cancellationPolicy: previous.cancellationPolicy,
    settingSources: previous.settingSources,
    ...(input.metadata ? { metadata: input.metadata } : {}),
  });
}

export async function reviewLegacyBookingFinancialTerms(
  bookingId: string,
  input: LegacyFinancialReviewRequest,
  actorId: string,
): Promise<BookingFinancialTerms> {
  const review = normalizeLegacyReview(input);
  return db.transaction(async (client) => {
    const booking = await loadBookingForUpdate(client, bookingId);
    if (booking.escrow_status !== 'held' && booking.escrow_status !== 'partially_refunded') {
      throw createAppError('Only held legacy bookings can be reviewed.', 409);
    }
    const previous = await loadLatestTerms(client, bookingId);
    if (previous) {
      throw createAppError('This booking already has immutable financial terms.', 409);
    }
    const amounts = assertBookingMoney(booking);
    const reproducedServiceFee = calculateServiceFeeFromTerms(amounts.servicePrice, review);
    if (reproducedServiceFee !== amounts.serviceFee) {
      throw createAppError(
        'The reviewed service-fee rate/min/max do not reproduce the booking service fee. No terms were recorded.',
        409,
      );
    }

    const fixedAt = await databaseNow(client);
    let currentProviderTier: string | null = null;
    let rateVersionId: string | null = null;
    if (booking.provider_id) {
      if (review.providerTier === null || review.commissionRateBasisPoints === null) {
        throw createAppError(
          'Historical provider tier and commission rate are required for an assigned legacy booking.',
          400,
        );
      }
      const providerResult = await client.query<{ tier: string }>(
        'SELECT tier FROM providers WHERE id = $1 FOR SHARE',
        [booking.provider_id],
      );
      currentProviderTier = providerResult.rows[0]?.tier ?? null;
      if (!currentProviderTier) throw createAppError('Assigned provider not found.', 409);
      const rateResult = await client.query<{ id: string }>(
        `INSERT INTO commission_rate_versions (
           scope_type, booking_id, rate_basis_points, effective_from, reason,
           created_by, approved_by, source, source_metadata
         ) VALUES (
           'booking', $1, $2, $3, $4, $5, $5, 'legacy_review', $6::jsonb
         )
         RETURNING id`,
        [
          bookingId,
          review.commissionRateBasisPoints,
          fixedAt,
          review.evidenceNote,
          actorId,
          JSON.stringify({
            evidenceReferences: review.evidenceReferences,
            providerId: booking.provider_id,
            historicalProviderTier: review.providerTier,
            currentProviderTierAtReview: currentProviderTier,
          }),
        ],
      );
      rateVersionId = rateResult.rows[0]?.id ?? null;
      if (!rateVersionId) throw createAppError('Legacy commission evidence could not be recorded.', 500);
    } else if (review.providerTier !== null || review.commissionRateBasisPoints !== null) {
      throw createAppError(
        'Provider tier and commission rate must be blank while the legacy booking is unassigned.',
        400,
      );
    }

    const terms = await insertTerms(client, {
      booking,
      previous: null,
      event: 'legacy_reviewed_backfill',
      sourceEventId: bookingId,
      createdBy: actorId,
      fixedAt,
      providerId: booking.provider_id,
      providerTier: booking.provider_id ? review.providerTier : null,
      commissionSource: booking.provider_id ? 'legacy_review' : null,
      commissionRateVersionId: rateVersionId,
      commissionRateBasisPoints: booking.provider_id ? review.commissionRateBasisPoints : null,
      serviceFeeRateBasisPoints: review.serviceFeeRateBasisPoints,
      serviceFeeMinCentavos: review.serviceFeeMinCentavos,
      serviceFeeMaxCentavos: review.serviceFeeMaxCentavos,
      guaranteeFundRateBasisPoints: review.guaranteeFundRateBasisPoints,
      cancellationPolicy: review.cancellationPolicy,
      settingSources: {
        source: 'legacy_operator_review',
        evidenceReferences: review.evidenceReferences,
        reviewedAt: fixedAt.toISOString(),
      },
      metadata: {
        evidenceNote: review.evidenceNote,
        currentProviderTierAtReview: currentProviderTier,
        historicalProviderTier: review.providerTier,
      },
    });

    await client.query(
      `INSERT INTO admin_actions
         (admin_id, action_type, target_type, target_id, details, reason, full_notes)
       VALUES ($1, 'legacy_financial_terms_reviewed', 'booking', $2, $3::jsonb, $4, $4)`,
      [
        actorId,
        bookingId,
        JSON.stringify({
          bookingFinancialTermsId: terms.id,
          commissionRateVersionId: rateVersionId,
          termsState: terms.termsState,
          servicePriceCentavos: terms.servicePriceCentavos,
          serviceFeeAmountCentavos: terms.serviceFeeAmountCentavos,
          totalAmountCentavos: terms.totalAmountCentavos,
          commissionRateBasisPoints: terms.commissionRateBasisPoints,
          evidenceReferences: review.evidenceReferences,
        }),
        review.evidenceNote,
      ],
    );
    return terms;
  });
}

export async function getLatestFinalTermsInTransaction(
  client: PgClient,
  bookingId: string,
): Promise<BookingFinancialTerms> {
  const latest = await getLatestTermsInTransaction(client, bookingId);
  if (latest.termsState !== 'final') {
    throw createAppError(
      'Financial terms are still provisional because no provider commission agreement was fixed. Release is blocked.',
      409,
    );
  }
  return latest;
}

export async function getLatestTermsInTransaction(
  client: PgClient,
  bookingId: string,
): Promise<BookingFinancialTerms> {
  const latest = await loadLatestTerms(client, bookingId);
  if (!latest) {
    throw createAppError(
      'Financial terms are missing for this booking. Money movement is blocked until operations completes the reviewed E50 legacy snapshot.',
      409,
    );
  }
  return latest;
}

export async function getLatestFinalTerms(bookingId: string): Promise<BookingFinancialTerms> {
  return db.transaction((client) => getLatestFinalTermsInTransaction(client, bookingId));
}

export async function getLatestTermsOrNull(bookingId: string): Promise<BookingFinancialTerms | null> {
  return db.transaction((client) => loadLatestTerms(client, bookingId));
}

export function calculateServiceFeeFromTerms(
  servicePriceCentavos: number,
  terms: Pick<BookingFinancialTerms,
    'serviceFeeRateBasisPoints' | 'serviceFeeMinCentavos' | 'serviceFeeMaxCentavos'>,
): number {
  // A zero fee rate means the customer fee is disabled. The configured
  // minimum must not silently reintroduce a charge.
  if (terms.serviceFeeRateBasisPoints === 0) return 0;
  const percentageFee = Math.round(servicePriceCentavos * terms.serviceFeeRateBasisPoints / 10000);
  return Math.min(
    terms.serviceFeeMaxCentavos,
    Math.max(terms.serviceFeeMinCentavos, percentageFee),
  );
}

export function calculateCancellationFromTerms(
  servicePriceCentavos: number,
  terms: Pick<BookingFinancialTerms, 'cancellationPolicy'>,
  hoursUntilScheduled: number,
  providerArrived: boolean,
  customerNoShow = false,
  providerAssigned = true,
): {
  customerRefundPercent: number;
  providerCompensationPercent: number;
  customerRefundAmount: number;
  providerCompensationAmount: number;
} {
  // A customer cannot owe cancellation compensation when onService has not
  // committed a provider. Authorization terms may still be provisional in
  // this state, but their original amount and policy remain the evidence for
  // the full refund.
  if (!providerAssigned) {
    return {
      customerRefundPercent: 1,
      providerCompensationPercent: 0,
      customerRefundAmount: servicePriceCentavos,
      providerCompensationAmount: 0,
    };
  }

  const policy = terms.cancellationPolicy;
  let refundPercent: number;
  if (customerNoShow) refundPercent = policy.customerNoShowPercent;
  else if (providerArrived) refundPercent = policy.providerArrivedPercent;
  else if (hoursUntilScheduled < 0.5) refundPercent = policy.underThirtyMinutesPercent;
  else if (hoursUntilScheduled < 1) refundPercent = policy.thirtyMinutesToOneHourPercent;
  else if (hoursUntilScheduled < 2) refundPercent = policy.oneToTwoHoursPercent;
  else if (hoursUntilScheduled < 24) refundPercent = policy.twoTo24HoursPercent;
  else refundPercent = policy.over24HoursPercent;

  if (!Number.isFinite(refundPercent) || refundPercent < 0 || refundPercent > 100) {
    throw createAppError('Snapshotted cancellation policy is invalid.', 500);
  }
  const customerRefundPercent = refundPercent / 100;
  const providerCompensationPercent = (100 - refundPercent) / 100;
  const customerRefundAmount = Math.round(servicePriceCentavos * customerRefundPercent);
  const providerCompensationAmount = servicePriceCentavos - customerRefundAmount;
  return {
    customerRefundPercent,
    providerCompensationPercent,
    customerRefundAmount,
    providerCompensationAmount,
  };
}

function ratioRound(value: number, numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  const result = (
    BigInt(value) * BigInt(numerator) + BigInt(Math.floor(denominator / 2))
  ) / BigInt(denominator);
  return Number(result);
}

export interface ProratedFinancialTerms {
  servicePriceCentavos: number;
  serviceFeeAmountCentavos: number;
  commissionAmountCentavos: number;
  guaranteeFundAmountCentavos: number;
  providerReceivesCentavos: number;
  platformRetainsCentavos: number;
  totalAmountCentavos: number;
}

export function prorateFinalTerms(
  terms: BookingFinancialTerms,
  remainingAmountCentavos: number,
): ProratedFinancialTerms {
  if (terms.termsState !== 'final' || terms.commissionAmountCentavos === null
      || terms.providerReceivesCentavos === null || terms.platformRetainsCentavos === null) {
    throw createAppError('Only final financial terms can be prorated.', 409);
  }
  if (!Number.isSafeInteger(remainingAmountCentavos) || remainingAmountCentavos <= 0
      || remainingAmountCentavos > terms.totalAmountCentavos) {
    throw createAppError('Partial release amount is outside the snapshotted booking total.', 400);
  }

  const servicePriceCentavos = ratioRound(
    terms.servicePriceCentavos,
    remainingAmountCentavos,
    terms.totalAmountCentavos,
  );
  const serviceFeeAmountCentavos = remainingAmountCentavos - servicePriceCentavos;
  const commissionAmountCentavos = ratioRound(
    terms.commissionAmountCentavos,
    servicePriceCentavos,
    terms.servicePriceCentavos,
  );
  const providerReceivesCentavos = servicePriceCentavos - commissionAmountCentavos;
  const guaranteeFundAmountCentavos = ratioRound(
    terms.guaranteeFundAmountCentavos,
    serviceFeeAmountCentavos,
    terms.serviceFeeAmountCentavos,
  );
  const platformRetainsCentavos = commissionAmountCentavos
    + serviceFeeAmountCentavos
    - guaranteeFundAmountCentavos;

  if (
    providerReceivesCentavos < 0
    || platformRetainsCentavos < 0
    || guaranteeFundAmountCentavos < 0
    || providerReceivesCentavos + platformRetainsCentavos + guaranteeFundAmountCentavos
      !== remainingAmountCentavos
  ) {
    throw createAppError('Prorated financial terms do not conserve money.', 500);
  }

  return {
    servicePriceCentavos,
    serviceFeeAmountCentavos,
    commissionAmountCentavos,
    guaranteeFundAmountCentavos,
    providerReceivesCentavos,
    platformRetainsCentavos,
    totalAmountCentavos: remainingAmountCentavos,
  };
}
