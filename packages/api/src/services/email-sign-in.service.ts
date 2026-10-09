import crypto from 'node:crypto';
import { isIP } from 'node:net';
import { z } from 'zod';
import { db } from '../models/db';
import { platformConfig } from '../config/platform.config';
import { createAppError } from '../middleware/error.middleware';
import { createTokenPairInTransaction, SCRYPT_N, SCRYPT_R, SCRYPT_P, SCRYPT_MAXMEM,
  SCRYPT_KEYLEN, type CredentialContext } from './auth.service';
import { isEmailCodeDeliveryConfigured, sendEmailVerificationCode,
  type EmailVerificationDelivery } from './email-code-delivery.service';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
const emailInput = z.string().trim().email().max(254).regex(/^[\x21-\x7e]+$/);
const uuid = z.string().uuid();
const marketplaceRoles = ['customer', 'provider', 'provider_staff'];
const recipientHash = (email: string): string => crypto.createHash('sha256').update(email.toLowerCase()).digest('hex');
interface Account {
  id: string; phone: string; email: string | null; role: string; is_active: boolean;
  is_verified: boolean; session_version: number; first_name: string; last_name: string;
  avatar_url: string | null;
}
interface Proof {
  id: string; purpose: 'sign_in'; recipient_hash: string; user_id: string | null;
  identity_proof_id: string | null; role: string | null; session_version: number | null;
  phone: string | null; code_hash: string | null; attempts: number; max_attempts: number;
  state: 'pending' | 'consumed' | 'invalidated'; expires_at: Date;
}
/** PRIVATE result. Delivery contains a plaintext code for the server-side
 * coordinator only. Never serialize this object, log it or queue its payload.
 * The eventual public response must not reveal delivery presence/account state.
 */
export interface EmailSignInStart {
  id: string; expiresAt: Date; delivery: EmailVerificationDelivery | null;
}
export type EmailSignInResult = { status: 'invalid' } | {
  status: 'signed_in'; accessToken: string; refreshToken: string; isNewUser: false;
  user: { id: string; phone: string; email: string | null; firstName: string;
    lastName: string; role: string; avatarUrl: string | null; isVerified: boolean };
};

function hashInput(proof: Proof, code: string): string {
  return JSON.stringify([proof.id, proof.purpose, proof.recipient_hash, proof.user_id,
    proof.identity_proof_id, proof.role, proof.session_version, proof.phone, code]);
}
function derive(value: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => crypto.scrypt(value, salt, SCRYPT_KEYLEN,
    { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM },
    (error, result) => error ? reject(error) : resolve(result)));
}
async function validCode(proof: Proof, code: string): Promise<boolean> {
  if (!proof.code_hash || !/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(proof.code_hash)) return false;
  const [salt, expected] = proof.code_hash.split(':');
  return crypto.timingSafeEqual(await derive(hashInput(proof, code), salt!), Buffer.from(expected!, 'hex'));
}
const currentTime = async (client: Transaction): Promise<Date> =>
  (await client.query<{ now: Date }>('SELECT clock_timestamp() AS now')).rows[0]!.now;
async function finish(client: Transaction, id: string, state: 'consumed' | 'invalidated'): Promise<void> {
  const result = await client.query(`UPDATE email_sign_in_challenges SET state=$2,code_hash=NULL,
    finished_at=clock_timestamp() WHERE id=$1 AND state='pending'`, [id, state]);
  if (result.rowCount !== 1) throw createAppError('Unable to complete verification.', 500);
}

/** Internal preparation, not a public discovery/send endpoint. Only explicit
 * verified identity ownership is considered. No contact-email fallback, new
 * account, privilege conversion, external send or reusable linking proof.
 */
