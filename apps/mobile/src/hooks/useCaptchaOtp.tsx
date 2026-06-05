import React, { useRef, useState, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { ApiError } from '@/services/api';
import TurnstileModal from '@/components/TurnstileModal';

interface CaptchaOtp {
  /**
   * Request an OTP, transparently handling the server's captcha challenge:
   * if the server replies 428 (captchaRequired) after the lockout, this opens
   * the Turnstile sheet, waits for the user to solve it, then retries the
   * request with the token. Resolves once the OTP is actually sent; rejects if
   * the user cancels the challenge or the underlying request fails.
   */
  requestOtpWithCaptcha: (phone: string) => Promise<void>;
  /** Render this once in the screen so the challenge sheet can appear. */
  captchaModal: React.ReactElement;
}

export function useCaptchaOtp(): CaptchaOtp {
  const { requestOtp } = useAuthStore();
  const [visible, setVisible] = useState(false);
  const pending = useRef<{ resolve: (t: string) => void; reject: (e: Error) => void } | null>(null);

  const requestOtpWithCaptcha = useCallback(
    async (phone: string): Promise<void> => {
      try {
        await requestOtp(phone);
      } catch (err) {
        // Only the captcha-required signal is special; everything else bubbles.
        if (err instanceof ApiError && err.status === 428) {
          const token = await new Promise<string>((resolve, reject) => {
            pending.current = { resolve, reject };
            setVisible(true);
          });
          await requestOtp(phone, token);
          return;
        }
        throw err;
      }
    },
    [requestOtp],
  );

  const handleToken = useCallback((token: string) => {
    setVisible(false);
    pending.current?.resolve(token);
    pending.current = null;
  }, []);

  const handleCancel = useCallback(() => {
    setVisible(false);
    pending.current?.reject(new Error('Security check cancelled.'));
    pending.current = null;
  }, []);

  const captchaModal = (
    <TurnstileModal visible={visible} onToken={handleToken} onCancel={handleCancel} />
  );

  return { requestOtpWithCaptcha, captchaModal };
}
