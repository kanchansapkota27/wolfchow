/** Combining diacritical marks (U+0300–U+036F), stripped after NFKD normalize. */
const DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g')

/**
 * Turn a display name into a URL-safe slug: lowercased, non-alphanumerics
 * collapsed to single hyphens, trimmed, capped at 40 characters (without a
 * trailing hyphen).
 *
 * @example slugify("Joe's Pizza & Grill!") // "joe-s-pizza-grill"
 */
export function slugify(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(DIACRITICS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base.slice(0, 40).replace(/-+$/g, '')
}
