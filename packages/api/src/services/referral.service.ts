import crypto from 'node:crypto';
import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import * as walletService from './wallet.service';
import { formatPHP } from '../utils/currency';

interface ReferralCodeRow {
  id: string;
  user_id: string;
  code: string;
  type: string;
  uses_count: number;
  max_uses: number | null;
  referrer_bonus: string;
  referee_bonus: string;
  is_active: boolean;
  expires_at: Date | null;
  created_at: Date;
}

interface RedemptionRow {
  id: string;
  referral_code_id: string;
  referrer_id: string;
  referee_id: string;
  referrer_bonus: string;
  referee_bonus: string;
  referrer_credited: boolean;
  referee_credited: boolean;
  qualifying_booking_id: string | null;
  created_at: Date;
}

interface CountRow { count: string }

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// MED-N147 fix — pre-fix this used Math.random() which is a
// non-cryptographic PRNG. With CODE_CHARS.length=32 and length=8 the
// search space is only 32^8 ~= 1.1 trillion — but Math.random's
// state space is much smaller, and a couple of leaked codes can let
// an attacker predict subsequent codes with browser-side
// xorshift128 reverse engineering. Predictable codes also let
// attackers harvest unused referral bonuses.
//
// Post-fix: crypto.randomBytes draws from the OS CSPRNG. We modulo
// the bytes against CODE_CHARS.length using rejection sampling so
// the distribution is uniform (skips bytes >= the largest multiple
// of CODE_CHARS.length that fits in 256).
function generateCode(length = 8): string {
  const charCount = CODE_CHARS.length;
  // Largest multiple of charCount that fits in a single byte (256).
  const maxValid = 256 - (256 % charCount);
  let code = '';
  while (code.length < length) {
    // Draw enough bytes to fill the rest, with a safety margin for
    // rejected bytes. Refill on demand.
    const needed = length - code.length;
    const buf = crypto.randomBytes(needed * 2);
    for (let i = 0; i < buf.length && code.length < length; i++) {
      const b = buf[i]!;
      if (b < maxValid) {
        code += CODE_CHARS[b % charCount];
      }
      // else: rejection-sampled — try the next byte.
    }
  }
  return code;
}

export async function getOrCreateReferralCode(userId: string): Promise<ReferralCodeRow> {
  const existing = await db.query<ReferralCodeRow>(
    `SELECT * FROM referral_codes WHERE user_id = $1 AND type = 'standard' AND is_active = TRUE`,
    [userId],
  );
  if (existing.rows.length > 0) return existing.rows[0]!;

  let code: string;
  let attempts = 0;
  do {
    code = generateCode();
    const dup = await db.query<CountRow>(
      `SELECT COUNT(*)::text as count FROM referral_codes WHERE code = $1`,
      [code],
    );
    if (Number(dup.rows[0]?.count ?? 0) === 0) break;
    attempts++;
  } while (attempts < 10);

  if (attempts >= 10) throw createAppError('Could not generate unique referral code. Try again.', 500);

  const result = await db.query<ReferralCodeRow>(
    `INSERT INTO referral_codes (user_id, code, type) VALUES ($1, $2, 'standard') RETURNING *`,
    [userId, code],
  );

  logger.info('Referral code created', { userId, code });
  return result.rows[0]!;
}

