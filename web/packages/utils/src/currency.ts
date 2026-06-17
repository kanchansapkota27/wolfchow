/** Currencies → the locale whose conventions we format them with. */
const CURRENCY_LOCALE: Record<string, string> = {
  TRY: 'tr-TR',
  EUR: 'de-DE',
  GBP: 'en-GB',
  USD: 'en-US',
}

/**
 * Format a monetary amount for display. Locale is derived from the currency so
 * grouping/decimal separators and symbol placement match local convention.
 *
 * @example formatCurrency(1234.5, 'TRY') // "₺1.234,50"
 */
export function formatCurrency(amount: number, currency: string): string {
  const locale = CURRENCY_LOCALE[currency.toUpperCase()] ?? 'en-US'
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount)
}