export async function beginEmailSignIn(
  email: string, requestIp: string, operationId: string = crypto.randomUUID(),
): Promise<EmailSignInStart> {
  const parsed = emailInput.safeParse(email);
  if (!parsed.success || isIP(requestIp) === 0 || !uuid.safeParse(operationId).success) {
    throw createAppError('Invalid verification request.', 400);
  }
  const key = parsed.data.toLowerCase(), recipient = recipientHash(key);
  return db.transaction(async client => {
    const initial = (await client.query<{ user_id: string }>(
      'SELECT user_id FROM sign_in_email_identities WHERE email_key=$1', [key])).rows[0];
    // Account -> recipient/IP -> challenge order, matching linking/lifecycle.
    const account = initial ? (await client.query<Account>(
      'SELECT * FROM users WHERE id=$1 FOR NO KEY UPDATE', [initial.user_id])).rows[0] : undefined;
    const canonicalIp = (await client.query<{ ip: string }>('SELECT host($1::inet) AS ip', [requestIp]))
      .rows[0]!.ip.replace(/^::ffff:(?=\d+\.)/i, '');
    for (const bucket of [`email-sign-in/recipient/${recipient}`, `email-sign-in/ip/${canonicalIp}`].sort()) {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [bucket]);
    }
    const limits = (await client.query<{ recipient_count: number; ip_count: number; cooling: boolean }>(
      `SELECT count(*) FILTER (WHERE recipient_hash=$1)::int AS recipient_count,
         count(*) FILTER (WHERE request_ip=$2::inet)::int AS ip_count,
         COALESCE(bool_or(recipient_hash=$1 AND created_at>clock_timestamp()-($3*INTERVAL '1 second')),FALSE) AS cooling
       FROM email_sign_in_challenges WHERE created_at>clock_timestamp()-INTERVAL '1 hour'
        AND (recipient_hash=$1 OR request_ip=$2::inet)`, [recipient, canonicalIp, platformConfig.otpCooldownSeconds])).rows[0]!;
    if (limits.cooling || Math.max(limits.recipient_count, limits.ip_count) >= platformConfig.emailSignInRequestsPerHour) {
      throw createAppError('Too many verification requests. Please try again later.', 429);
    }
    const identity = account?.is_active && account.is_verified && marketplaceRoles.includes(account.role)
      && /^\+63\d{10}$/.test(account.phone)
      ? (await client.query<{ email: string; proof_id: string }>(
        'SELECT email,proof_id FROM sign_in_email_identities WHERE user_id=$1 AND email_key=$2', [account.id, key])).rows[0]
      : undefined;
    const code = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
    const proof: Proof = { id: operationId, purpose: 'sign_in', recipient_hash: recipient,
      user_id: identity ? account!.id : null, identity_proof_id: identity?.proof_id ?? null,
      role: identity ? account!.role : null, session_version: identity ? account!.session_version : null,
      phone: identity ? account!.phone : null, code_hash: null, attempts: 0,
      max_attempts: platformConfig.otpMaxAttempts, state: 'pending', expires_at: new Date() };
    // Do the same proof derivation for unowned decoys. No timing-equivalence or
    // anonymous HTTP acceptance is claimed merely from this internal primitive.
    const salt = crypto.randomBytes(16).toString('hex');
    proof.code_hash = `${salt}:${(await derive(hashInput(proof, code), salt)).toString('hex')}`;
    await client.query(`UPDATE email_sign_in_challenges SET state='invalidated',code_hash=NULL,
      finished_at=clock_timestamp() WHERE recipient_hash=$1 AND state='pending'`, [recipient]);
    const created = await client.query<{ expires_at: Date }>(
      `INSERT INTO email_sign_in_challenges (id,purpose,recipient_hash,user_id,identity_proof_id,role,
        session_version,phone,request_ip,code_hash,max_attempts,created_at,expires_at)
       SELECT $1,'sign_in',$2,$3,$4,$5,$6,$7,$8::inet,$9,$10,t.now,
          t.now+($11*INTERVAL '1 minute') FROM (SELECT clock_timestamp() AS now) t RETURNING expires_at`,
      [proof.id, recipient, proof.user_id, proof.identity_proof_id, proof.role, proof.session_version,
        proof.phone, canonicalIp, proof.code_hash, proof.max_attempts, platformConfig.otpExpiryMinutes]);
    const expiresAt = created.rows[0]!.expires_at;
    return { id: proof.id, expiresAt, delivery: identity
      ? { deliveryId: proof.id, email: identity.email, code, purpose: 'sign_in', expiresAt } : null };
  });
}

