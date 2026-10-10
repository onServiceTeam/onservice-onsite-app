import { z } from 'zod';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';

const PROVIDER_URL = 'https://api.resend.com/emails';
const TIMEOUT_MS = 10_000;
const MAX_RECEIPT_BYTES = 4096;
const emailAddress = z.string().email().max(254);

const challengeSchema = z.object({
  deliveryId: z.string().uuid(),
  email: emailAddress,
  code: z.string().regex(/^\d{6}$/),
  purpose: z.enum(['sign_in', 'link_email']),
  expiresAt: z.date(),
}).strict();

export type EmailVerificationDelivery = z.infer<typeof challengeSchema>;
export type EmailDeliveryOutcome =
  // Acceptance is a provider receipt, NOT proof of inbox delivery or identity.
  | { status: 'accepted'; messageId: string }
  | { status: 'unavailable' }
  | { status: 'rejected'; providerStatus: number }
  // A timeout, lost connection or invalid receipt can follow acceptance.
  | { status: 'unknown' };

function deliveryConfig(): { apiKey: string; from: string } | null {
  const apiKey = process.env.RESEND_API_KEY ?? '';
  const from = process.env.EMAIL_FROM ?? '';
  if (process.env.EMAIL_AUTH_DELIVERY_ENABLED !== '1'
      || !/^re_[A-Za-z0-9_-]{10,}$/.test(apiKey)
      || /^re_x+$/i.test(apiKey)
      || !emailAddress.safeParse(from).success) return null;
  return { apiKey, from };
}

/** Configuration presence only, not domain verification or inbox acceptance. */
export function isEmailCodeDeliveryConfigured(): boolean {
  return deliveryConfig() !== null;
}

async function readReceipt(response: Response, signal: AbortController['signal']): Promise<string | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  // Explicitly cancel a stalled body reader too. Signalling the original
  // fetch alone did not settle reader.read() in the real HTTP regression.
  const cancel = (): void => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    if (signal.aborted) {
      cancel();
      return null;
    }
    while (true) {
      const { value, done } = await reader.read();
      if (signal.aborted) return null;
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RECEIPT_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const receipt = z.object({ id: z.string().uuid() }).safeParse(parsed);
    return receipt.success ? receipt.data.id : null;
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}

/**
 * Internal delivery primitive for the verified-email workflow. Not a public
 * send-email endpoint, identity verifier, account linker or session issuer.
 * The caller must persist a fresh challenge with a hashed code, enforce abuse
 * limits and expiry, and reuse its SAME id/code/recipient/purpose/expiry when
 * reconciling an uncertain attempt. A new challenge requires a new deliveryId.
 * Never regenerate the code and blindly retry after an unknown outcome.
 */
export async function sendEmailVerificationCode(
  input: EmailVerificationDelivery,
): Promise<EmailDeliveryOutcome> {
  const parsed = challengeSchema.safeParse(input);
  if (!parsed.success) throw createAppError('Invalid email verification delivery.', 400);
  const challenge = parsed.data;
  const remainingMs = challenge.expiresAt.getTime() - Date.now();
  if (remainingMs <= 0 || remainingMs > 10 * 60_000) {
    throw createAppError('Invalid email verification expiry.', 400);
  }

  const config = deliveryConfig();
  if (!config) return { status: 'unavailable' };

  // A fixed expiry, rather than a recomputed countdown, keeps retry payloads
  // identical. Neither email aliases nor local-part case are rewritten here.
  const expires = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  }).format(challenge.expiresAt);
  const linking = challenge.purpose === 'link_email';
  const text = [
    linking
      ? 'Use this code to add this email as a sign-in method for your onService account:'
      : 'Use this code to continue signing in to onService:',
    challenge.code,
    `This code expires on ${expires} (Philippine time).`,
    'Do not share this code. onService support will never ask for it.',
    'If you did not request this, ignore this message. No account change is made by receiving this email.',
  ].join('\n\n');

  const controller = new AbortController();
  // Bound both headers and body, including when the challenge expires sooner.
  const timer = setTimeout(() => controller.abort(), Math.min(TIMEOUT_MS, remainingMs));
  timer.unref();
  try {
    const response = await globalThis.fetch(PROVIDER_URL, {
      method: 'POST',
      redirect: 'error',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `onservice-email-code/${challenge.deliveryId}`,
      },
      body: JSON.stringify({
        from: `onService PH <${config.from}>`,
        to: [challenge.email],
        subject: linking ? 'Confirm your onService sign-in email' : 'Your onService sign-in code',
        text,
      }),
    });

    if (!response.ok) {
      // Error bodies may echo recipients, codes or credentials. Never read or
      // log them. Do not follow redirects, retry, or invent a successful send.
      void response.body?.cancel().catch(() => undefined);
      if ([400, 401, 403, 404, 409, 422, 429].includes(response.status)) {
        logger.warn('Email verification provider rejected submission', { status: response.status });
        return { status: 'rejected', providerStatus: response.status };
      }
      logger.warn('Email verification acceptance is unknown', { status: response.status });
      return { status: 'unknown' };
    }
    const messageId = await readReceipt(response, controller.signal);
    if (!messageId) {
      logger.warn('Email verification acceptance receipt is invalid');
      return { status: 'unknown' };
    }
    return { status: 'accepted', messageId };
  } catch {
    // Exception messages/stacks can carry the request or provider response.
    logger.warn('Email verification acceptance is unknown');
    return { status: 'unknown' };
  } finally {
    clearTimeout(timer);
  }
}
