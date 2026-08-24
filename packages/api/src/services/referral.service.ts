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

  // MED-N148 fix — INSERT ... ON CONFLICT DO NOTHING in a retry loop
  // instead of SELECT-then-INSERT. Pre-fix the dup-check + INSERT had
  // a race window: two simultaneous getOrCreateReferralCode calls for
  // different users could both see "code free" and both INSERT, with
  // the unique constraint catching one (raising a raw 23505 error to
  // the second caller). Post-fix: each attempt INSERTs with ON
  // CONFLICT (code) DO NOTHING; if RETURNING is empty we generated a
  // colliding code (vanishingly rare with 32^8 = ~10^12 keyspace) and
  // retry. Caps at 10 attempts to avoid runaway loops.
  let attempts = 0;
  while (attempts < 10) {
    const code = generateCode();
    const result = await db.query<ReferralCodeRow>(
      `INSERT INTO referral_codes (user_id, code, type)
       VALUES ($1, $2, 'standard')
       ON CONFLICT (code) DO NOTHING
       RETURNING *`,
      [userId, code],
    );
    if (result.rows.length > 0) {
      logger.info('Referral code created', { userId, code });
      return result.rows[0]!;
    }
    attempts++;
  }

  throw createAppError('Could not generate unique referral code. Try again.', 500);
}

export async function redeemReferralCode(
  refereeId: string,
  code: string,
): Promise<RedemptionRow> {
  // MED-N149 fix — pull all pre-checks inside the trx with FOR UPDATE
  // on the referral_codes row + the existing-redemption check. Pre-fix
  // the SELECT * + COUNT for "have you redeemed before" both ran
  // outside the trx; two simultaneous redemptions by the same referee
  // could both pass the COUNT check and both INSERT (the unique
  // constraint on referee_id would catch one but a raw 23505 error
  // surfaced). Also locks the referral_codes row to serialize the
  // uses_count increment so max_uses isn't violated under concurrency.
  return db.transaction(async (client) => {
    const codeResult = await client.query<ReferralCodeRow>(
      `SELECT * FROM referral_codes WHERE code = $1 FOR UPDATE`,
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

    const existingRedemption = await client.query<CountRow>(
      `SELECT COUNT(*)::text as count FROM referral_redemptions WHERE referee_id = $1`,
      [refereeId],
    );
    if (Number(existingRedemption.rows[0]?.count ?? 0) > 0) {
      throw createAppError('You have already used a referral code.', 409);
    }

    let result;
    try {
      result = await client.query<RedemptionRow>(
        `INSERT INTO referral_redemptions (referral_code_id, referrer_id, referee_id, referrer_bonus, referee_bonus)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [rc.id, rc.user_id, refereeId, Number(rc.referrer_bonus), Number(rc.referee_bonus)],
      );
    } catch (err) {
      // Defense in depth — friendly 409 if a unique-violation slips through.
      if ((err as { code?: string }).code === '23505') {
        throw createAppError('You have already used a referral code.', 409);
      }
      throw err;
    }

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
): Promise<{
  code: ReferralCodeRow | null;
  redemptions: RedemptionRow[];
  total: number;
  summary: { totalReferrals: number; creditedReferrals: number; pendingReferrals: number; totalEarned: number };
}> {
  const code = await db.query<ReferralCodeRow>(
    `SELECT * FROM referral_codes
      WHERE user_id = $1 AND type = 'standard'
      ORDER BY is_active DESC, created_at DESC
      LIMIT 1`,
    [userId],
  );

  if (code.rows.length === 0) {
    return {
      code: null,
      redemptions: [],
      total: 0,
      summary: { totalReferrals: 0, creditedReferrals: 0, pendingReferrals: 0, totalEarned: 0 },
    };
  }

  const offset = (page - 1) * pageSize;
  const [summaryResult, dataResult] = await Promise.all([
    db.query<{
      total_referrals: string;
      credited_referrals: string;
      pending_referrals: string;
      total_earned: string;
    }>(
      `SELECT COUNT(*)::text AS total_referrals,
              COUNT(*) FILTER (WHERE referrer_credited = TRUE)::text AS credited_referrals,
              COUNT(*) FILTER (WHERE referrer_credited = FALSE)::text AS pending_referrals,
              COALESCE(SUM(referrer_bonus) FILTER (WHERE referrer_credited = TRUE), 0)::text AS total_earned
         FROM referral_redemptions
        WHERE referrer_id = $1`,
      [userId],
    ),
    db.query<RedemptionRow>(
      `SELECT * FROM referral_redemptions WHERE referrer_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [userId, pageSize, offset],
    ),
  ]);

  const summaryRow = summaryResult.rows[0];
  const summary = {
    totalReferrals: Number(summaryRow?.total_referrals ?? 0),
    creditedReferrals: Number(summaryRow?.credited_referrals ?? 0),
    pendingReferrals: Number(summaryRow?.pending_referrals ?? 0),
    totalEarned: Number(summaryRow?.total_earned ?? 0),
  };

  return {
    code: code.rows[0]!,
    redemptions: dataResult.rows,
    total: summary.totalReferrals,
    summary,
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
