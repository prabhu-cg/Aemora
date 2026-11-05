/** "Card Teaser" -> "card-teaser". Used for AEM folder names. */
export function kebab(s: string, fallback = ''): string {
  const out = s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return out || fallback
}
