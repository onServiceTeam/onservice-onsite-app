import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { ApiError } from '@/services/api';
import TurnstileModal from '@/components/TurnstileModal';

interface CaptchaOtp {
  /**
   * Request an OTP, transparently handling the server's captcha challenge:
   * if the server replies 428 (captchaRequired) after the lockout, this opens
   * the Turnstile sheet, waits for the user to solve it, then retries the
   * request with the token. Resolves when the server accepts the request, not
   * proof of handset delivery. Rejects overlapping calls, cancellation,
   * unmount and underlying failures. Leaving cannot undo an already-sent HTTP
   * request, but it must not dispatch another request or navigate on its result.
   */
  requestOtpWithCaptcha: (phone: string) => Promise<void>;
  /** Render this once in the screen so the challenge sheet can appear. */
  captchaModal: React.ReactElement;
}

interface OtpAttempt {
  cancel: () => void;
  proof: { resolve: (token: string) => void; reject: (error: Error) => void } | null;
}

export function useCaptchaOtp(): CaptchaOtp {
  const { requestOtp } = useAuthStore();
  const mounted = useRef(true);
  const active = useRef<OtpAttempt | null>(null);
  const [challenge, setChallenge] = useState<OtpAttempt | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      active.current?.cancel();
    };
  }, []);

  const requestOtpWithCaptcha = useCallback(
    (phone: string): Promise<void> => {
      if (!mounted.current) return Promise.reject(new Error('Sign-in screen closed.'));
      // Own the whole operation synchronously, including its first HTTP call.
      // Neither same-phone duplicates nor different phones may replace it.
      if (active.current) return Promise.reject(new Error('A verification request is already in progress.'));
      return new Promise<void>((resolve, reject) => {
        const finish = (settle: () => void): void => {
          if (active.current !== attempt) return;
          active.current = null;
          if (mounted.current) setChallenge(null);
          settle();
        };
        const attempt: OtpAttempt = {
          proof: null,
          cancel: () => {
            const error = new Error('Security check cancelled.');
            const proof = attempt.proof;
            attempt.proof = null;
            finish(() => reject(error));
            proof?.reject(error);
          },
        };
        active.current = attempt;
        const isCurrent = (): boolean => mounted.current && active.current === attempt;
        const run = async (): Promise<void> => {
          try {
            await requestOtp(phone);
          } catch (error) {
            if (!isCurrent()) return;
            // Only the captcha-required signal permits this explicit proof step.
            if (!(error instanceof ApiError) || error.status !== 428) throw error;
            const token = await new Promise<string>((resolveProof, rejectProof) => {
              attempt.proof = { resolve: resolveProof, reject: rejectProof };
              setChallenge(attempt);
            });
            // A proof callback and screen removal can happen in the same turn.
            if (!isCurrent()) return;
            await requestOtp(phone, token);
          }
        };
        // Observe late HTTP rejections too, without resurrecting cancelled work.
        void run().then(() => finish(resolve), error => finish(() => reject(error)));
      });
    },
    [requestOtp],
  );

  const handleToken = useCallback((token: string) => {
    if (!mounted.current || !challenge || active.current !== challenge || !challenge.proof) return;
    const proof = challenge.proof;
    challenge.proof = null;
    setChallenge(null);
    proof.resolve(token);
  }, [challenge]);

  const handleCancel = useCallback(() => {
    if (mounted.current && challenge && active.current === challenge && challenge.proof) challenge.cancel();
  }, [challenge]);

  const captchaModal = (
    <TurnstileModal visible={challenge !== null} onToken={handleToken} onCancel={handleCancel} />
  );

  return { requestOtpWithCaptcha, captchaModal };
}
