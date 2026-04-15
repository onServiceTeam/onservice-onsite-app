import axios from 'axios';
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
      logger.info(`[DEV SMS] To: ${phone} | Message: ${message}`);
      return true;
    }
    return false;
  }

  try {
    const response = await axios.post<SemaphoreResponse[]>(SEMAPHORE_API_URL, {
      apikey: apiKey,
      number: phone.replace('+', ''),
      message,
      sendername: senderName,
    });

    const result = response.data[0];
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

export async function sendOtpSms(phone: string, otp: string): Promise<boolean> {
  const message = `Your onService verification code is: ${otp}. Valid for ${platformConfig.otpExpiryMinutes} minutes. Do not share this code.`;
  return sendSms(phone, message);
}
