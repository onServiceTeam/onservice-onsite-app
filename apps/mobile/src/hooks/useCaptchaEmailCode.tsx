import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useAuthStore, type EmailCodeReceipt } from '@/stores/auth.store';
import { ApiError } from '@/services/api';
import TurnstileModal from '@/components/TurnstileModal';

/**
 * D37: the email-code twin of useCaptchaOtp (which stays unchanged for when
 * phone codes return). Same rules: if the server answers 428 (CAPTCHA
 * required after repeated failures) the Turnstile sheet opens, and the
 * request is retried once with the token. One request at a time; leaving the
 * screen cancels the wait and nothing is dispatched or navigated afterwards.
 */
interface CaptchaEmailCode {
  requestEmailCodeWithCaptcha: (email: string) => Promise<EmailCodeReceipt>;
  captchaModal: React.ReactElement;
}

interface Attempt {
  cancel: () => void;
  proof: { resolve: (token: string) => void; reject: (error: Error) => void } | null;
}

export function useCaptchaEmailCode(): CaptchaEmailCode {
  const { requestEmailCode } = useAuthStore();
  const mounted = useRef(true);
  const active = useRef<Attempt | null>(null);
  const [challenge, setChallenge] = useState<Attempt | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      active.current?.cancel();
    };
  }, []);

  const requestEmailCodeWithCaptcha = useCallback(
    (email: string): Promise<EmailCodeReceipt> => {
      if (!mounted.current) return Promise.reject(new Error('Sign-in screen closed.'));
      if (active.current) return Promise.reject(new Error('A code request is already in progress.'));
      return new Promise<EmailCodeReceipt>((resolve, reject) => {
        const finish = (settle: () => void): void => {
          if (active.current !== attempt) return;
          active.current = null;
          if (mounted.current) setChallenge(null);
          settle();
        };
        const attempt: Attempt = {
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
        const run = async (): Promise<EmailCodeReceipt | undefined> => {
          try {
            return await requestEmailCode(email);
          } catch (error) {
            if (!isCurrent()) return undefined;
            if (!(error instanceof ApiError) || error.status !== 428) throw error;
            const token = await new Promise<string>((resolveProof, rejectProof) => {
              attempt.proof = { resolve: resolveProof, reject: rejectProof };
              setChallenge(attempt);
            });
            if (!isCurrent()) return undefined;
            return await requestEmailCode(email, token);
          }
        };
        void run().then(
          receipt => finish(() => (receipt ? resolve(receipt) : reject(new Error('Sign-in screen closed.')))),
          error => finish(() => reject(error)),
        );
      });
    },
    [requestEmailCode],
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

  return { requestEmailCodeWithCaptcha, captchaModal };
}
