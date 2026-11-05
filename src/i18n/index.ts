/**
 * Locale routing is configured in astro.config.mjs.
 * Only Russian pages exist. A future English locale can live in src/pages/en/
 * and src/i18n/en.ts without changing the Russian URLs.
 */
export const locales = ["ru", "en"] as const;
export const defaultLocale = "ru" as const;
export type Locale = (typeof locales)[number];

export function localePath(path: string, locale: Locale = defaultLocale): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  if (locale === defaultLocale) return clean;
  if (clean === "/") return `/${locale}/`;
  return `/${locale}${clean}`;
}
