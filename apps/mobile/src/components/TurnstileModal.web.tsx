/**
 * Web implementation of TurnstileModal (Metro resolves .web.tsx on web).
 *
 * The native version hosts the Cloudflare Turnstile widget inside a
 * react-native-webview, which has no browser implementation — so a web user
 * who hit the OTP captcha threshold (HTTP 428 after repeated failures) saw an
 * empty sheet and could never finish logging in. In a browser we are already
 * a real web page, so we load Turnstile's script and render the widget
 * directly into a DOM node. Same props + chrome as ./TurnstileModal.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

// Public Turnstile site key — safe to ship in the client (the secret stays on
// the server as CAPTCHA_SECRET_KEY).
const SITE_KEY = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY ?? '';

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
// Only bounds SDK loading, not the time a person has to solve the challenge.
const SCRIPT_LOAD_TIMEOUT_MS = 15_000;

interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback: (token: string) => void;
      'error-callback': () => void;
      'expired-callback': () => void;
      theme?: string;
    },
  ) => string;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

/** Load the Turnstile script once and resolve with the API object. */
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    let settled = false;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const detach = (): void => {
      if (deadline !== undefined) clearTimeout(deadline);
      script.onload = null;
      script.onerror = null;
    };
    const fail = (message: string): void => {
      // Both a network failure and a loaded-but-missing SDK must permit a
      // fresh explicit attempt. Detach this failed script's handlers so a
      // late event cannot clear a newer attempt's shared promise.
      if (settled) return;
      settled = true;
      detach();
      script.remove();
      scriptPromise = null;
      reject(new Error(message));
    };
    script.onload = () => {
      if (settled) return;
      if (window.turnstile) {
        settled = true;
        detach();
        resolve(window.turnstile);
      } else fail('Turnstile script loaded but API missing');
    };
    script.onerror = () => fail('Turnstile script failed to load');
    deadline = setTimeout(() => fail('Turnstile script load timed out'), SCRIPT_LOAD_TIMEOUT_MS);
    document.head.appendChild(script);
  });
  return scriptPromise;
}

interface Props {
  visible: boolean;
  onToken: (token: string) => void;
  onCancel: () => void;
}

export default function TurnstileModal({ visible, onToken, onCancel }: Props): React.ReactElement {
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);
  // Keep the freshest onToken without re-rendering the widget per render.
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    if (!visible || SITE_KEY.length === 0) return undefined;
    let cancelled = false;
    let widgetId: string | null = null;
    let api: TurnstileApi | null = null;

    setLoading(true);
    setErrored(false);

    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !hostRef.current) return;
        api = turnstile;
        widgetId = turnstile.render(hostRef.current, {
          sitekey: SITE_KEY,
          theme: 'light',
          callback: (token: string) => onTokenRef.current(token),
          'error-callback': () => setErrored(true),
          'expired-callback': () => setErrored(true),
        });
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
          setErrored(true);
        }
      });

    return () => {
      cancelled = true;
      if (api && widgetId !== null) {
        try {
          api.remove(widgetId);
        } catch {
          // widget already gone — nothing to clean up
        }
      }
    };
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Quick security check</Text>
          <Text style={styles.subtitle}>
            For your security, please complete this check to receive your code.
          </Text>

          <View style={styles.widgetWrap}>
            {SITE_KEY.length === 0 ? (
              <Text style={styles.errorText}>
                Security check is not configured. Please try again later or contact support.
              </Text>
            ) : errored ? (
              <Text style={styles.errorText}>
                The security check could not load. Check your connection and try again.
              </Text>
            ) : (
              <>
                {loading && <ActivityIndicator color={colors.primary} style={styles.loader} />}
                <div ref={hostRef} data-testid="turnstile-host" />
              </>
            )}
          </View>

          <TouchableOpacity onPress={onCancel} style={styles.cancelBtn} testID="turnstile-cancel">
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  title: { ...typography.h3, color: colors.text },
  subtitle: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.base },
  widgetWrap: { minHeight: 90, alignItems: 'center', justifyContent: 'center' },
  loader: { position: 'absolute' },
  errorText: { ...typography.bodySmall, color: colors.error, textAlign: 'center', paddingVertical: spacing.base },
  cancelBtn: { marginTop: spacing.base, alignItems: 'center', paddingVertical: spacing.sm },
  cancelText: { ...typography.body, color: colors.textSecondary, fontWeight: '600' },
});
