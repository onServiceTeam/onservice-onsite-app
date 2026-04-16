import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import { platformConfig } from '../config/platform.config';

interface SukiMembershipRow {
  id: string;
  customer_id: string;
  provider_id: string;
  total_bookings: number;
  total_spent: string;
  tier: string;
  points_balance: number;
  last_booking_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface SukiRewardRow {
  id: string;
  membership_id: string;
  booking_id: string | null;
  type: string;
  points: number;
  description: string;
  created_at: Date;
}

interface CountRow { count: string }

const SUKI_TIERS = platformConfig.sukiTiers;
const POINTS_REDEMPTION_RATE = platformConfig.sukiPointsRedemptionRate;
const DEFAULT_TIER = { minBookings: 0, discount: 0, pointsPerPeso: 1 };

function computeTier(totalBookings: number): string {
  if (totalBookings >= (SUKI_TIERS['super_suki']?.minBookings ?? Infinity)) return 'super_suki';
  if (totalBookings >= (SUKI_TIERS['suki']?.minBookings ?? Infinity)) return 'suki';
  if (totalBookings >= (SUKI_TIERS['regular']?.minBookings ?? Infinity)) return 'regular';
  return 'new';
}

export async function getOrCreateMembership(customerId: string, providerId: string): Promise<SukiMembershipRow> {
  const existing = await db.query<SukiMembershipRow>(
    `SELECT * FROM suki_memberships WHERE customer_id = $1 AND provider_id = $2`,
    [customerId, providerId],
  );
  if (existing.rows.length > 0) return existing.rows[0]!;

  const result = await db.query<SukiMembershipRow>(
    `INSERT INTO suki_memberships (customer_id, provider_id)
     VALUES ($1, $2)
     ON CONFLICT (customer_id, provider_id) DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [customerId, providerId],
  );
  return result.rows[0]!;
}

export async function recordBookingForSuki(
  customerId: string,
  providerId: string,
  bookingId: string,
  bookingAmount: number,
): Promise<{ membership: SukiMembershipRow; tierChanged: boolean; pointsEarned: number }> {
  const membership = await getOrCreateMembership(customerId, providerId);

  const oldTier = membership.tier;
  const newBookings = membership.total_bookings + 1;
  const newSpent = Number(membership.total_spent) + bookingAmount;
  const newTier = computeTier(newBookings);
  const tierChanged = newTier !== oldTier;

  const tierConfig = SUKI_TIERS[newTier] ?? DEFAULT_TIER;
  const pointsEarned = Math.floor((bookingAmount / 100) * tierConfig.pointsPerPeso);

  return db.transaction(async (client) => {
    const updated = await client.query<SukiMembershipRow>(
      `UPDATE suki_memberships SET
         total_bookings = $1, total_spent = $2, tier = $3,
         points_balance = points_balance + $4, last_booking_at = NOW(), updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [newBookings, newSpent, newTier, pointsEarned, membership.id],
    );

    await client.query(
      `INSERT INTO suki_rewards (membership_id, booking_id, type, points, description)
       VALUES ($1, $2, 'earned', $3, $4)`,
      [membership.id, bookingId, pointsEarned,
        `Earned ${pointsEarned} points for booking (${tierConfig.pointsPerPeso}x multiplier)`],
    );

    if (tierChanged) {
      await client.query(
        `INSERT INTO suki_rewards (membership_id, type, points, description)
         VALUES ($1, 'bonus', $2, $3)`,
        [membership.id, platformConfig.sukiTierUpBonusPoints, `Tier upgrade bonus: ${oldTier} → ${newTier}`],
      );
      await client.query(
        `UPDATE suki_memberships SET points_balance = points_balance + $2 WHERE id = $1`,
        [membership.id, platformConfig.sukiTierUpBonusPoints],
      );

      interface ProviderNameRow { business_name: string; user_id: string }
      const provInfo = await client.query<ProviderNameRow>(
        `SELECT p.business_name, p.user_id FROM providers p WHERE p.id = $1`,
        [providerId],
      );
      if (provInfo.rows[0]) {
        const discount = SUKI_TIERS[newTier]?.discount ?? 0;
        await client.query(
          `INSERT INTO notifications (user_id, type, title, body, data)
           VALUES ($1, 'suki', 'Suki Tier Up!', $2, $3)`,
          [
            customerId,
            `You are now a ${newTier.replace('_', ' ')} at ${provInfo.rows[0].business_name}! Enjoy ${discount}% off your next booking.`,
            JSON.stringify({ providerId, tier: newTier, discount }),
          ],
        );
      }

      logger.info('Suki tier changed', { customerId, providerId, oldTier, newTier });
    }

    return { membership: updated.rows[0]!, tierChanged, pointsEarned };
  });
}