export function assertEmailSignInEnabled(): void {
  if (process.env.EMAIL_SIGN_IN_ENABLED !== '1') {
    throw createAppError('Email sign-in is not available yet.', 503);
  }
}

export function assertEmailSignInDeliveryConfigured(): void {
  assertEmailSignInEnabled();
  if (!isEmailCodeDeliveryConfigured()) {
    throw createAppError('Email sign-in is temporarily unavailable. Please use phone sign-in.', 503);
  }
}

/** PRIVATE coordinator, awaited after the neutral public request receipt.
 * The route, not the caller, allocates operationId. Never return this outcome
 * as account discovery. No plaintext queue, response cache or automatic resend.
 * A crash before preparation/claim may lose this request; after claim it leaves
 * uncertainty. An explicit fresh request obeys cooldown and replaces old proof.
 */
export async function requestEmailSignIn(email: string, requestIp: string, operationId: string): Promise<void> {
  assertEmailSignInDeliveryConfigured();
  const prepared = await beginEmailSignIn(email, requestIp, operationId);
  const delivery = prepared.delivery;
  if (!delivery) return;
  const claimed = await db.transaction(async client => {
    const owner = (await client.query<{ user_id: string | null }>(
      'SELECT user_id FROM email_sign_in_challenges WHERE id=$1', [prepared.id])).rows[0];
    if (!owner?.user_id) return false;
    const account = (await client.query<Account>(
      'SELECT * FROM users WHERE id=$1 FOR NO KEY UPDATE', [owner.user_id])).rows[0];
    const proof = (await client.query<Proof & { delivery_state: string }>(
      'SELECT * FROM email_sign_in_challenges WHERE id=$1 FOR UPDATE', [prepared.id])).rows[0];
    const identity = account ? (await client.query<{ proof_id: string; email_key: string }>(
      'SELECT proof_id,email_key FROM sign_in_email_identities WHERE user_id=$1', [account.id])).rows[0] : undefined;
    if (!proof || proof.state !== 'pending' || proof.delivery_state !== 'not_started') return false;
    if (!account?.is_active || !account.is_verified || !marketplaceRoles.includes(account.role)
        || account.id !== proof.user_id || account.role !== proof.role || account.phone !== proof.phone
        || account.session_version !== proof.session_version || proof.purpose !== 'sign_in'
        || !identity || identity.proof_id !== proof.identity_proof_id
        || recipientHash(identity.email_key) !== proof.recipient_hash
        || recipientHash(delivery.email) !== proof.recipient_hash || proof.expires_at <= await currentTime(client)) {
      await finish(client, proof.id, 'invalidated'); return false;
    }
    // Commit the one attempt before any network I/O; no account/row lock is
    // held while calling the provider. Revocation after this point is still
    // enforced by completeEmailSignIn, not bypassed by receiving an email.
    const result = await client.query(`UPDATE email_sign_in_challenges SET delivery_state='attempting',
      delivery_started_at=clock_timestamp() WHERE id=$1 AND expires_at>clock_timestamp() RETURNING id`, [proof.id]);
    if (result.rowCount !== 1) throw createAppError('Unable to reserve verification delivery.', 503);
    return true;
  });
  if (!claimed) return;
  const outcome = await sendEmailVerificationCode(delivery).catch(() => ({ status: 'unknown' as const }));
  // An uncertain receipt must not reopen/consume the proof or resend its code.
  // Ownership verification remains possible even if this acknowledgement fails.
  const recorded = await db.query(`UPDATE email_sign_in_challenges SET delivery_state=$2,
    delivery_finished_at=clock_timestamp() WHERE id=$1 AND delivery_state='attempting' RETURNING id`,
  [prepared.id, outcome.status]);
  if (recorded.rowCount !== 1) throw createAppError('Unable to record verification delivery.', 503);
}