export async function redeemReferralCode(
  refereeId: string,
  code: string,
): Promise<RedemptionRow> {
  const codeResult = await db.query<ReferralCodeRow>(
    `SELECT * FROM referral_codes WHERE code = $1`,
    [code.toUpperCase()],
  );
  if (codeResult.rows.length === 0) throw createAppError('Invalid referral code.', 404);
  const rc = codeResult.rows[0]!;

  if (!rc.is_active) throw createAppError('This referral code is no longer active.', 409);
  if (rc.expires_at && new Date(rc.expires_at) < new Date()) {
    throw createAppError('This referral code has expired.', 409);
  }
  if (rc.max_uses && rc.uses_count >= rc.max_uses) {
    throw createAppError('This referral code has reached its maximum uses.', 409);
  }
  if (rc.user_id === refereeId) {
    throw createAppError('You cannot use your own referral code.', 400);
  }

  const existingRedemption = await db.query<CountRow>(
    `SELECT COUNT(*)::text as count FROM referral_redemptions WHERE referee_id = $1`,
    [refereeId],
  );
  if (Number(existingRedemption.rows[0]?.count ?? 0) > 0) {
    throw createAppError('You have already used a referral code.', 409);
  }

  return db.transaction(async (client) => {
    const result = await client.query<RedemptionRow>(
      `INSERT INTO referral_redemptions (referral_code_id, referrer_id, referee_id, referrer_bonus, referee_bonus)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [rc.id, rc.user_id, refereeId, Number(rc.referrer_bonus), Number(rc.referee_bonus)],
    );

    await client.query(
      `UPDATE referral_codes SET uses_count = uses_count + 1 WHERE id = $1`,
      [rc.id],
    );

    const refereeWallet = await walletService.getUserWallet(refereeId, 'customer');
    await client.query(
      `UPDATE wallets SET available_balance = available_balance + $1, updated_at = NOW() WHERE id = $2`,
      [Number(rc.referee_bonus), refereeWallet.id],
    );
    await client.query(
      `INSERT INTO wallet_transactions (wallet_id, type, amount, balance_after, description, reference_id)
       VALUES ($1, 'payment', $2, (SELECT available_balance FROM wallets WHERE id = $1), 'Referral signup bonus', $3)`,
      [refereeWallet.id, Number(rc.referee_bonus), result.rows[0]!.id],
    );
    await client.query(
      `UPDATE referral_redemptions SET referee_credited = TRUE WHERE id = $1`,
      [result.rows[0]!.id],
    );

    await client.query(
      `INSERT INTO notifications (user_id, type, title, body, data)
       VALUES ($1, 'referral', 'Welcome Bonus!', $2, $3)`,
      [
        refereeId,
        `You received ${formatPHP(Number(rc.referee_bonus))} as a signup bonus from a referral!`,
        JSON.stringify({ referralCodeId: rc.id, bonus: Number(rc.referee_bonus) }),
      ],
    );

    logger.info('Referral code redeemed', { refereeId, code: rc.code, referrerId: rc.user_id });
    return result.rows[0]!;
  });
}

export async function creditReferrerAfterBooking(bookingId: string, customerId: string): Promise<void> {
  const redemption = await db.query<RedemptionRow>(
    `SELECT * FROM referral_redemptions
     WHERE referee_id = $1 AND referrer_credited = FALSE AND qualifying_booking_id IS NULL`,
    [customerId],
  );
  if (redemption.rows.length === 0) return;
  const rd = redemption.rows[0]!;

  const referrerWallet = await walletService.getUserWallet(rd.referrer_id, 'customer');

  await db.transaction(async (client) => {
    await client.query(
      `UPDATE wallets SET available_balance = available_balance + $1, updated_at = NOW() WHERE id = $2`,
      [Number(rd.referrer_bonus), referrerWallet.id],
    );
    await client.query(
      `INSERT INTO wallet_transactions (wallet_id, booking_id, type, amount, balance_after, description, reference_id)
       VALUES ($1, $2, 'payment', $3, (SELECT available_balance FROM wallets WHERE id = $1), 'Referral bonus — friend completed first booking', $4)`,
      [referrerWallet.id, bookingId, Number(rd.referrer_bonus), rd.id],
    );
    await client.query(
      `UPDATE referral_redemptions SET referrer_credited = TRUE, qualifying_booking_id = $1 WHERE id = $2`,
      [bookingId, rd.id],
    );

    await client.query(
      `INSERT INTO notifications (user_id, type, title, body, data)
       VALUES ($1, 'referral', 'Referral Bonus!', $2, $3)`,
      [
        rd.referrer_id,
        `You earned ${formatPHP(Number(rd.referrer_bonus))} because your friend completed their first booking!`,
        JSON.stringify({ bookingId, bonus: Number(rd.referrer_bonus) }),
      ],
    );
  });

  logger.info('Referrer credited', { referrerId: rd.referrer_id, refereeId: customerId, bookingId });
}

export async function getMyReferrals(
  userId: string,
  page = 1,
  pageSize = 20,
): Promise<{ code: ReferralCodeRow | null; redemptions: RedemptionRow[]; total: number }> {
  const code = await db.query<ReferralCodeRow>(
    `SELECT * FROM referral_codes WHERE user_id = $1 AND type = 'standard' AND is_active = TRUE`,
    [userId],
  );

  if (code.rows.length === 0) {
    return { code: null, redemptions: [], total: 0 };
  }

  const offset = (page - 1) * pageSize;
  const [countResult, dataResult] = await Promise.all([
    db.query<CountRow>(
      `SELECT COUNT(*)::text as count FROM referral_redemptions WHERE referrer_id = $1`,
      [userId],
    ),
    db.query<RedemptionRow>(
      `SELECT * FROM referral_redemptions WHERE referrer_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [userId, pageSize, offset],
    ),
  ]);

  return {
    code: code.rows[0]!,
    redemptions: dataResult.rows,
    total: Number(countResult.rows[0]?.count ?? 0),
  };
}

export function formatReferralCode(c: ReferralCodeRow): Record<string, unknown> {
  return {
    id: c.id,
    code: c.code,
    type: c.type,
    usesCount: c.uses_count,
    maxUses: c.max_uses,
    referrerBonus: Number(c.referrer_bonus),
    refereeBonus: Number(c.referee_bonus),
    isActive: c.is_active,
    expiresAt: c.expires_at,
    createdAt: c.created_at,
  };
}

export function formatRedemption(r: RedemptionRow): Record<string, unknown> {
  return {
    id: r.id,
    referrerId: r.referrer_id,
    refereeId: r.referee_id,
    referrerBonus: Number(r.referrer_bonus),
    refereeBonus: Number(r.referee_bonus),
    referrerCredited: r.referrer_credited,
    refereeCredited: r.referee_credited,
    qualifyingBookingId: r.qualifying_booking_id,
    createdAt: r.created_at,
  };
}