export async function redeemPoints(
  customerId: string,
  membershipId: string,
  points: number,
): Promise<{ amountCredited: number; remainingPoints: number }> {
  if (points <= 0 || points % POINTS_REDEMPTION_RATE !== 0) {
    throw createAppError(`Points must be positive and a multiple of ${POINTS_REDEMPTION_RATE}.`, 400);
  }

  const membership = await db.query<SukiMembershipRow>(
    `SELECT * FROM suki_memberships WHERE id = $1 AND customer_id = $2`,
    [membershipId, customerId],
  );
  if (membership.rows.length === 0) throw createAppError('Membership not found.', 404);
  const m = membership.rows[0]!;

  if (m.points_balance < points) throw createAppError('Insufficient points.', 400);

  const amountCredited = points;

  return db.transaction(async (client) => {
    await client.query(
      `UPDATE suki_memberships SET points_balance = points_balance - $1, updated_at = NOW() WHERE id = $2`,
      [points, membershipId],
    );

    await client.query(
      `INSERT INTO suki_rewards (membership_id, type, points, description)
       VALUES ($1, 'redeemed', $2, $3)`,
      [membershipId, -points, `Redeemed ${points} points for ₱${(amountCredited / 100).toFixed(2)} wallet credit`],
    );

    const wallet = await client.query<{ id: string }>(
      `SELECT id FROM wallets WHERE user_id = $1 AND type = 'customer'`,
      [customerId],
    );
    if (wallet.rows[0]) {
      await client.query(
        `UPDATE wallets SET available_balance = available_balance + $1, updated_at = NOW() WHERE id = $2`,
        [amountCredited, wallet.rows[0].id],
      );
      await client.query(
        `INSERT INTO wallet_transactions (wallet_id, type, amount, balance_after, description, reference_id)
         VALUES ($1, 'payment', $2, (SELECT available_balance FROM wallets WHERE id = $1), 'Suki points redemption', $3)`,
        [wallet.rows[0].id, amountCredited, membershipId],
      );
    }

    const updated = await client.query<SukiMembershipRow>(
      `SELECT * FROM suki_memberships WHERE id = $1`,
      [membershipId],
    );

    logger.info('Points redeemed', { customerId, membershipId, points, amountCredited });
    return { amountCredited, remainingPoints: updated.rows[0]!.points_balance };
  });
}

export async function getCustomerMemberships(
  customerId: string,
  page = 1,
  pageSize = 20,
): Promise<{ memberships: SukiMembershipRow[]; total: number }> {
  const offset = (page - 1) * pageSize;

  const [countResult, dataResult] = await Promise.all([
    db.query<CountRow>(
      `SELECT COUNT(*)::text as count FROM suki_memberships WHERE customer_id = $1`,
      [customerId],
    ),
    db.query<SukiMembershipRow & { provider_name: string | null }>(
      `SELECT sm.*, p.business_name AS provider_name
       FROM suki_memberships sm
       LEFT JOIN providers p ON p.id = sm.provider_id
       WHERE sm.customer_id = $1
       ORDER BY sm.last_booking_at DESC NULLS LAST
       LIMIT $2 OFFSET $3`,
      [customerId, pageSize, offset],
    ),
  ]);

  return { memberships: dataResult.rows, total: Number(countResult.rows[0]?.count ?? 0) };
}

