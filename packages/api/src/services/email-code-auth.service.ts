import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { db } from '../models/db';
import { platformConfig } from '../config/platform.config';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import { createTokenPairInTransaction, type CredentialContext } from './auth.service';
import { isEmailCodeDeliveryConfigured, sendEmailCodeMessage } from './email-code-delivery.service';
import { buildEmailCodeMessage, type EmailCodePurpose } from './email-code-message';
import { checkDomainAcceptsMail } from './email-domain-check.service';

/**
 * D37 (Ken, 2026-10-11): emailed sign-in codes replace phone codes while the
 * Philippine carriers will not deliver our SMS.
 *
 * - A code is valid for exactly platformConfig.emailCode.validForMs from the
 *   moment it is created. Every expiry decision is made inside PostgreSQL
 *   against clock_timestamp() (microseconds), never with JavaScript Dates.
 * - Asking again for the same email inside the window re-sends the SAME code
 *   with the SAME expiry. After the window a new code is created.
 * - The code is never stored. It is HMAC(key, challenge id), where the key is
 *   derived from JWT_SECRET for this purpose only, so a resend can rebuild it.
 * - Marketplace codes find (or, after a "create your account" step, create)
 *   the customer/provider/staff account only once the right code is typed.
 *   Admin-tier accounts are refused here; they use the admin console, whose
 *   optional emailed second step (ADMIN_SECOND_FACTOR=email) uses the same
 *   code rules bound to the admin account.
 *
 * The phone-code sign-in (auth.service.ts sendOtp/verifyOtp) is paused, not
 * removed: PHONE_OTP_SIGN_IN_ENABLED=0 switches it off at the routes.
 */

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Purpose = 'sign_in' | 'admin_sign_in';
const MARKETPLACE_ROLES = ['customer', 'provider', 'provider_staff'];
const ADMIN_ROLES = ['admin', 'super_admin', 'dpo'];

// ---------------------------------------------------------------------------
// Switches
// ---------------------------------------------------------------------------

/** Phone/SMS codes stay on unless the server sets PHONE_OTP_SIGN_IN_ENABLED=0. */
export function isPhoneOtpSignInEnabled(): boolean {
  return process.env.PHONE_OTP_SIGN_IN_ENABLED !== '0';
}

/** Email codes need the switch AND a configured sender. */
export function isEmailCodeSignInEnabled(): boolean {
  return process.env.EMAIL_CODE_SIGN_IN_ENABLED === '1' && isEmailCodeDeliveryConfigured()
    && Boolean(process.env.JWT_SECRET);
}

/**
 * The admin second step. 'email' takes effect only while email delivery is
 * configured; otherwise the stronger authenticator step stays in force, so a
 * mail outage can never lock every admin out or silently drop the factor.
 */
export function adminSecondFactor(): 'totp' | 'email' {
  if (process.env.ADMIN_SECOND_FACTOR !== 'email') return 'totp';
  if (!isEmailCodeDeliveryConfigured() || !process.env.JWT_SECRET) {
    logger.warn('ADMIN_SECOND_FACTOR=email is set but email delivery is not configured; using the authenticator step');
    return 'totp';
  }
  return 'email';
}

