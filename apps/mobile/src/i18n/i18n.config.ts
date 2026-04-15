import en from './en.json';
import fil from './fil.json';

export const defaultLocale = 'en';
export const supportedLocales = ['en', 'fil'] as const;
export type SupportedLocale = (typeof supportedLocales)[number];

export const translations: Record<SupportedLocale, typeof en> = {
  en,
  fil,
};
