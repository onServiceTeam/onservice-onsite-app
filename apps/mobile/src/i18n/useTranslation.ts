import { translations, defaultLocale, type SupportedLocale } from './i18n.config';

let currentLocale: SupportedLocale = defaultLocale;

export function setLocale(locale: SupportedLocale): void {
  currentLocale = locale;
}

export function getLocale(): SupportedLocale {
  return currentLocale;
}

function getNestedValue(obj: Record<string, unknown>, path: string): string {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return path;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' ? current : path;
}

export function useTranslation(): {
  t: (key: string, vars?: Record<string, string>) => string;
  locale: SupportedLocale;
} {
  const strings = translations[currentLocale] as unknown as Record<string, unknown>;

  function t(key: string, vars?: Record<string, string>): string {
    let value = getNestedValue(strings, key);
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        value = value.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
      }
    }
    return value;
  }

  return { t, locale: currentLocale };
}