/** Consume proof, issue/persist the same canonical session, login metadata and
 * minimal audit in one transaction. Replay never returns credentials. A lost
 * response after COMMIT requires a fresh sign-in; no token cache is introduced.
 */
export async function completeEmailSignIn(
  id: string, code: string, context: CredentialContext = {},
): Promise<EmailSignInResult> {
  if (!uuid.safeParse(id).success || !/^\d{6}$/.test(code)
      || (context.deviceFingerprint !== undefined && !z.string().min(8).max(256).safeParse(context.deviceFingerprint).success)
      || (context.ipAddress !== undefined && isIP(context.ipAddress) === 0)) {
    throw createAppError('Invalid verification request.', 400);
  }
  return db.transaction(async client => {
    const owner = (await client.query<{ user_id: string | null }>(
      'SELECT user_id FROM email_sign_in_challenges WHERE id=$1', [id])).rows[0];
    const account = owner?.user_id ? (await client.query<Account>(
      'SELECT * FROM users WHERE id=$1 FOR NO KEY UPDATE', [owner.user_id])).rows[0] : undefined;
    const proof = (await client.query<Proof>(
      'SELECT * FROM email_sign_in_challenges WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!proof || proof.state !== 'pending') return { status: 'invalid' };
    if (proof.expires_at <= await currentTime(client) || proof.attempts >= proof.max_attempts) {
      await finish(client, id, 'invalidated'); return { status: 'invalid' };
    }
    const matches = await validCode(proof, code);
    if (!matches) {
      await client.query('UPDATE email_sign_in_challenges SET attempts=attempts+1 WHERE id=$1', [id]);
      if (proof.attempts + 1 >= proof.max_attempts || proof.expires_at <= await currentTime(client)) await finish(client, id, 'invalidated');
      return { status: 'invalid' };
    }
    const identity = account ? (await client.query<{ proof_id: string; email_key: string }>(
      'SELECT proof_id,email_key FROM sign_in_email_identities WHERE user_id=$1', [account.id])).rows[0] : undefined;
    if (!account?.is_active || !account.is_verified || !marketplaceRoles.includes(account.role)
        || account.id !== proof.user_id || proof.user_id !== owner?.user_id || proof.purpose !== 'sign_in'
        || account.role !== proof.role || account.session_version !== proof.session_version || account.phone !== proof.phone
        || identity?.proof_id !== proof.identity_proof_id || !identity || recipientHash(identity.email_key) !== proof.recipient_hash
        || proof.expires_at <= await currentTime(client)) {
      await finish(client, id, 'invalidated'); return { status: 'invalid' };
    }
    await client.query('SAVEPOINT email_sign_in_issuance');
    const tokens = await createTokenPairInTransaction(client, account.id, account.role, account.session_version, context);
    const login = await client.query('UPDATE users SET last_login_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=$1', [account.id]);
    if (login.rowCount !== 1) throw createAppError('Unable to record sign-in.', 500);
    const audit = await client.query(`INSERT INTO audit_log (user_id,action,entity_type,entity_id,new_values)
      VALUES ($1,'email_sign_in','users',$1,$2::jsonb) RETURNING id`,
    [account.id, JSON.stringify({ method: 'email', proofId: id })]);
    if (!audit.rows[0]?.id) throw createAppError('Unable to record sign-in.', 500);
    if (proof.expires_at <= await currentTime(client)) {
      await client.query('ROLLBACK TO SAVEPOINT email_sign_in_issuance');
      await finish(client, id, 'invalidated'); return { status: 'invalid' };
    }
    await finish(client, id, 'consumed');
    return { status: 'signed_in', ...tokens, isNewUser: false, user: {
      id: account.id, phone: account.phone, email: account.email, firstName: account.first_name,
      lastName: account.last_name, role: account.role, avatarUrl: account.avatar_url, isVerified: account.is_verified,
    } };
  });
}
