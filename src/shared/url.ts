/** Tracking params we strip so the "same" page dedups regardless of campaign. */
const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'ref',
  'ref_src',
  'igshid',
  '_ga',
  'yclid',
  'spm',
]);

/**
 * Produce a canonical URL for duplicate detection:
 * lowercase host, no trailing slash, no tracking params, no fragment.
 */
export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = '';
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
    for (const p of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(p.toLowerCase())) u.searchParams.delete(p);
    }
    // Sort remaining params for stable comparison.
    u.searchParams.sort();
    let out = u.toString();
    // Drop trailing slash on the path (but keep root "/").
    out = out.replace(/\/(\?|$)/, '$1');
    return out;
  } catch {
    return raw;
  }
}

export function getDomain(raw: string): string {
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** URLs we never want to capture (browser-internal, blank, etc.). */
export function isCapturableUrl(raw: string): boolean {
  if (!raw) return false;
  return /^https?:\/\//i.test(raw);
}
