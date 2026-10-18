import { useSyncExternalStore } from "react";
import {
  resolveLocale,
  t,
  type LocalePreference,
  type SupportedLocale,
  type TranslationKey,
  type TranslationParams,
} from "../../shared/chat-view/i18n";

/**
 * The one language the running UI renders in. The feature controller writes it from host settings,
 * so contributions that were built once — registered pills and commands, the sticky DOM overlay —
 * can follow a language change instead of keeping the locale they saw at registration time.
 */
let preference: LocalePreference = "zh-CN";
let locale: SupportedLocale = "zh-CN";
const listeners = new Set<() => void>();

export function setLocalePreference(next: LocalePreference): void {
  const resolved = resolveLocale(next);
  if (next === preference && resolved === locale) return;
  preference = next;
  locale = resolved;
  for (const listener of listeners) listener();
}

export function currentLocale(): SupportedLocale {
  return locale;
}

/** Translate into the current language; use this everywhere the locale is not already at hand. */
export function tr(key: TranslationKey, values?: TranslationParams): string {
  return t(locale, key, values);
}

/** Renders again on a language change; the subscribe callback is stable, so no teardown churn. */
export function useLocale(): SupportedLocale {
  return useSyncExternalStore(subscribeLocale, currentLocale, currentLocale);
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