export function assertEmailCodeSignInEnabled(): void {
  if (!isEmailCodeSignInEnabled()) {
    const error = createAppError('Email sign-in is not available right now.', 503);
    error.code = 'email_sign_in_unavailable';
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Addresses and codes
// ---------------------------------------------------------------------------

const emailSchema = z.string().trim().min(3).max(254).email().regex(/^[\x21-\x7e]+$/);

export interface NormalizedEmail { address: string; key: string; domain: string; hash: string }

export function normalizeEmail(raw: unknown): NormalizedEmail {
  const parsed = emailSchema.safeParse(raw);
  if (!parsed.success) {
    const error = createAppError('Enter a valid email address.', 400);
    error.code = 'email_invalid';
    throw error;
  }
  const address = parsed.data;
  const key = address.toLowerCase();
  return { address, key, domain: key.slice(key.lastIndexOf('@') + 1), hash: recipientHash(key) };
}

export function recipientHash(key: string): string {
  return crypto.createHash('sha256').update(key.toLowerCase()).digest('hex');
}

function codeKey(): Buffer {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw createAppError('Server configuration error.', 500);
  return Buffer.from(crypto.hkdfSync('sha256', secret, 'onservice-email-code', 'd37-v1', 32));
}

/** The six-digit code for a challenge. Deterministic, so a resend repeats it. */
export function deriveEmailCode(challengeId: string): string {
  const mac = crypto.createHmac('sha256', codeKey()).update(`email-code:${challengeId}`).digest();
  return (mac.readUIntBE(0, 6) % 1_000_000).toString().padStart(6, '0');
}

function codeMatches(challengeId: string, typed: string): boolean {
  const expected = Buffer.from(deriveEmailCode(challengeId));
  const actual = Buffer.from(typed);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function appError(message: string, status: number, code: string, extra: Record<string, unknown> = {}): Error {
  const error = createAppError(message, status);
  error.code = code;
  // Read by the email-code routes only (retryAfterMs, remainingAttempts).
  Object.assign(error, { clientDetails: extra });
  return error;
}

// ---------------------------------------------------------------------------
// Sending (new code or same-code resend)
// ---------------------------------------------------------------------------

export interface EmailCodeReceipt {
  challengeId: string;
  /** Milliseconds left on the code, measured by the database clock. */
  expiresInMs: number;
  /** Milliseconds until the resend button may be used again. */
  resendInMs: number;
  /** true when this was a resend of the same code. */
  resent: boolean;
  /** 'accepted' or 'unknown' (the provider may still deliver it). */
  delivery: 'accepted' | 'unknown';
}

interface Reservation {
  id: string; sendNumber: number; expiresAt: Date; expiresInMs: number; resent: boolean;
  /** last_sent_at before this resend, to undo it if the provider refuses. */
  previousSentAt: Date | null;
}

async function reserveSend(client: Transaction, input: {
  purpose: Purpose; hash: string; ip: string; userId: string | null; sessionVersion: number | null;
}): Promise<Reservation> {
  const cfg = platformConfig.emailCode;
  // One writer per recipient and purpose at a time.
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
    [`email-code/${input.purpose}/${input.hash}`]);
  // A pending code whose window has passed is finished, so a new one may start.
  await client.query(
    `UPDATE email_code_challenges SET state = 'expired', finished_at = clock_timestamp()
      WHERE purpose = $1 AND recipient_hash = $2 AND state = 'pending' AND expires_at <= clock_timestamp()`,
    [input.purpose, input.hash],
  );
  // An admin code belongs to one account generation. A changed account or a
  // revoked generation must not inherit a code sent before the change.
  if (input.purpose === 'admin_sign_in') {
    await client.query(
      `UPDATE email_code_challenges SET state = 'invalidated', finished_at = clock_timestamp()
        WHERE purpose = 'admin_sign_in' AND recipient_hash = $1 AND state = 'pending'
          AND (user_id IS DISTINCT FROM $2 OR session_version IS DISTINCT FROM $3)`,
      [input.hash, input.userId, input.sessionVersion],
    );
  }

  const pending = (await client.query<{
    id: string; sends: number; expires_at: Date; last_sent_at: Date | null; expires_in_ms: string; resend_in_ms: string;
  }>(
    `SELECT id, sends, expires_at, last_sent_at,
            floor(extract(epoch FROM (expires_at - clock_timestamp())) * 1000)::bigint AS expires_in_ms,
            GREATEST(0, ceil(extract(epoch FROM (last_sent_at + $3 * INTERVAL '1 millisecond'
              - clock_timestamp())) * 1000))::bigint AS resend_in_ms
       FROM email_code_challenges
      WHERE purpose = $1 AND recipient_hash = $2 AND state = 'pending'
      FOR UPDATE`,
    [input.purpose, input.hash, cfg.resendCooldownMs],
  )).rows[0];

  if (pending) {
    const resendInMs = Number(pending.resend_in_ms);
    const live = { codePending: true, expiresInMs: Math.max(0, Number(pending.expires_in_ms)) };
    if (resendInMs > 0) {
      throw appError('We just sent you a code. Please wait a moment before asking again.', 429,
        'email_code_resend_too_soon', { retryAfterMs: resendInMs, ...live });
    }
    if (pending.sends >= cfg.maxSendsPerCode) {
      throw appError('We already sent this code several times. Check your spam or junk folder, or wait for it to expire and ask for a new one.',
        429, 'email_code_send_limit', { retryAfterMs: live.expiresInMs, ...live });
    }
    const updated = (await client.query<{ sends: number }>(
      `UPDATE email_code_challenges SET sends = sends + 1, last_sent_at = clock_timestamp(), last_delivery = NULL
        WHERE id = $1 RETURNING sends`, [pending.id],
    )).rows[0]!;
    return { id: pending.id, sendNumber: updated.sends, expiresAt: pending.expires_at,
      expiresInMs: Number(pending.expires_in_ms), resent: true, previousSentAt: pending.last_sent_at };
  }

  const caps = (await client.query<{ recipient_count: number; ip_count: number; recipient_wait_ms: string; ip_wait_ms: string }>(
    `SELECT count(*) FILTER (WHERE recipient_hash = $1)::int AS recipient_count,
            count(*) FILTER (WHERE request_ip = $2::inet)::int AS ip_count,
            COALESCE(ceil(extract(epoch FROM (min(created_at) FILTER (WHERE recipient_hash = $1)
              + INTERVAL '1 hour' - clock_timestamp())) * 1000), 0)::bigint AS recipient_wait_ms,
            COALESCE(ceil(extract(epoch FROM (min(created_at) FILTER (WHERE request_ip = $2::inet)
              + INTERVAL '1 hour' - clock_timestamp())) * 1000), 0)::bigint AS ip_wait_ms
       FROM email_code_challenges
      WHERE created_at > clock_timestamp() - INTERVAL '1 hour'
        AND purpose = $3
        AND (recipient_hash = $1 OR request_ip = $2::inet)
        AND NOT (state = 'invalidated' AND sends = 1 AND last_delivery IN ('rejected', 'unavailable'))`,
    [input.hash, input.ip, input.purpose],
  )).rows[0]!;
  if (caps.recipient_count >= cfg.newCodesPerEmailPerHour) {
    throw appError('Too many codes were requested for this email. Please try again later.', 429,
      'email_code_hourly_limit', { retryAfterMs: Number(caps.recipient_wait_ms) });
  }
  if (caps.ip_count >= cfg.newCodesPerIpPerHour) {
    throw appError('Too many sign-in codes were requested from this network. Please try again later.', 429,
      'email_code_network_limit', { retryAfterMs: Number(caps.ip_wait_ms) });
  }

  const id = crypto.randomUUID();
  const created = (await client.query<{ expires_at: Date; expires_in_ms: string }>(
    `INSERT INTO email_code_challenges
       (id, purpose, recipient_hash, user_id, session_version, request_ip, max_attempts, sends,
        last_sent_at, created_at, expires_at)
     SELECT $1, $2, $3, $4, $5, $6::inet, $7, 1, t.now, t.now, t.now + $8 * INTERVAL '1 millisecond'
       FROM (SELECT clock_timestamp() AS now) t
     RETURNING expires_at,
       floor(extract(epoch FROM (expires_at - clock_timestamp())) * 1000)::bigint AS expires_in_ms`,
    [id, input.purpose, input.hash, input.userId, input.sessionVersion, input.ip, cfg.maxAttempts, cfg.validForMs],
  )).rows[0]!;
  return { id, sendNumber: 1, expiresAt: created.expires_at, expiresInMs: Number(created.expires_in_ms), resent: false,
    previousSentAt: null };
}

async function issueCode(input: {
  purpose: Purpose; email: NormalizedEmail; ip: string; userId: string | null; sessionVersion: number | null;
}): Promise<EmailCodeReceipt> {
  if (await checkDomainAcceptsMail(input.email.domain) === 'no_mail') {
    throw appError("We can't send email to this address. Please check it for typos.", 400, 'email_domain_cannot_receive');
  }
  const reservedAt = Date.now();
  const reservation = await db.transaction(client => reserveSend(client, {
    purpose: input.purpose, hash: input.email.hash, ip: input.ip,
    userId: input.userId, sessionVersion: input.sessionVersion,
  }));

  const messagePurpose: EmailCodePurpose = input.purpose === 'admin_sign_in' ? 'admin_sign_in' : 'sign_in';
  const message = buildEmailCodeMessage({
    code: deriveEmailCode(reservation.id), purpose: messagePurpose, expiresAt: reservation.expiresAt,
    validMinutes: Math.round(platformConfig.emailCode.validForMs / 60_000),
    // A configured reply address means replies are read; otherwise say so.
    replyMonitored: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((process.env.EMAIL_REPLY_TO ?? '').trim()),
  });
  const send = async (): Promise<Awaited<ReturnType<typeof sendEmailCodeMessage>>> => {
    try {
      return await sendEmailCodeMessage({
        idempotencyKey: `onservice-email-code/${reservation.id}/${reservation.sendNumber}`,
        to: input.email.address, expiresAt: reservation.expiresAt, message,
      });
    } catch {
      // e.g. the window closed while waiting. Nothing was sent.
      return { status: 'rejected', providerStatus: 0 };
    }
  };
  let outcome = await send();
  // The provider refused only because of its own rate limit: nothing was
  // processed, so the identical request (same key) is safe to try once more.
  if (outcome.status === 'rejected' && outcome.providerStatus === 429) {
    await new Promise(resolve => setTimeout(resolve, 1200));
    outcome = await send();
  }

  await db.query('UPDATE email_code_challenges SET last_delivery = $2 WHERE id = $1',
    [reservation.id, outcome.status]).catch(() => {
    logger.warn('Email code delivery outcome could not be recorded');
  });

  if (outcome.status === 'rejected' || outcome.status === 'unavailable') {
    // Definitely not sent. A brand-new code that never left is withdrawn (and
    // no longer counts toward the hourly caps) so the person can simply try
    // again. A refused resend is undone: the send count and the 30-second
    // pause go back to what the last real send left.
    if (!reservation.resent) {
      await db.query(
        `UPDATE email_code_challenges SET state = 'invalidated', finished_at = clock_timestamp()
          WHERE id = $1 AND state = 'pending'`, [reservation.id],
      ).catch(() => logger.warn('Unsent email code could not be withdrawn'));
    } else {
      await db.query(
        `UPDATE email_code_challenges SET sends = sends - 1, last_sent_at = $3
          WHERE id = $1 AND sends = $2`, [reservation.id, reservation.sendNumber, reservation.previousSentAt],
      ).catch(() => logger.warn('Unsent resend could not be undone'));
    }
    logger.warn('Email code was not sent', { outcome: outcome.status, purpose: input.purpose });
    throw outcome.status === 'unavailable'
      ? appError('Email sign-in is not available right now.', 503, 'email_sign_in_unavailable')
      : appError("We couldn't send the email just now. Please check the address and try again in a minute.",
        503, 'email_code_not_sent');
  }

  const elapsed = Date.now() - reservedAt;
  return {
    challengeId: reservation.id,
    expiresInMs: Math.max(0, reservation.expiresInMs - elapsed),
    resendInMs: platformConfig.emailCode.resendCooldownMs,
    resent: reservation.resent,
    delivery: outcome.status,
  };
}

/** Marketplace (customer/provider/staff) sign-in or sign-up code. */
export async function requestMarketplaceEmailCode(rawEmail: unknown, ip: string): Promise<EmailCodeReceipt> {
  assertEmailCodeSignInEnabled();
  return issueCode({ purpose: 'sign_in', email: normalizeEmail(rawEmail), ip, userId: null, sessionVersion: null });
}

/** Admin second step: the code goes to the admin account's own email. */
export async function requestAdminEmailCode(
  admin: { id: string; email: string | null; sessionVersion: number }, ip: string,
): Promise<EmailCodeReceipt> {
  if (adminSecondFactor() !== 'email') throw appError('Email verification is not enabled for admin sign-in.', 409, 'admin_email_code_disabled');
  if (!admin.email) throw appError('This admin account has no email address. Contact a super admin.', 409, 'admin_email_missing');
  return issueCode({ purpose: 'admin_sign_in', email: normalizeEmail(admin.email), ip,
    userId: admin.id, sessionVersion: admin.sessionVersion });
}

// ---------------------------------------------------------------------------
// Checking a typed code
// ---------------------------------------------------------------------------

type CodeOutcome =
  | { kind: 'ok'; challengeId: string }
  | { kind: 'none' }
  | { kind: 'expired' }
  | { kind: 'mismatch'; remaining: number };

/**
 * Lock the pending code for this recipient and judge the typed digits. The
 * expiry test is `expires_at > clock_timestamp()` at this moment, inside the
 * database. A wrong guess is counted and committed by the caller's
 * transaction (outcomes are returned, not thrown, so the count survives).
 */
async function judgeCode(client: Transaction, purpose: Purpose, hash: string, code: string,
  binding?: { userId: string; sessionVersion: number }): Promise<CodeOutcome> {
  const locked = (await client.query<{
    id: string; attempts: number; max_attempts: number;
    user_id: string | null; session_version: number | null;
  }>(
    `SELECT id, attempts, max_attempts, user_id, session_version
       FROM email_code_challenges
      WHERE purpose = $1 AND recipient_hash = $2 AND state = 'pending'
      FOR UPDATE`,
    [purpose, hash],
  )).rows[0];
  if (!locked) return { kind: 'none' };
  // The moment of judgement: the database clock, read after the lock is held.
  const row = { ...locked, live: (await client.query<{ live: boolean }>(
    'SELECT expires_at > clock_timestamp() AS live FROM email_code_challenges WHERE id = $1', [locked.id],
  )).rows[0]!.live };
  if (binding && (row.user_id !== binding.userId || row.session_version !== binding.sessionVersion)) {
    await finish(client, row.id, 'invalidated');
    return { kind: 'none' };
  }
  if (!row.live) {
    await finish(client, row.id, 'expired');
    return { kind: 'expired' };
  }
  if (row.attempts >= row.max_attempts) {
    await finish(client, row.id, 'invalidated');
    return { kind: 'mismatch', remaining: 0 };
  }
  if (!/^\d{6}$/.test(code) || !codeMatches(row.id, code)) {
    const attempts = row.attempts + 1;
    await client.query('UPDATE email_code_challenges SET attempts = $2 WHERE id = $1', [row.id, attempts]);
    if (attempts >= row.max_attempts) await finish(client, row.id, 'invalidated');
    return { kind: 'mismatch', remaining: row.max_attempts - attempts };
  }
  await finish(client, row.id, 'consumed');
  return { kind: 'ok', challengeId: row.id };
}

async function finish(client: Transaction, id: string, state: 'consumed' | 'expired' | 'invalidated'): Promise<void> {
  await client.query(
    `UPDATE email_code_challenges SET state = $2, finished_at = clock_timestamp()
      WHERE id = $1 AND state = 'pending'`, [id, state],
  );
}

function codeFailure(outcome: Exclude<CodeOutcome, { kind: 'ok' }>): Error {
  if (outcome.kind === 'none') {
    return appError('There is no active code for this email. Please ask for a new code.', 400, 'email_code_not_found');
  }
  if (outcome.kind === 'expired') {
    return appError('This code has expired. Please ask for a new code.', 400, 'email_code_expired');
  }
  if (outcome.remaining <= 0) {
    return appError('Too many incorrect tries. Please ask for a new code.', 429, 'email_code_attempts_exhausted');
  }
  return appError(`Incorrect code. ${outcome.remaining} ${outcome.remaining === 1 ? 'try' : 'tries'} left.`, 400,
    'email_code_incorrect', { remainingAttempts: outcome.remaining });
}

export interface EmailSignInUser {
  id: string; phone: string; email: string | null; first_name: string; last_name: string;
  role: string; avatar_url: string | null; is_verified: boolean; is_active: boolean; session_version: number | string;
}

export type MarketplaceVerifyResult =
  | { status: 'signed_in'; accessToken: string; refreshToken: string; user: EmailSignInUser; isNewUser: boolean }
  | { status: 'needs_account'; signupToken: string; email: string };

/**
 * Check a marketplace code. An existing customer/provider/staff account with
 * this email (any letter case) is signed in. An unknown email gets a
 * short-lived sign-up token for the "create your account" step; no account
 * exists until that step supplies a name and a mobile number.
 */
export async function verifyMarketplaceEmailCode(
  rawEmail: unknown, code: string, context: CredentialContext,
): Promise<MarketplaceVerifyResult> {
  assertEmailCodeSignInEnabled();
  const email = normalizeEmail(rawEmail);
  type Outcome = Exclude<CodeOutcome, { kind: 'ok' }> | { kind: 'privileged' } | { kind: 'inactive' }
    | { kind: 'signed_in'; tokens: { accessToken: string; refreshToken: string }; user: EmailSignInUser; isNewUser: boolean }
    | { kind: 'needs_account'; challengeId: string };

  const outcome = await db.transaction<Outcome>(async client => {
    const judged = await judgeCode(client, 'sign_in', email.hash, code);
    if (judged.kind !== 'ok') return judged;
    const account = (await client.query<EmailSignInUser & { email_verified_at: Date | null }>(
      'SELECT * FROM users WHERE lower(email) = $1 FOR NO KEY UPDATE', [email.key],
    )).rows[0];
    if (!account) return { kind: 'needs_account', challengeId: judged.challengeId };
    if (!MARKETPLACE_ROLES.includes(account.role)) return { kind: 'privileged' };
    if (!account.is_active) return { kind: 'inactive' };
    await client.query(
      `UPDATE users SET is_verified = TRUE, last_login_at = clock_timestamp(), updated_at = clock_timestamp(),
              email_verified_at = COALESCE(email_verified_at, clock_timestamp())
        WHERE id = $1`, [account.id],
    );
    const tokens = await createTokenPairInTransaction(client, account.id, account.role,
      Number(account.session_version), context);
    await client.query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, new_values)
       VALUES ($1, 'email_code_sign_in', 'users', $1, $2::jsonb)`,
      [account.id, JSON.stringify({ method: 'email_code', challengeId: judged.challengeId })],
    );
    return { kind: 'signed_in', tokens, user: account, isNewUser: false };
  });

  switch (outcome.kind) {
    case 'signed_in':
      return { status: 'signed_in', ...outcome.tokens, user: outcome.user, isNewUser: outcome.isNewUser };
    case 'needs_account':
      return { status: 'needs_account', email: email.address,
        signupToken: signSignupToken(email, outcome.challengeId) };
    case 'privileged':
      throw appError('This email belongs to an onService admin account. Please sign in from the admin console.',
        403, 'email_sign_in_not_allowed');
    case 'inactive':
      throw appError('Your account has been deactivated. Contact support.', 403, 'account_deactivated');
    default:
      throw codeFailure(outcome);
  }
}

/** Admin second step. Its own transaction, so a wrong guess is counted even
 * though the caller then refuses; the caller issues the session afterwards
 * under its own account lock and revocation checks. */
export async function verifyAdminEmailCode(
  admin: { id: string; email: string | null; sessionVersion: number }, code: string,
): Promise<void> {
  if (adminSecondFactor() !== 'email') {
    throw appError('Email verification is not enabled for admin sign-in. Please sign in again.', 409, 'admin_email_code_disabled');
  }
  if (!admin.email) throw appError('This admin account has no email address. Contact a super admin.', 409, 'admin_email_missing');
  const email = normalizeEmail(admin.email);
  const outcome = await db.transaction(client => judgeCode(client, 'admin_sign_in', email.hash, code,
    { userId: admin.id, sessionVersion: admin.sessionVersion }));
  if (outcome.kind !== 'ok') throw codeFailure(outcome);
}

/** login_attempts identifier for an email: a digest, never the address. */
export function emailAttemptKey(hash: string): string {
  return `email:${hash}`;
}

/** Refuse more code checks from a network that made too many wrong guesses this hour. */
export async function assertEmailGuessAllowance(ip: string): Promise<void> {
  const row = (await db.query<{ wrong: number; wait_ms: string }>(
    `SELECT count(*)::int AS wrong,
            COALESCE(ceil(extract(epoch FROM (min(created_at) + INTERVAL '1 hour' - now())) * 1000), 0)::bigint AS wait_ms
       FROM login_attempts
      WHERE attempt_type = 'otp_verify' AND success = FALSE AND phone LIKE 'email:%'
        AND ip_address = $1::inet AND created_at > now() - INTERVAL '1 hour'`,
    [ip],
  )).rows[0]!;
  if (row.wrong >= platformConfig.emailCode.wrongGuessesPerIpPerHour) {
    throw appError('Too many incorrect codes from this network. Please try again later.', 429,
      'email_code_network_guess_limit', { retryAfterMs: Math.max(1000, Number(row.wait_ms)) });
  }
}

export const WRONG_GUESS_CODES = new Set(['email_code_incorrect', 'email_code_attempts_exhausted']);

// ---------------------------------------------------------------------------
// "Create your account" step for a new email
// ---------------------------------------------------------------------------

interface SignupClaims { type: 'email_signup'; email: string; emailKey: string; challengeId: string }

function signSignupToken(email: NormalizedEmail, challengeId: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw createAppError('Server configuration error.', 500);
  const claims: SignupClaims = { type: 'email_signup', email: email.address, emailKey: email.key, challengeId };
  return jwt.sign(claims, secret, { algorithm: 'HS256', expiresIn: platformConfig.emailCode.signupTokenSeconds });
}

const signupSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phone: z.string().regex(/^\+63\d{10}$/),
}).strict();

export async function completeEmailSignup(
  signupToken: string, profile: { firstName: string; lastName: string; phone: string }, context: CredentialContext,
): Promise<{ accessToken: string; refreshToken: string; user: EmailSignInUser; isNewUser: true }> {
  assertEmailCodeSignInEnabled();
  const secret = process.env.JWT_SECRET;
  if (!secret) throw createAppError('Server configuration error.', 500);
  let claims: SignupClaims;
  try {
    const decoded = jwt.verify(signupToken, secret, { algorithms: ['HS256'] }) as Partial<SignupClaims>;
    if (decoded.type !== 'email_signup' || typeof decoded.email !== 'string' || typeof decoded.emailKey !== 'string'
        || typeof decoded.challengeId !== 'string' || decoded.email.toLowerCase() !== decoded.emailKey) {
      throw new Error('wrong token');
    }
    claims = decoded as SignupClaims;
  } catch {
    throw appError('Your sign-up step timed out. Please ask for a new code to continue.', 401, 'signup_session_expired');
  }
  const parsed = signupSchema.safeParse(profile);
  if (!parsed.success) {
    throw appError('Enter your first name, last name and a Philippine mobile number (+63 9XX XXX XXXX).', 400, 'signup_details_invalid');
  }
  const email = normalizeEmail(claims.email);

  try {
    return await db.transaction(async client => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`email-signup/${email.hash}`]);
      // The token must come from a consumed code for this very address.
      const proof = (await client.query<{ id: string }>(
        `SELECT id FROM email_code_challenges
          WHERE id = $1 AND purpose = 'sign_in' AND recipient_hash = $2 AND state = 'consumed'`,
        [claims.challengeId, email.hash],
      )).rows[0];
      if (!proof) throw appError('Your sign-up step timed out. Please ask for a new code to continue.', 401, 'signup_session_expired');
      if ((await client.query('SELECT 1 FROM users WHERE lower(email) = $1', [email.key])).rowCount) {
        throw appError('An account with this email already exists. Please sign in instead.', 409, 'email_already_registered');
      }
      if ((await client.query('SELECT 1 FROM users WHERE phone = $1', [parsed.data.phone])).rowCount) {
        throw appError('This mobile number is already registered to another account. Use a different number, or contact support.',
          409, 'phone_already_registered');
      }
      // phone_verified_at stays NULL: the number was typed, not proven by SMS.
      const user = (await client.query<EmailSignInUser>(
        `INSERT INTO users (phone, email, first_name, last_name, is_verified, email_verified_at,
                            phone_verified_at, last_login_at)
         VALUES ($1, $2, $3, $4, TRUE, clock_timestamp(), NULL, clock_timestamp())
         RETURNING *`,
        [parsed.data.phone, email.address, parsed.data.firstName, parsed.data.lastName],
      )).rows[0]!;
      const tokens = await createTokenPairInTransaction(client, user.id, user.role, Number(user.session_version), context);
      await client.query(
        `INSERT INTO audit_log (user_id, action, entity_type, entity_id, new_values)
         VALUES ($1, 'email_code_sign_up', 'users', $1, $2::jsonb)`,
        [user.id, JSON.stringify({ method: 'email_code', challengeId: claims.challengeId })],
      );
      return { ...tokens, user, isNewUser: true as const };
    });
  } catch (error) {
    // A concurrent sign-up can still win the unique index after our checks.
    if ((error as { code?: string }).code === '23505') {
      const constraint = String((error as { constraint?: string }).constraint ?? '');
      throw constraint.includes('phone')
        ? appError('This mobile number is already registered to another account. Use a different number, or contact support.',
          409, 'phone_already_registered')
        : appError('An account with this email already exists. Please sign in instead.', 409, 'email_already_registered');
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Housekeeping
// ---------------------------------------------------------------------------

/** Close codes whose window passed and drop finished rows past retention. */
export async function cleanupEmailCodeChallenges(limit = 200): Promise<{ expired: number; deleted: number }> {
  const expired = await db.query(
    `UPDATE email_code_challenges SET state = 'expired', finished_at = clock_timestamp()
      WHERE id IN (SELECT id FROM email_code_challenges
                    WHERE state = 'pending' AND expires_at <= clock_timestamp()
                    ORDER BY expires_at LIMIT $1 FOR UPDATE SKIP LOCKED)`, [limit],
  );
  const deleted = await db.query(
    `DELETE FROM email_code_challenges
      WHERE id IN (SELECT id FROM email_code_challenges
                    WHERE state <> 'pending' AND created_at < clock_timestamp() - $2 * INTERVAL '1 day'
                    ORDER BY created_at LIMIT $1 FOR UPDATE SKIP LOCKED)`,
    [limit, platformConfig.emailCode.retentionDays],
  );
  return { expired: expired.rowCount ?? 0, deleted: deleted.rowCount ?? 0 };
}

export { ADMIN_ROLES as EMAIL_CODE_ADMIN_ROLES };
