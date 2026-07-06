import MiniSearch from 'minisearch';
import type { PageMemory, SearchResult } from './types';
import { cosineSimilarity } from './vector';

/**
 * Hybrid retrieval: semantic (cosine over embeddings) fused with lexical
 * (MiniSearch BM25-ish). Semantic finds "that kubernetes article"; lexical
 * nails exact terms and rare tokens. We blend both.
 */

function buildIndex(memories: PageMemory[]): MiniSearch<PageMemory> {
  const mini = new MiniSearch<PageMemory>({
    fields: ['title', 'summary', 'keywords', 'domain', 'text'],
    storeFields: ['id'],
    extractField: (doc, field) => {
      const v = (doc as unknown as Record<string, unknown>)[field];
      if (Array.isArray(v)) return v.join(' ');
      return (v as string) ?? '';
    },
    searchOptions: {
      boost: { title: 3, keywords: 2, summary: 1.5 },
      fuzzy: 0.2,
      prefix: true,
    },
  });
  mini.addAll(memories.filter((m) => m.id != null));
  return mini;
}

export interface RunSearchOpts {
  query: string;
  queryEmbedding?: number[];
  memories: PageMemory[];
  limit?: number;
  /** Weight of semantic vs lexical, 0..1. */
  semanticWeight?: number;
}

export function runSearch({
  query,
  queryEmbedding,
  memories,
  limit = 20,
  semanticWeight = 0.65,
}: RunSearchOpts): SearchResult[] {
  const byId = new Map<number, PageMemory>();
  for (const m of memories) if (m.id != null) byId.set(m.id, m);

  // --- lexical ---
  const lexical = new Map<number, number>();
  if (query.trim()) {
    const mini = buildIndex(memories);
    const hits = mini.search(query);
    const max = hits[0]?.score ?? 1;
    for (const h of hits) lexical.set(Number(h.id), max ? h.score / max : 0);
  }

  // --- semantic ---
  const semantic = new Map<number, number>();
  if (queryEmbedding && queryEmbedding.length) {
    for (const m of memories) {
      if (m.id == null || !m.embedding) continue;
      const s = cosineSimilarity(queryEmbedding, m.embedding);
      if (s > 0.15) semantic.set(m.id, s);
    }
  }

  // --- fuse ---
  const ids = new Set<number>([...lexical.keys(), ...semantic.keys()]);
  const results: SearchResult[] = [];
  for (const id of ids) {
    const lex = lexical.get(id) ?? 0;
    const sem = semantic.get(id) ?? 0;
    const inLex = lexical.has(id);
    const inSem = semantic.has(id);
    const score = semanticWeight * sem + (1 - semanticWeight) * lex;
    const memory = byId.get(id);
    if (!memory) continue;
    results.push({
      memory,
      score,
      matchType: inLex && inSem ? 'hybrid' : inSem ? 'semantic' : 'keyword',
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}
