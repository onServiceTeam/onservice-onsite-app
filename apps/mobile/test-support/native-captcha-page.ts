import { createContext, runInContext } from 'node:vm';
import type { WebViewProps } from 'react-native-webview';

/** Execute the actual supplied HTML's inline scripts, with no external network. */
export function nativeCaptchaPage(props: WebViewProps): {
  document: typeof document;
  context: ReturnType<typeof createContext>;
  messages: string[];
} {
  const source = props.source as { html: string; baseUrl: string };
  const page = new window.DOMParser().parseFromString(source.html, 'text/html');
  const messages: string[] = [];
  const context = createContext({
    document: page, setTimeout, clearTimeout,
    ReactNativeWebView: { postMessage: (data: string) => {
      messages.push(data);
      props.onMessage?.({ nativeEvent: { data, url: source.baseUrl } } as Parameters<NonNullable<WebViewProps['onMessage']>>[0]);
    } },
  });
  context.window = context;
  // Capture before executing: runtime may append its external SDK script.
  const scripts = Array.from(page.querySelectorAll('script:not([src])'));
  for (const script of scripts) runInContext(script.textContent ?? '', context);
  return { document: page, context, messages };
}
