/**
 * Dependency-free extractive summarizer + keyword extractor.
 * Good enough as the "local" default; cloud LLMs can produce richer output.
 */

const STOPWORDS = new Set(
  `a an and are as at be by for from has have he in is it its of on that the to was were will with this these those you your we our they their i me my but or not can could would should about into over after before more most other some such only own same so than too very just also then once here there all any each few`.split(
    /\s+/,
  ),
);

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z0-9+.#-]{1,}/g) ?? []).filter(
    (w) => w.length > 2 && !STOPWORDS.has(w),
  );
}

export function extractKeywords(text: string, title = '', limit = 8): string[] {
  const freq = new Map<string, number>();
  // Title tokens weigh more.
  for (const w of tokenize(title)) freq.set(w, (freq.get(w) ?? 0) + 3);
  for (const w of tokenize(text)) freq.set(w, (freq.get(w) ?? 0) + 1);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([w]) => w);
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 30 && s.length < 400);
}

export function extractiveSummary(
  text: string,
  title = '',
  maxSentences = 3,
): { summary: string; keywords: string[] } {
  const keywords = extractKeywords(text, title, 10);
  const kwSet = new Set(keywords);
  const sentences = splitSentences(text).slice(0, 60);

  if (sentences.length === 0) {
    return {
      summary: text.slice(0, 240).trim() || title,
      keywords: keywords.slice(0, 8),
    };
  }

  const scored = sentences.map((s, i) => {
    const words = tokenize(s);
    const hits = words.filter((w) => kwSet.has(w)).length;
    // Reward keyword density and slight recency-of-position (earlier = better).
    const positionBoost = 1 - i / (sentences.length * 2);
    const score = (hits / Math.max(words.length, 1)) * 2 + positionBoost;
    return { s, i, score };
  });

  const chosen = scored
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.s);

  return { summary: chosen.join(' '), keywords: keywords.slice(0, 8) };
}

/** Very rough intent/category guess from keywords + domain. */
export function guessIntent(
  keywords: string[],
  domain: string,
): { intent: import('./types').Intent; category: string } {
  const kw = keywords.join(' ');
  const has = (re: RegExp) => re.test(kw) || re.test(domain);
  if (has(/price|pricing|buy|cart|deal|shop|amazon|ebay|checkout/)) {
    return { intent: 'shopping', category: 'Shopping' };
  }
  if (has(/docs?|api|reference|guide|tutorial|documentation|sdk/)) {
    return { intent: 'reference', category: 'Documentation' };
  }
  if (has(/github|jira|confluence|slack|figma|notion|linear/)) {
    return { intent: 'work', category: 'Work' };
  }
  if (has(/how|why|what|research|study|paper|arxiv/)) {
    return { intent: 'research', category: 'Research' };
  }
  if (has(/news|blog|article|medium|substack/)) {
    return { intent: 'reading', category: 'Reading' };
  }
  return { intent: 'other', category: 'General' };
}
