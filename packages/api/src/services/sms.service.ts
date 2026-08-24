// Bug 1271 verified — native fetch only. CRIT-N14 fix: replaced axios with
// globalThis.fetch so this service follows the same wrapper rule as the rest
// of the codebase. Axios was the last remaining dependency on a third-party
// HTTP client in the API package.
import { logger } from '../utils/logger';
import { platformConfig } from '../config/platform.config';

interface SemaphoreResponse {
  message_id: number;
  user_id: number;
  user: string;
  account_id: number;
  account: string;
  recipient: string;
  message: string;
  sender_name: string;
  network: string;
  status: string;
  type: string;
  source: string;
  created_at: string;
  updated_at: string;
}

const SEMAPHORE_API_URL = 'https://api.semaphore.co/api/v4/messages';

export async function sendSms(phone: string, message: string): Promise<boolean> {
  const apiKey = process.env.SEMAPHORE_API_KEY;
  const senderName = process.env.SEMAPHORE_SENDER_NAME || 'onService';

  if (!apiKey) {
    logger.warn('SEMAPHORE_API_KEY not set — SMS not sent', { phone: phone.slice(-4) });

    if (process.env.NODE_ENV === 'development') {
      // CRIT-N12 + MED-N143 fix: do NOT log the OTP message body in dev.
      // Previously logged the full message including the 6-digit code; that
      // surfaced the OTP plaintext into log shipping pipelines.
      logger.info('[DEV SMS] sent', {
        phoneSuffix: phone.slice(-4),
        messageLength: message.length,
      });
      return true;
    }
    return false;
  }

  try {
    const response = await globalThis.fetch(SEMAPHORE_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apikey: apiKey,
        number: phone.replace('+', ''),
        message,
        sendername: senderName,
      }),
    });

    if (!response.ok) {
      logger.error('Semaphore returned non-2xx status', {
        phone: phone.slice(-4),
        status: response.status,
      });
      return false;
    }

    const data = (await response.json()) as SemaphoreResponse[];
    const result = data[0];
    logger.info('SMS sent successfully', {
      phone: phone.slice(-4),
      messageId: result?.message_id,
      network: result?.network,
    });

    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Failed to send SMS via Semaphore', {
      phone: phone.slice(-4),
      error: err.message,
    });
    return false;
  }
}

export async function sendOtpSms(
  phone: string,
  otp: string,
  expiryMinutes: number = platformConfig.otpExpiryMinutes,
): Promise<boolean> {
  const message = `Your onService verification code is: ${otp}. Valid for ${expiryMinutes} minutes. Do not share this code.`;
  return sendSms(phone, message);
}