export async function getMembershipRewards(
  membershipId: string,
  page = 1,
  pageSize = 20,
): Promise<{ rewards: SukiRewardRow[]; total: number }> {
  const offset = (page - 1) * pageSize;

  const [countResult, dataResult] = await Promise.all([
    db.query<CountRow>(
      `SELECT COUNT(*)::text as count FROM suki_rewards WHERE membership_id = $1`,
      [membershipId],
    ),
    db.query<SukiRewardRow>(
      `SELECT * FROM suki_rewards WHERE membership_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [membershipId, pageSize, offset],
    ),
  ]);

  return { rewards: dataResult.rows, total: Number(countResult.rows[0]?.count ?? 0) };
}

export function getSukiDiscount(tier: string): number {
  return SUKI_TIERS[tier]?.discount ?? 0;
}

export async function calculateSukiDiscountForBooking(
  customerId: string,
  providerId: string,
  servicePrice: number,
): Promise<{ discountPercent: number; discountAmount: number }> {
  const result = await db.query<{ tier: string }>(
    `SELECT tier FROM suki_memberships WHERE customer_id = $1 AND provider_id = $2`,
    [customerId, providerId],
  );
  const tier = result.rows[0]?.tier ?? 'new';
  const discountPercent = SUKI_TIERS[tier]?.discount ?? 0;
  if (discountPercent <= 0) return { discountPercent: 0, discountAmount: 0 };
  const discountAmount = Math.round(servicePrice * (discountPercent / 100));
  return { discountPercent, discountAmount };
}

export function getSukiTiers(): Record<string, { minBookings: number; pointsPerPeso: number; discount: number }> {
  return SUKI_TIERS;
}

export function formatMembership(m: SukiMembershipRow & { provider_name?: string | null }): Record<string, unknown> {
  const tierConfig = SUKI_TIERS[m.tier] ?? DEFAULT_TIER;
  return {
    id: m.id,
    customerId: m.customer_id,
    providerId: m.provider_id,
    providerName: m.provider_name ?? 'Unknown Provider',
    totalBookings: m.total_bookings,
    totalSpent: Number(m.total_spent),
    tier: m.tier,
    pointsBalance: m.points_balance,
    discount: tierConfig.discount,
    pointsMultiplier: tierConfig.pointsPerPeso,
    lastBookingAt: m.last_booking_at,
    createdAt: m.created_at,
  };
}

export async function getProviderSukiCustomers(
  providerUserId: string,
  page = 1,
  pageSize = 20,
): Promise<{ memberships: (SukiMembershipRow & { customer_name: string | null })[]; total: number }> {
  const providerResult = await db.query<{ id: string }>(
    `SELECT id FROM providers WHERE user_id = $1`,
    [providerUserId],
  );
  if (providerResult.rows.length === 0) {
    throw createAppError('Provider not found.', 404);
  }
  const providerId = providerResult.rows[0]!.id;
  const offset = (page - 1) * pageSize;

  const [countResult, dataResult] = await Promise.all([
    db.query<CountRow>(
      `SELECT COUNT(*)::text as count FROM suki_memberships WHERE provider_id = $1`,
      [providerId],
    ),
    db.query<SukiMembershipRow & { customer_name: string | null }>(
      `SELECT sm.*,
              CONCAT(u.first_name, ' ', LEFT(u.last_name, 1), '.') AS customer_name
       FROM suki_memberships sm
       JOIN users u ON u.id = sm.customer_id
       WHERE sm.provider_id = $1
       ORDER BY sm.total_bookings DESC, sm.last_booking_at DESC NULLS LAST
       LIMIT $2 OFFSET $3`,
      [providerId, pageSize, offset],
    ),
  ]);

  return { memberships: dataResult.rows, total: Number(countResult.rows[0]?.count ?? 0) };
}

export function formatProviderCustomer(m: SukiMembershipRow & { customer_name?: string | null }): Record<string, unknown> {
  const tierConfig = SUKI_TIERS[m.tier] ?? DEFAULT_TIER;
  return {
    id: m.id,
    customerId: m.customer_id,
    customerName: m.customer_name ?? 'Customer',
    totalBookings: m.total_bookings,
    totalSpent: Number(m.total_spent),
    tier: m.tier,
    discount: tierConfig.discount,
    lastBookingAt: m.last_booking_at,
  };
}

export function formatReward(r: SukiRewardRow): Record<string, unknown> {
  return {
    id: r.id,
    membershipId: r.membership_id,
    bookingId: r.booking_id,
    type: r.type,
    points: r.points,
    description: r.description,
    createdAt: r.created_at,
  };
}
