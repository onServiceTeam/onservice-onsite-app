import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

// Public Turnstile site key — safe to ship in the client. Set in the build env
// (EXPO_PUBLIC_TURNSTILE_SITE_KEY). The matching SECRET lives only on the server
// (CAPTCHA_SECRET_KEY) and verifies the token there.
const SITE_KEY = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY ?? '';
const PAGE_URL = 'https://app.onservice.ph';

function buildHtml(siteKey: string): string {
  // Minimal page that renders the managed Turnstile widget and posts the token
  // (or an error) back to React Native via the WebView bridge.
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<style>
  html,body{margin:0;padding:0;height:100%;display:flex;align-items:center;justify-content:center;background:transparent;font-family:-apple-system,Segoe UI,Roboto,sans-serif}
  .cf-turnstile{margin:0 auto}
</style>
</head>
<body>
<div class="cf-turnstile" data-sitekey="${siteKey}" data-callback="onTok" data-error-callback="onErr" data-expired-callback="onErr" data-theme="light"></div>
<script>
  (function () {
    var settled = false;
    var script = document.createElement('script');
    var deadline;
    function post(m) { if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(m)); }
    function detach() {
      clearTimeout(deadline);
      script.onload = null;
      script.onerror = null;
    }
    function fail() {
      if (settled) return;
      settled = true;
      detach();
      script.remove();
      post({ type: 'error' });
    }
    window.onTok = function (token) {
      if (settled || typeof token !== 'string' || !token.length) return;
      settled = true;
      detach();
      post({ type: 'token', token: token });
    };
    window.onErr = fail;
    script.onload = function () {
      if (settled) return;
      if (!window.turnstile || typeof window.turnstile.render !== 'function') { fail(); return; }
      // The SDK loaded. Do not time-limit the human solving its widget.
      detach();
    };
    script.onerror = fail;
    // Same SDK-only loading bound as the browser component, not an OTP retry.
    deadline = setTimeout(fail, 15000);
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    script.async = true;
    // Container and callbacks exist before the implicit-rendering SDK executes.
    document.head.appendChild(script);
  })();
</script>
</body>
</html>`;
}

interface Props {
  visible: boolean;
  onToken: (token: string) => void;
  onCancel: () => void;
}

/**
 * Cloudflare Turnstile challenge in a bottom sheet. Shown only when the server
 * returns HTTP 428 (captchaRequired) on an OTP request — i.e. after the
 * failed-attempt lockout, to stop bots burning SMS. On success it returns the
 * token to the caller, which retries the OTP request with it.
 */
export default function TurnstileModal({ visible, onToken, onCancel }: Props): React.ReactElement {
  // A hidden/reopened modal must not reuse the failed page or its callbacks.
  return visible ? <NativeChallenge onToken={onToken} onCancel={onCancel} /> : <></>;
}

function NativeChallenge({ onToken, onCancel }: Omit<Props, 'visible'>): React.ReactElement {
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const active = useRef(true);
  const phase = useRef<'pending' | 'proof' | 'failed' | 'cancelled'>('pending');
  const callbacks = useRef({ onToken, onCancel });
  callbacks.current = { onToken, onCancel };

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  function fail(): void {
    if (!active.current || phase.current !== 'pending') return;
    phase.current = 'failed';
    setLoading(false);
    setErrored(true);
  }

  function cancel(): void {
    if (!active.current || phase.current === 'proof' || phase.current === 'cancelled') return;
    // An error still needs a dismiss action, but can never provide a proof.
    phase.current = 'cancelled';
    callbacks.current.onCancel();
  }

  function isPage(url: unknown): boolean {
    // Android's modern bridge reports an origin; iOS and the Android fallback
    // report a document URL. Accept only the expected attribution, not a URL
    // supplied inside the payload. This is not full legacy-frame attribution.
    return url === PAGE_URL || url === `${PAGE_URL}/`;
  }

  const shouldNavigate: NonNullable<WebViewProps['onShouldStartLoadWithRequest']> = (request) => {
    if (!active.current || phase.current !== 'pending') return false;
    let allowed = isPage(request.url) || request.url === 'about:blank';
    if (request.isTopFrame === false) {
      // Turnstile uses challenge and opaque child frames. Allow these loads;
      // bridge messages attributed to those frames are rejected separately.
      allowed = allowed || request.url === 'about:srcdoc';
      try {
        const url = new URL(request.url);
        allowed = allowed || (url.origin === 'https://challenges.cloudflare.com' && !url.username && !url.password);
      } catch { /* Invalid navigation is denied below. */ }
    }
    if (!allowed) fail();
    return allowed;
  };

  function handleMessage(e: WebViewMessageEvent): void {
    if (!active.current || phase.current !== 'pending') return;
    if (!isPage(e.nativeEvent.url)) { fail(); return; }
    try {
      const msg = JSON.parse(e.nativeEvent.data) as { type: string; token?: string };
      if (msg.type === 'token' && typeof msg.token === 'string' && msg.token.length > 0) {
        phase.current = 'proof';
        setLoading(false);
        callbacks.current.onToken(msg.token);
      } else if (msg.type === 'error') {
        fail();
      }
    } catch {
      // ignore malformed bridge messages
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={cancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Quick security check</Text>
          <Text style={styles.subtitle}>
            For your security, please complete this check to receive your code.
          </Text>

          <View style={styles.webviewWrap}>
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
                <WebView
                  // Keep the library from launching off-whitelist URLs through
                  // Linking. The application policy below denies them instead.
                  originWhitelist={['*']}
                  onShouldStartLoadWithRequest={shouldNavigate}
                  onNavigationStateChange={({ url }) => {
                    // Android's native navigation wait can time out and allow a
                    // load. Invalidate the attempt if that page is observed.
                    if (!isPage(url) && url !== 'about:blank') fail();
                  }}
                  onOpenWindow={fail}
                  source={{
                    html: buildHtml(SITE_KEY),
                    // A real origin is required for Turnstile to issue a token.
                    baseUrl: PAGE_URL,
                  }}
                  onMessage={handleMessage}
                  onLoadEnd={() => {
                    if (active.current && phase.current === 'pending') setLoading(false);
                  }}
                  onError={fail}
                  onHttpError={fail}
                  onRenderProcessGone={fail}
                  onContentProcessDidTerminate={fail}
                  javaScriptEnabled
                  domStorageEnabled
                  style={styles.webview}
                  testID="turnstile-webview"
                />
              </>
            )}
          </View>

          <TouchableOpacity onPress={cancel} style={styles.cancelBtn} testID="turnstile-cancel">
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
  webviewWrap: { minHeight: 90, alignItems: 'center', justifyContent: 'center' },
  webview: { width: '100%', height: 90, backgroundColor: 'transparent' },
  loader: { position: 'absolute' },
  errorText: { ...typography.bodySmall, color: colors.error, textAlign: 'center', paddingVertical: spacing.base },
  cancelBtn: { marginTop: spacing.base, alignItems: 'center', paddingVertical: spacing.sm },
  cancelText: { ...typography.body, color: colors.textSecondary, fontWeight: '600' },
});
