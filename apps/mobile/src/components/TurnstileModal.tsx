import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

// Public Turnstile site key — safe to ship in the client. Set in the build env
// (EXPO_PUBLIC_TURNSTILE_SITE_KEY). The matching SECRET lives only on the server
// (CAPTCHA_SECRET_KEY) and verifies the token there.
const SITE_KEY = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY ?? '';

function buildHtml(siteKey: string): string {
  // Minimal page that renders the managed Turnstile widget and posts the token
  // (or an error) back to React Native via the WebView bridge.
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<style>
  html,body{margin:0;padding:0;height:100%;display:flex;align-items:center;justify-content:center;background:transparent;font-family:-apple-system,Segoe UI,Roboto,sans-serif}
  .cf-turnstile{margin:0 auto}
</style>
</head>
<body>
<div class="cf-turnstile" data-sitekey="${siteKey}" data-callback="onTok" data-error-callback="onErr" data-expired-callback="onErr" data-theme="light"></div>
<script>
  function post(m){ if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(m)); }
  function onTok(t){ post({ type: 'token', token: t }); }
  function onErr(){ post({ type: 'error' }); }
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
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  function handleMessage(e: WebViewMessageEvent): void {
    try {
      const msg = JSON.parse(e.nativeEvent.data) as { type: string; token?: string };
      if (msg.type === 'token' && msg.token) {
        onToken(msg.token);
      } else if (msg.type === 'error') {
        setErrored(true);
      }
    } catch {
      // ignore malformed bridge messages
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
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
                  originWhitelist={['*']}
                  source={{
                    html: buildHtml(SITE_KEY),
                    // A real origin is required for Turnstile to issue a token.
                    baseUrl: 'https://app.onservice.ph',
                  }}
                  onMessage={handleMessage}
                  onLoadEnd={() => setLoading(false)}
                  javaScriptEnabled
                  domStorageEnabled
                  style={styles.webview}
                  testID="turnstile-webview"
                />
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
  webviewWrap: { minHeight: 90, alignItems: 'center', justifyContent: 'center' },
  webview: { width: '100%', height: 90, backgroundColor: 'transparent' },
  loader: { position: 'absolute' },
  errorText: { ...typography.bodySmall, color: colors.error, textAlign: 'center', paddingVertical: spacing.base },
  cancelBtn: { marginTop: spacing.base, alignItems: 'center', paddingVertical: spacing.sm },
  cancelText: { ...typography.body, color: colors.textSecondary, fontWeight: '600' },
});
