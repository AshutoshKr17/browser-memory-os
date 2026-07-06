/**
 * Core domain types for Browser Memory OS.
 *
 * The mental model: every page a user visits becomes a durable "memory" so the
 * browser can recall it later. Tabs are ephemeral; memories are forever.
 */

export type ProcessingStatus =
  | 'pending' // captured, not yet summarized/embedded
  | 'summarized' // has summary + tags
  | 'embedded' // has vector, fully searchable
  | 'failed';

export type Intent = 'research' | 'reference' | 'shopping' | 'reading' | 'work' | 'other';

/** A single remembered page. */
export interface PageMemory {
  id?: number;
  url: string;
  /** URL with tracking params / fragments stripped, used for dedup. */
  normalizedUrl: string;
  title: string;
  /** Full extracted text (trimmed). Kept for re-processing / full-text search. */
  text: string;
  /** Short AI/extractive summary. */
  summary: string;
  keywords: string[];
  tags: string[];
  category: string;
  intent: Intent;
  domain: string;
  favicon?: string;
  /** Embedding vector (Float32 stored as regular array for Dexie). */
  embedding?: number[];
  status: ProcessingStatus;
  /** Number of times we have seen this page. */
  visitCount: number;
  createdAt: number;
  lastVisitedAt: number;
  /** Associated project/session id, if clustered. */
  projectId?: number;
}

/** A cluster of related memories the user was working on. */
export interface Project {
  id?: number;
  name: string;
  /** Centroid embedding of member pages. */
  centroid?: number[];
  domains: string[];
  memoryIds: number[];
  createdAt: number;
  updatedAt: number;
}

/** Snapshot of open tabs the user can restore later. */
export interface SavedSession {
  id?: number;
  name: string;
  tabs: { url: string; title: string; favicon?: string }[];
  createdAt: number;
}

export interface SearchResult {
  memory: PageMemory;
  /** 0..1 combined relevance score. */
  score: number;
  /** How the match was found. */
  matchType: 'semantic' | 'keyword' | 'hybrid';
}

/** Result of a duplicate/related-page check for a newly opened URL. */
export interface DedupMatch {
  memory: PageMemory;
  openTabId?: number;
  similarity: number;
  /** 'duplicate' = essentially the same page; 'related' = strongly related. */
  kind: 'duplicate' | 'related';
  reason: 'exact-url' | 'normalized-url' | 'title-similar' | 'content-similar';
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Memories referenced in an assistant answer. */
  citations?: PageMemory[];
}

export interface Settings {
  captureEnabled: boolean;
  /** Domains to never capture. */
  blocklist: string[];
  /** Domains where "switch to existing" prompt is suppressed. */
  dedupDomainMuted: string[];
  /** Cosine/title similarity at/above which a page is treated as a duplicate. */
  dedupThreshold: number;
  /** Lower bar for surfacing a "you have a related page open" nudge. */
  relatedThreshold: number;
  /** Whether to show the softer "related page" nudge at all. */
  relatedEnabled: boolean;
  /** Which backend generates summaries. */
  llmProvider: 'local' | 'openai' | 'gemini' | 'ollama' | 'none';
  openaiApiKey?: string;
  geminiApiKey?: string;
  ollamaUrl?: string;
  ollamaModel?: string;
}

export const DEFAULT_SETTINGS: Settings = {
  captureEnabled: true,
  blocklist: [
    'localhost',
    'mail.google.com',
    'accounts.google.com',
    'chrome.google.com',
  ],
  dedupDomainMuted: [],
  dedupThreshold: 0.9,
  relatedThreshold: 0.72,
  relatedEnabled: true,
  llmProvider: 'local',
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'llama3',
};
