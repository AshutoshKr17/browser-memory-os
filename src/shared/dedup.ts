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

/**
 * Decide whether a newly opened page is already open in another tab.
 * Order of confidence: exact url > normalized url > semantic > title.
 */
export function findDuplicate(
  candidate: { normalizedUrl: string; url: string; title: string; embedding?: number[] },
  openTabs: OpenTabRef[],
  threshold: number,
  candidateTabId?: number,
): DedupMatch | null {
  let best: DedupMatch | null = null;

  for (const tab of openTabs) {
    if (tab.tabId === candidateTabId) continue; // don't match the tab against itself

    // 1. Exact / normalized URL.
    if (tab.normalizedUrl === candidate.normalizedUrl && tab.memory) {
      return {
        memory: tab.memory,
        openTabId: tab.tabId,
        similarity: 1,
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

    if (sim >= threshold && (!best || sim > best.similarity)) {
      best = { memory: tab.memory, openTabId: tab.tabId, similarity: sim, reason };
    }
  }

  return best;
}
