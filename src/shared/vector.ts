/** Cosine similarity for L2-normalized or arbitrary vectors. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Mean vector of a set of embeddings (a project centroid). */
export function centroid(vectors: number[][]): number[] {
  if (vectors.length === 0) return [];
  const dim = vectors[0].length;
  const out = new Array(dim).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) out[i] += v[i];
  }
  for (let i = 0; i < dim; i++) out[i] /= vectors.length;
  return out;
}

/** Ranked cosine matches against a corpus. */
export function topK<T extends { embedding?: number[] }>(
  query: number[],
  corpus: T[],
  k: number,
): { item: T; score: number }[] {
  const scored = corpus
    .filter((c) => c.embedding && c.embedding.length === query.length)
    .map((item) => ({ item, score: cosineSimilarity(query, item.embedding as number[]) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}
