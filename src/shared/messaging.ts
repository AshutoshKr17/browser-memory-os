import type { ChatMessage, DedupMatch, PageMemory, SearchResult, Settings } from './types';

/**
 * A small typed message bus over chrome.runtime messaging.
 * Every message has a `type` discriminator and a matching response shape.
 */

export interface ExtractedPage {
  url: string;
  title: string;
  text: string;
  description: string;
  headings: string[];
  favicon?: string;
}

export type Message =
  // content -> background
  | { type: 'PAGE_EXTRACTED'; payload: ExtractedPage; tabId?: number }
  // popup -> background
  | { type: 'SEARCH'; query: string }
  | { type: 'RECENT'; limit?: number }
  | { type: 'CHAT'; history: ChatMessage[]; query: string }
  | { type: 'GET_SETTINGS' }
  | { type: 'SET_SETTINGS'; patch: Partial<Settings> }
  | { type: 'OPEN_MEMORY'; memoryId: number }
  | { type: 'SAVE_SESSION'; name: string }
  | { type: 'LIST_SESSIONS' }
  | { type: 'RESTORE_SESSION'; sessionId: number }
  | { type: 'DELETE_SESSION'; sessionId: number }
  | { type: 'LIST_PROJECTS' }
  | { type: 'RECLUSTER' }
  | { type: 'STATS' }
  // background -> offscreen
  | { type: 'EMBED'; texts: string[] }
  | { type: 'SUMMARIZE_LOCAL'; text: string; title: string };

export type MessageResponse =
  | { ok: true; data?: unknown }
  | { ok: false; error: string };

export interface SearchResponse {
  results: SearchResult[];
}
export interface RecentResponse {
  memories: PageMemory[];
}
export interface ChatResponse {
  message: ChatMessage;
}
export interface EmbedResponse {
  vectors: number[][];
}
export interface SummarizeResponse {
  summary: string;
  keywords: string[];
}
export interface DedupResponse {
  match: DedupMatch | null;
}
export interface StatsResponse {
  total: number;
  embedded: number;
  pending: number;
  projects: number;
  domains: number;
}

export function sendMessage<T = unknown>(msg: Message): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (res: MessageResponse) => {
      const err = chrome.runtime.lastError;
      if (err) return reject(new Error(err.message));
      if (!res) return reject(new Error('No response'));
      if (res.ok) resolve(res.data as T);
      else reject(new Error(res.error));
    });
  });
}
