import crypto from 'node:crypto';
import { isIP } from 'node:net';
import { z } from 'zod';
import { db } from '../models/db';
import { platformConfig } from '../config/platform.config';
import { createAppError } from '../middleware/error.middleware';
import { SCRYPT_N, SCRYPT_R, SCRYPT_P, SCRYPT_MAXMEM, SCRYPT_KEYLEN } from './auth.service';
import { isEmailCodeDeliveryConfigured, sendEmailVerificationCode } from './email-code-delivery.service';
import { sendSms } from './sms.service';

// The low-level foundation is internal. The opt-in HTTP workflow below requires
// canonical authentication, CAPTCHA and configured delivery before starting.
// Provider acknowledgements never substitute for either ownership proof.
const actorSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['customer', 'provider', 'provider_staff']),
  sessionVersion: z.number().int().positive().max(2147483647),
}).strict();
export type EmailLinkActor = z.infer<typeof actorSchema>;
const emailSchema = z.string().trim().email().max(254).regex(/^[\x21-\x7e]+$/);
const codeSchema = z.string().regex(/^\d{6}$/);
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
interface Account { phone: string; role: string; session_version: number; is_active: boolean }
interface Challenge {
  id: string; user_id: string; purpose: 'link_email'; role: string;
  session_version: number; phone: string; email: string; email_key: string;
  phone_code_hash: string | null; email_code_hash: string | null;
  state: 'pending' | 'completed' | 'invalidated'; attempts: number; max_attempts: number;
  expires_at: Date;
}
export interface EmailLinkDelivery {
  // Secrets: return only to the server-side delivery coordinator, never
  // serialize this object to a client, job payload, audit or log.
  id: string; phone: string; email: string; phoneCode: string; emailCode: string; expiresAt: Date;
}
export type EmailLinkResult = { status: 'linked'; email: string } | { status: 'invalid' | 'conflict' };

function actorInput(input: EmailLinkActor): EmailLinkActor {
  const parsed = actorSchema.safeParse(input);
  if (!parsed.success) throw createAppError('This account cannot add a sign-in email.', 403);
  return parsed.data;
}

async function lockAccount(client: Transaction, actor: EmailLinkActor): Promise<Account> {
  const { rows } = await client.query<Account>(
    `SELECT phone, role, session_version, is_active FROM users WHERE id = $1 FOR NO KEY UPDATE`,
    [actor.userId],
  );
  const account = rows[0];
  if (!account?.is_active || account.role !== actor.role
      || Number(account.session_version) !== actor.sessionVersion
      || !/^\+63\d{10}$/.test(account.phone)) {
    throw createAppError('This authentication session has been revoked. Please login again.', 401);
  }
  return account;
}

function proofInput(challenge: Challenge, factor: 'phone' | 'email', code: string): string {
  return JSON.stringify([challenge.id, challenge.user_id, challenge.purpose,
    challenge.role, challenge.session_version, challenge.phone, challenge.email, factor, code]);
}

function derive(input: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => crypto.scrypt(input, salt, SCRYPT_KEYLEN,
    { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM },
    (error, key) => error ? reject(error) : resolve(key)));
}

