import type { DedupMatch, PageMemory } from './types';
import { cosineSimilarity } from './vector';

/** A currently-open tab paired with what we remember about it. */
export interface OpenTabRef {
  tabId: number;
  normalizedUrl: string;
  title: string;
  memory?: PageMemory;
}

/** Cheap character-trigram Jaccard for title similarity (no embedding needed). */
export function titleSimilarity(a: string, b: string): number {
  const grams = (s: string) => {
    const norm = s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const set = new Set<string>();
    for (let i = 0; i < norm.length - 2; i++) set.add(norm.slice(i, i + 3));
    return set;
  };
  const ga = grams(a);
  const gb = grams(b);
  if (ga.size === 0 || gb.size === 0) return 0;
  let inter = 0;
  for (const g of ga) if (gb.has(g)) inter++;
  return inter / (ga.size + gb.size - inter);
}

export interface DedupThresholds {
  /** At/above this => treated as a duplicate ("switch to it"). */
  duplicate: number;
  /** At/above this (but below duplicate) => a softer "related page" nudge. */
  related: number;
}

/**
 * Decide whether a newly opened page is a duplicate of, or strongly related
 * to, another open tab. Two tiers:
 *   - exact/normalized URL, or high similarity  -> kind 'duplicate'
 *   - moderate similarity                        -> kind 'related'
 * Order of confidence: exact url > normalized url > semantic > title.
 */
export function findDuplicate(
  candidate: { normalizedUrl: string; url: string; title: string; embedding?: number[] },
  openTabs: OpenTabRef[],
  thresholds: DedupThresholds,
  candidateTabId?: number,
): DedupMatch | null {
  let best: DedupMatch | null = null;

  for (const tab of openTabs) {
    if (tab.tabId === candidateTabId) continue; // don't match the tab against itself

    // 1. Exact / normalized URL => always a duplicate.
    if (tab.normalizedUrl === candidate.normalizedUrl && tab.memory) {
      return {
        memory: tab.memory,
        openTabId: tab.tabId,
        similarity: 1,
        kind: 'duplicate',
        reason: 'normalized-url',
      };
    }

    if (!tab.memory) continue;

    // 2. Semantic content similarity.
    let sim = 0;
    let reason: DedupMatch['reason'] = 'content-similar';
    if (candidate.embedding && tab.memory.embedding) {
      sim = cosineSimilarity(candidate.embedding, tab.memory.embedding);
    }

    // 3. Title similarity as a fallback / booster.
    const tSim = titleSimilarity(candidate.title, tab.title || tab.memory.title);
    if (tSim > sim) {
      sim = tSim;
      reason = 'title-similar';
    }

    // Below the "related" floor => not interesting.
    if (sim < thresholds.related) continue;

    const kind: DedupMatch['kind'] = sim >= thresholds.duplicate ? 'duplicate' : 'related';

    // Prefer higher similarity; and always prefer a duplicate over a related.
    const better =
      !best ||
      (kind === 'duplicate' && best.kind === 'related') ||
      (kind === best.kind && sim > best.similarity);
    if (better) {
      best = { memory: tab.memory, openTabId: tab.tabId, similarity: sim, kind, reason };
    }
  }

  return best;
}