async function hashProof(challenge: Challenge, factor: 'phone' | 'email', code: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${(await derive(proofInput(challenge, factor, code), salt)).toString('hex')}`;
}

async function verifyProof(challenge: Challenge, factor: 'phone' | 'email', code: string): Promise<boolean> {
  const stored = factor === 'phone' ? challenge.phone_code_hash : challenge.email_code_hash;
  if (!stored || !/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(stored)) return false;
  const [salt, digest] = stored.split(':');
  const actual = await derive(proofInput(challenge, factor, code), salt!);
  return crypto.timingSafeEqual(actual, Buffer.from(digest!, 'hex'));
}

async function finish(client: Transaction, id: string, state: 'completed' | 'invalidated'): Promise<void> {
  await client.query(`UPDATE email_link_challenges SET state=$2, phone_code_hash=NULL,
    email_code_hash=NULL, finished_at=clock_timestamp() WHERE id=$1`, [id, state]);
}

/** Creates a NEW one-time linking operation, never a sign-in/recovery proof.
 * Repeating start is not a delivery retry. No automatic resend is implemented.
 * Session authority alone cannot complete it: BOTH fresh codes are required.
 */
export async function beginEmailLink(
  input: EmailLinkActor, emailInput: string, requestIp: string,
): Promise<EmailLinkDelivery> {
  const actor = actorInput(input);
  const parsed = emailSchema.safeParse(emailInput);
  if (!parsed.success || isIP(requestIp) === 0) throw createAppError('Invalid verification request.', 400);
  const email = parsed.data, key = email.toLowerCase();
  return db.transaction(async client => {
    const account = await lockAccount(client, actor);
    const canonicalIp = (await client.query<{ ip: string }>('SELECT host($1::inet) AS ip', [requestIp]))
      .rows[0]!.ip.replace(/^::ffff:(?=\d+\.)/i, '');
    // Account first, then consistently ordered shared recipient/IP locks.
    // No raw identifier is interpolated into SQL. Collisions only serialize.
    for (const bucket of [`email-link/email/${key}`, `email-link/ip/${canonicalIp}`].sort()) {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [bucket]);
    }
    const existing = await client.query('SELECT user_id FROM sign_in_email_identities WHERE user_id=$1', [actor.userId]);
    if (existing.rows.length) throw createAppError('A sign-in email is already linked. Replacing it requires a separate verified change.', 409);
    const limits = await client.query<{ account_count: number; email_count: number; ip_count: number; cooling: boolean }>(
      `SELECT count(*) FILTER (WHERE user_id=$1)::int AS account_count,
              count(*) FILTER (WHERE email_key=$2)::int AS email_count,
              count(*) FILTER (WHERE request_ip=$3::inet)::int AS ip_count,
              COALESCE(bool_or(user_id=$1 AND created_at > clock_timestamp() - ($4 * INTERVAL '1 second')), FALSE) AS cooling
         FROM email_link_challenges WHERE created_at > clock_timestamp() - INTERVAL '1 hour'
          AND (user_id=$1 OR email_key=$2 OR request_ip=$3::inet)`,
      [actor.userId, key, canonicalIp, platformConfig.otpCooldownSeconds],
    );
    const limit = limits.rows[0]!;
    if (limit.cooling || Math.max(limit.account_count, limit.email_count, limit.ip_count) >= platformConfig.emailLinkRequestsPerHour) {
      throw createAppError('Too many verification requests. Please try again later.', 429);
    }
    const phoneCode = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
    const emailCode = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
    const challenge: Challenge = { id: crypto.randomUUID(), user_id: actor.userId,
      role: actor.role, session_version: actor.sessionVersion, purpose: 'link_email',
      phone: account.phone, email, email_key: key, phone_code_hash: null, email_code_hash: null,
      state: 'pending', attempts: 0, max_attempts: platformConfig.otpMaxAttempts, expires_at: new Date() };
    // Sequential derivation bounds peak memory to the existing scrypt cost.
    const phoneHash = await hashProof(challenge, 'phone', phoneCode);
    const emailHash = await hashProof(challenge, 'email', emailCode);
    await client.query(`UPDATE email_link_challenges SET state='invalidated', phone_code_hash=NULL,
      email_code_hash=NULL, finished_at=clock_timestamp() WHERE user_id=$1 AND state='pending'`, [actor.userId]);
    const inserted = await client.query<{ expires_at: Date }>(
      `INSERT INTO email_link_challenges (id,user_id,purpose,role,session_version,phone,email,email_key,
        request_ip,phone_code_hash,email_code_hash,max_attempts,created_at,expires_at)
       SELECT $1,$2,'link_email',$3,$4,$5,$6,$7,$8::inet,$9,$10,$11,t.now,
         t.now + ($12 * INTERVAL '1 minute') FROM (SELECT clock_timestamp() AS now) t RETURNING expires_at`,
      [challenge.id, actor.userId, actor.role, actor.sessionVersion, account.phone, email, key,
        canonicalIp, phoneHash, emailHash, challenge.max_attempts, platformConfig.otpExpiryMinutes],
    );
    return { id: challenge.id, phone: account.phone, email, phoneCode, emailCode, expiresAt: inserted.rows[0]!.expires_at };
  });
}

/** Account, both proofs, identity ownership and audit commit together. No JWT,
 * provider admission or contact-email write is performed by this function.
 */
export async function completeEmailLink(
  input: EmailLinkActor, operationId: string, phoneCode: string, emailCode: string,
): Promise<EmailLinkResult> {
  const actor = actorInput(input);
  if (!z.string().uuid().safeParse(operationId).success
      || !codeSchema.safeParse(phoneCode).success || !codeSchema.safeParse(emailCode).success) {
    throw createAppError('Invalid verification request.', 400);
  }
  return db.transaction(async client => {
    const account = await lockAccount(client, actor);
    const selected = await client.query<Challenge>(
      'SELECT * FROM email_link_challenges WHERE id=$1 AND user_id=$2 FOR UPDATE', [operationId, actor.userId]);
    const challenge = selected.rows[0];
    if (!challenge) return { status: 'invalid' };
    if (challenge.purpose !== 'link_email' || challenge.role !== actor.role
        || challenge.session_version !== actor.sessionVersion || challenge.phone !== account.phone) {
      if (challenge.state === 'pending') await finish(client, operationId, 'invalidated');
      return { status: 'invalid' };
    }
    if (challenge.state === 'completed') {
      // Safe response replay, NOT reusable proof or permission to relink.
      const receipt = await client.query<{ email: string }>(
        'SELECT email FROM sign_in_email_identities WHERE user_id=$1 AND proof_id=$2', [actor.userId, operationId]);
      return receipt.rows[0] ? { status: 'linked', email: receipt.rows[0].email } : { status: 'invalid' };
    }
    if (challenge.state !== 'pending') return { status: 'invalid' };
    const currentTime = async (): Promise<Date> => (await client.query<{ now: Date }>('SELECT clock_timestamp() AS now')).rows[0]!.now;
    if (challenge.expires_at <= await currentTime() || challenge.attempts >= challenge.max_attempts) {
      await finish(client, operationId, 'invalidated');
      return { status: 'invalid' };
    }
    const validPhone = await verifyProof(challenge, 'phone', phoneCode);
    const validEmail = await verifyProof(challenge, 'email', emailCode);
    // Recheck after hashing, not transaction-frozen NOW() before a lock wait.
    if (!validPhone || !validEmail || challenge.expires_at <= await currentTime()) {
      await client.query('UPDATE email_link_challenges SET attempts=attempts+1 WHERE id=$1', [operationId]);
      if (challenge.attempts + 1 >= challenge.max_attempts || challenge.expires_at <= await currentTime()) {
        await finish(client, operationId, 'invalidated');
      }
      // Returning commits the failed-attempt counter. Throwing would undo it.
      return { status: 'invalid' };
    }
    await client.query('SAVEPOINT verified_email_link');
    const inserted = await client.query(`INSERT INTO sign_in_email_identities (user_id,email,email_key,proof_id)
      VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING user_id`,
    [actor.userId, challenge.email, challenge.email_key, operationId]);
    if (inserted.rowCount !== 1) {
      await finish(client, operationId, 'invalidated');
      return { status: 'conflict' };
    }
    const audit = await client.query(`INSERT INTO audit_log (user_id,action,entity_type,entity_id,new_values)
      VALUES ($1,'sign_in_email_linked','sign_in_email_identity',$1,$2::jsonb) RETURNING id`,
    [actor.userId, JSON.stringify({ method: 'email', proofId: operationId })]);
    if (!audit.rows[0]?.id) throw createAppError('Unable to record the sign-in method change.', 500);
    // Unique-key or audit work can wait too. Do not commit ownership based on
    // a proof that expired during that wait; preserve the terminal rejection.
    if (challenge.expires_at <= await currentTime()) {
      await client.query('ROLLBACK TO SAVEPOINT verified_email_link');
      await finish(client, operationId, 'invalidated');
      return { status: 'invalid' };
    }
    await finish(client, operationId, 'completed');
    return { status: 'linked', email: challenge.email };
  });
}

type PhoneDelivery = 'accepted' | 'unknown' | 'unavailable';
type DeliveryState = PhoneDelivery | 'not_started' | 'rejected';
export interface EmailLinkStatus {
  linkedEmail: string | null;
  request: null | {
    id: string; email: string; phoneSuffix: string; expiresAt: Date;
    state: 'pending' | 'expired' | 'completed' | 'invalidated';
    delivery: { phone: DeliveryState; email: DeliveryState };
  };
}

export function assertEmailLinkEnabled(): void {
  if (process.env.EMAIL_LINKING_ENABLED !== '1') {
    throw createAppError('Adding a sign-in email is not available yet.', 503);
  }
}

function phoneDeliveryConfigured(): boolean {
  const key = process.env.SEMAPHORE_API_KEY ?? '';
  return key.trim().length > 0 && !/^x+$/i.test(key.trim());
}

/** Owner-only recovery of a lost response. No send/retry, secret or new session. */
export async function getEmailLinkStatus(input: EmailLinkActor, operationId?: string): Promise<EmailLinkStatus> {
  const actor = actorInput(input);
  return db.transaction(async client => {
    const account = await lockAccount(client, actor);
    const identity = await client.query<{ email: string }>(
      'SELECT email FROM sign_in_email_identities WHERE user_id=$1', [actor.userId]);
    const result = await client.query<{
      id: string; email: string; phone: string; role: string; session_version: number;
      state: 'pending' | 'completed' | 'invalidated'; expires_at: Date; expired: boolean;
      phone_delivery: DeliveryState | 'attempting'; email_delivery: DeliveryState | 'attempting';
    }>(`SELECT id,email,phone,role,session_version,state,expires_at,
        expires_at<=clock_timestamp() AS expired,phone_delivery,email_delivery
        FROM email_link_challenges WHERE user_id=$1 AND ($2::uuid IS NULL OR id=$2)
        ORDER BY created_at DESC,id DESC LIMIT 1`, [actor.userId, operationId ?? null]);
    const row = result.rows[0];
    // A new session generation must not recover a previously authorized proof.
    const request = !row || row.role !== actor.role || row.session_version !== actor.sessionVersion
      || row.phone !== account.phone ? null : {
        id: row.id, email: row.email, phoneSuffix: row.phone.slice(-4), expiresAt: row.expires_at,
        state: row.state === 'pending' && row.expired ? 'expired' as const : row.state,
        // A reserved attempt might still be running, or its response/process
        // may have been lost. Neither situation authorizes an automatic resend.
        delivery: {
          phone: row.phone_delivery === 'attempting' ? 'unknown' as const : row.phone_delivery,
          email: row.email_delivery === 'attempting' ? 'unknown' as const : row.email_delivery,
        },
      };
    return { linkedEmail: identity.rows[0]?.email ?? null, request };
  });
}

async function deliverLinkPhoneProof(proof: EmailLinkDelivery): Promise<PhoneDelivery> {
  // Never inherit sendSms's development missing-key success simulation.
  if (!phoneDeliveryConfigured() || proof.expiresAt.getTime() <= Date.now()) return 'unavailable';
  const expiry = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  }).format(proof.expiresAt);
  const accepted = await sendSms(proof.phone,
    `onService: ${proof.phoneCode} adds an email sign-in to your account. Expires ${expiry} Philippine time. Do not share. Ignore if not requested.`);
  // The legacy boolean cannot distinguish rejection from lost acceptance.
  // Conservatively keep uncertainty; never invent a definitive failure/retry.
  return accepted ? 'accepted' : 'unknown';
}

/** Starts one fresh, limited operation and sends each factor at most once here.
 * No queue stores codes. A lost response is recovered with getEmailLinkStatus;
 * explicit later restart obeys cooldown and invalidates the preceding proof.
 */
export async function requestEmailLink(
  input: EmailLinkActor, emailInput: string, requestIp: string,
): Promise<EmailLinkStatus> {
  const actor = actorInput(input);
  assertEmailLinkEnabled();
  if (!phoneDeliveryConfigured() || !isEmailCodeDeliveryConfigured()) {
    throw createAppError('Verification delivery is temporarily unavailable. Please try again later.', 503);
  }
  const proof = await beginEmailLink(actor, emailInput, requestIp);
  // Commit a claim BEFORE either external call. Recheck authority and expiry
  // after any account/row wait, without holding a DB lock across network I/O.
  await db.transaction(async client => {
    const account = await lockAccount(client, actor);
    const selected = await client.query<{ valid: boolean }>(
      `SELECT state='pending' AND phone=$3 AND role=$4 AND session_version=$5
          AND phone_delivery='not_started' AND email_delivery='not_started'
          AND expires_at>clock_timestamp() AS valid
       FROM email_link_challenges WHERE id=$1 AND user_id=$2 FOR UPDATE`,
      [proof.id, actor.userId, account.phone, actor.role, actor.sessionVersion]);
    if (!selected.rows[0]?.valid) throw createAppError('This verification request is no longer usable.', 409);
    const claimed = await client.query(`UPDATE email_link_challenges SET
      phone_delivery='attempting',email_delivery='attempting',delivery_started_at=clock_timestamp()
      WHERE id=$1 AND expires_at>clock_timestamp() RETURNING id`, [proof.id]);
    if (claimed.rowCount !== 1) throw createAppError('This verification request has expired.', 409);
  });
  const [phone, email] = await Promise.all([
    deliverLinkPhoneProof(proof).catch(() => 'unknown' as const),
    sendEmailVerificationCode({ deliveryId: proof.id, email: proof.email, code: proof.emailCode,
      purpose: 'link_email', expiresAt: proof.expiresAt }).then(outcome => outcome.status).catch(() => 'unknown' as const),
  ]);
  // Failure here intentionally leaves an uncertain claim, never an automatic
  // repeat. A late receipt must not reopen a completed/invalidated operation.
  const recorded = await db.query(`UPDATE email_link_challenges SET phone_delivery=$3,email_delivery=$4,
    delivery_finished_at=clock_timestamp() WHERE id=$1 AND user_id=$2
    AND phone_delivery='attempting' AND email_delivery='attempting' RETURNING id`,
  [proof.id, actor.userId, phone, email]);
  if (recorded.rowCount !== 1) throw createAppError('Unable to confirm verification delivery. Check the request status before trying again.', 503);
  // A slow old response must describe its own operation, not a newer request.
  return getEmailLinkStatus(actor, proof.id);
}
