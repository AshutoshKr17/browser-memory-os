import {
  allEmbeddedMemories,
  db,
  getSettings,
  saveSettings,
  upsertMemoryByUrl,
} from '../shared/db';
import { findDuplicate, type OpenTabRef } from '../shared/dedup';
import { llmChat, llmSummarize } from '../shared/llm';
import type {
  ChatResponse,
  EmbedResponse,
  ExtractedPage,
  Message,
  MessageResponse,
  RecentResponse,
  SearchResponse,
  StatsResponse,
} from '../shared/messaging';
import { reclusterProjects } from '../shared/projects';
import { runSearch } from '../shared/search';
import { extractiveSummary, guessIntent } from '../shared/summarize';
import type { ChatMessage, PageMemory } from '../shared/types';
import { getDomain, isCapturableUrl, normalizeUrl } from '../shared/url';

/* ------------------------------------------------------------------ *
 * Offscreen ML worker lifecycle
 * ------------------------------------------------------------------ */

const OFFSCREEN_PATH = 'src/offscreen/offscreen.html';
let creatingOffscreen: Promise<void> | null = null;

async function ensureOffscreen(): Promise<void> {
  const existing = await chrome.offscreen.hasDocument?.();
  if (existing) return;
  if (creatingOffscreen) return creatingOffscreen;
  creatingOffscreen = chrome.offscreen
    .createDocument({
      url: OFFSCREEN_PATH,
      reasons: [chrome.offscreen.Reason.WORKERS],
      justification: 'Run local embedding model (Transformers.js / ONNX WASM).',
    })
    .finally(() => {
      creatingOffscreen = null;
    });
  return creatingOffscreen;
}

/** Ask the offscreen doc to embed texts. */
async function embedTexts(texts: string[]): Promise<number[][]> {
  await ensureOffscreen();
  const res = await chrome.runtime.sendMessage({ type: 'EMBED', texts } satisfies Message);
  if (!res?.ok) throw new Error(res?.error ?? 'embed failed');
  return (res.data as EmbedResponse).vectors;
}

/* ------------------------------------------------------------------ *
 * Capture + processing pipeline
 * ------------------------------------------------------------------ */

interface PendingTask {
  normalizedUrl: string;
  tabId?: number;
}
const taskQueue: PendingTask[] = [];
let processing = false;
let reclusterTimer: ReturnType<typeof setTimeout> | null = null;

async function handleExtracted(page: ExtractedPage, tabId?: number): Promise<void> {
  const settings = await getSettings();
  if (!settings.captureEnabled) return;
  if (!isCapturableUrl(page.url)) return;

  const domain = getDomain(page.url);
  if (settings.blocklist.some((b) => domain.includes(b))) return;

  const normalizedUrl = normalizeUrl(page.url);
  const now = Date.now();
  const combinedText = [page.description, page.headings.join('. '), page.text]
    .filter(Boolean)
    .join('\n');

  await upsertMemoryByUrl(normalizedUrl, (existing) => {
    if (existing) {
      return {
        ...existing,
        title: page.title || existing.title,
        text: combinedText || existing.text,
        favicon: page.favicon ?? existing.favicon,
        visitCount: existing.visitCount + 1,
        lastVisitedAt: now,
        // Re-process only if content meaningfully changed.
        status: combinedText.length > existing.text.length + 200 ? 'pending' : existing.status,
      };
    }
    return {
      url: page.url,
      normalizedUrl,
      title: page.title,
      text: combinedText,
      summary: '',
      keywords: [],
      tags: [],
      category: 'General',
      intent: 'other',
      domain,
      favicon: page.favicon,
      status: 'pending',
      visitCount: 1,
      createdAt: now,
      lastVisitedAt: now,
    } satisfies PageMemory;
  });

  enqueue({ normalizedUrl, tabId });
}

function enqueue(task: PendingTask): void {
  if (!taskQueue.some((t) => t.normalizedUrl === task.normalizedUrl)) {
    taskQueue.push(task);
  }
  void drainQueue();
}

async function drainQueue(): Promise<void> {
  if (processing) return;
  processing = true;
  try {
    while (taskQueue.length) {
      const task = taskQueue.shift()!;
      try {
        await processTask(task);
      } catch (e) {
        console.warn('[BMO] processTask failed:', (e as Error).message);
      }
    }
  } finally {
    processing = false;
  }
  scheduleRecluster();
}

async function processTask(task: PendingTask): Promise<void> {
  const memory = await db.pages.where('normalizedUrl').equals(task.normalizedUrl).first();
  if (!memory || memory.id == null) return;

  const settings = await getSettings();

  // 1. Summary + keywords (LLM if configured, else extractive).
  if (memory.status === 'pending') {
    const llm = await llmSummarize(settings, memory.title, memory.text);
    if (llm) {
      memory.summary = llm.summary;
      memory.keywords = llm.keywords;
      memory.category = llm.category;
      memory.intent = (llm.intent as PageMemory['intent']) ?? 'other';
    } else {
      const { summary, keywords } = extractiveSummary(memory.text, memory.title);
      const { intent, category } = guessIntent(keywords, memory.domain);
      memory.summary = summary;
      memory.keywords = keywords;
      memory.category = category;
      memory.intent = intent;
    }
    memory.status = 'summarized';
    await db.pages.put(memory);
  }

  // 2. Embedding over title + summary + keywords.
  const embedInput = `${memory.title}. ${memory.summary}. ${memory.keywords.join(', ')}`;
  try {
    const [vector] = await embedTexts([embedInput]);
    memory.embedding = vector;
    memory.status = 'embedded';
    await db.pages.update(memory.id, { embedding: vector, status: 'embedded' });
  } catch (e) {
    memory.status = 'failed';
    await db.pages.update(memory.id, { status: 'failed' });
    console.warn('[BMO] embedding failed:', (e as Error).message);
    return;
  }

  // 3. Duplicate detection for the tab that triggered this.
  await maybePromptDuplicate(memory, task.tabId);
}

function scheduleRecluster(): void {
  if (reclusterTimer) clearTimeout(reclusterTimer);
  reclusterTimer = setTimeout(() => {
    reclusterProjects().catch((e) => console.warn('[BMO] recluster:', (e as Error).message));
  }, 8000);
}

/* ------------------------------------------------------------------ *
 * Duplicate "switch to existing tab?" prompt
 * ------------------------------------------------------------------ */

async function getOpenTabRefs(): Promise<OpenTabRef[]> {
  const tabs = await chrome.tabs.query({});
  const refs: OpenTabRef[] = [];
  for (const t of tabs) {
    if (t.id == null || !t.url || !isCapturableUrl(t.url)) continue;
    const normalizedUrl = normalizeUrl(t.url);
    const memory = await db.pages.where('normalizedUrl').equals(normalizedUrl).first();
    refs.push({ tabId: t.id, normalizedUrl, title: t.title ?? '', memory });
  }
  return refs;
}

async function maybePromptDuplicate(memory: PageMemory, tabId?: number): Promise<void> {
  if (tabId == null) return;
  const settings = await getSettings();
  if (settings.dedupDomainMuted.includes(memory.domain)) return;

  const openTabs = await getOpenTabRefs();
  const match = findDuplicate(
    {
      normalizedUrl: memory.normalizedUrl,
      url: memory.url,
      title: memory.title,
      embedding: memory.embedding,
    },
    openTabs,
    settings.dedupThreshold,
    tabId,
  );
  if (!match || match.openTabId == null) return;

  // Inject a lightweight banner into the current tab offering to switch.
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: injectDedupBanner,
      args: [
        {
          existingTabId: match.openTabId,
          title: match.memory.title,
          similarity: Math.round(match.similarity * 100),
          domain: memory.domain,
        },
      ],
    });
  } catch (e) {
    console.warn('[BMO] banner inject failed:', (e as Error).message);
  }
}

/** Runs in the page. Self-contained (no imports) since it is injected. */
function injectDedupBanner(info: {
  existingTabId: number;
  title: string;
  similarity: number;
  domain: string;
}): void {
  const ID = '__bmo_dedup_banner__';
  if (document.getElementById(ID)) return;
  const bar = document.createElement('div');
  bar.id = ID;
  bar.style.cssText =
    'position:fixed;top:16px;right:16px;z-index:2147483647;max-width:340px;background:#111827;color:#fff;font:13px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;padding:14px 16px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.08)';
  bar.innerHTML =
    `<div style="font-weight:600;margin-bottom:4px">Looks like you already have this open</div>` +
    `<div style="opacity:.8;margin-bottom:10px">${info.similarity}% match · "${info.title.replace(/</g, '&lt;').slice(0, 60)}"</div>` +
    `<div style="display:flex;gap:8px;flex-wrap:wrap">` +
    `<button id="${ID}_switch" style="background:#6366f1;color:#fff;border:0;border-radius:8px;padding:6px 12px;cursor:pointer;font-weight:600">Switch to it</button>` +
    `<button id="${ID}_keep" style="background:rgba(255,255,255,.1);color:#fff;border:0;border-radius:8px;padding:6px 12px;cursor:pointer">Keep both</button>` +
    `<button id="${ID}_mute" style="background:transparent;color:#9ca3af;border:0;padding:6px 4px;cursor:pointer;font-size:12px">Mute ${info.domain}</button>` +
    `</div>`;
  document.body.appendChild(bar);
  const close = () => bar.remove();
  document.getElementById(`${ID}_switch`)?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: '__BMO_SWITCH_TAB', tabId: info.existingTabId });
    close();
  });
  document.getElementById(`${ID}_keep`)?.addEventListener('click', close);
  document.getElementById(`${ID}_mute`)?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: '__BMO_MUTE_DOMAIN', domain: info.domain });
    close();
  });
  setTimeout(close, 12000);
}

/* ------------------------------------------------------------------ *
 * Search / chat / stats handlers
 * ------------------------------------------------------------------ */

async function handleSearch(query: string): Promise<SearchResponse> {
  const memories = await allEmbeddedMemories();
  let queryEmbedding: number[] | undefined;
  if (query.trim()) {
    try {
      [queryEmbedding] = await embedTexts([query]);
    } catch {
      /* fall back to lexical only */
    }
  }
  const results = runSearch({ query, queryEmbedding, memories, limit: 25 });
  return { results };
}

async function handleRecent(limit: number): Promise<RecentResponse> {
  const memories = await db.pages.orderBy('lastVisitedAt').reverse().limit(limit).toArray();
  return { memories };
}

async function handleChat(_history: ChatMessage[], query: string): Promise<ChatResponse> {
  const { results } = await handleSearch(query);
  const top = results.slice(0, 6).map((r) => r.memory);
  const settings = await getSettings();

  const llm = await llmChat(settings, query, top);
  if (llm) {
    return { message: { role: 'assistant', content: llm, citations: top } };
  }

  // Template fallback — still useful without any LLM.
  if (top.length === 0) {
    return {
      message: {
        role: 'assistant',
        content: "I couldn't find anything matching that in your memory yet.",
      },
    };
  }
  const lines = top
    .slice(0, 5)
    .map(
      (m) =>
        `• ${m.title} — ${new Date(m.lastVisitedAt).toLocaleDateString()} (${m.domain})`,
    )
    .join('\n');
  return {
    message: {
      role: 'assistant',
      content: `Found ${top.length} related ${top.length === 1 ? 'page' : 'pages'}:\n${lines}\n\nClick any result to reopen it.`,
      citations: top,
    },
  };
}

async function handleStats(): Promise<StatsResponse> {
  const [total, embedded, pending, projects] = await Promise.all([
    db.pages.count(),
    db.pages.where('status').equals('embedded').count(),
    db.pages.where('status').anyOf('pending', 'summarized').count(),
    db.projects.count(),
  ]);
  const domains = new Set((await db.pages.toArray()).map((m) => m.domain)).size;
  return { total, embedded, pending, projects, domains };
}

async function openMemory(memoryId: number): Promise<void> {
  const memory = await db.pages.get(memoryId);
  if (!memory) return;
  // Focus an existing tab if the page is already open, else create one.
  const normalized = memory.normalizedUrl;
  const tabs = await chrome.tabs.query({});
  const open = tabs.find((t) => t.url && normalizeUrl(t.url) === normalized);
  if (open?.id != null) {
    await chrome.tabs.update(open.id, { active: true });
    if (open.windowId != null) await chrome.windows.update(open.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: memory.url });
  }
  await db.pages.update(memoryId, { lastVisitedAt: Date.now() });
}

async function saveSession(name: string): Promise<void> {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const saved = tabs
    .filter((t) => t.url && isCapturableUrl(t.url))
    .map((t) => ({ url: t.url!, title: t.title ?? t.url!, favicon: t.favIconUrl }));
  await db.sessions.add({ name, tabs: saved, createdAt: Date.now() });
}

async function restoreSession(sessionId: number): Promise<void> {
  const session = await db.sessions.get(sessionId);
  if (!session) return;
  const win = await chrome.windows.create({ focused: true });
  if (win?.id == null) return;
  const windowId = win.id;
  for (const t of session.tabs) {
    await chrome.tabs.create({ url: t.url, windowId, active: false });
  }
  // Remove the blank tab Chrome created with the new window.
  const blanks = await chrome.tabs.query({ windowId, url: 'chrome://newtab/' });
  for (const b of blanks) if (b.id != null) await chrome.tabs.remove(b.id);
}

/* ------------------------------------------------------------------ *
 * Message router
 * ------------------------------------------------------------------ */

type RawMessage = Message | { type: '__BMO_SWITCH_TAB'; tabId: number } | { type: '__BMO_MUTE_DOMAIN'; domain: string };

chrome.runtime.onMessage.addListener((msg: RawMessage, sender, sendResponse) => {
  // Offscreen owns these; ignore so it can respond.
  if (msg.type === 'EMBED' || msg.type === 'SUMMARIZE_LOCAL') return;

  const reply = (p: Promise<unknown>) => {
    p.then((data) => sendResponse({ ok: true, data } satisfies MessageResponse)).catch((e) =>
      sendResponse({ ok: false, error: (e as Error).message } satisfies MessageResponse),
    );
    return true;
  };

  switch (msg.type) {
    case 'PAGE_EXTRACTED':
      return reply(handleExtracted(msg.payload, sender.tab?.id));
    case 'SEARCH':
      return reply(handleSearch(msg.query));
    case 'RECENT':
      return reply(handleRecent(msg.limit ?? 12));
    case 'CHAT':
      return reply(handleChat(msg.history, msg.query));
    case 'GET_SETTINGS':
      return reply(getSettings());
    case 'SET_SETTINGS':
      return reply(saveSettings(msg.patch));
    case 'OPEN_MEMORY':
      return reply(openMemory(msg.memoryId));
    case 'SAVE_SESSION':
      return reply(saveSession(msg.name));
    case 'LIST_SESSIONS':
      return reply(db.sessions.orderBy('createdAt').reverse().toArray());
    case 'RESTORE_SESSION':
      return reply(restoreSession(msg.sessionId));
    case 'DELETE_SESSION':
      return reply(db.sessions.delete(msg.sessionId));
    case 'LIST_PROJECTS':
      return reply(db.projects.orderBy('updatedAt').reverse().toArray());
    case 'RECLUSTER':
      return reply(reclusterProjects());
    case 'STATS':
      return reply(handleStats());
    case '__BMO_SWITCH_TAB':
      return reply(
        (async () => {
          const t = await chrome.tabs.get(msg.tabId).catch(() => null);
          if (t?.id != null) {
            await chrome.tabs.update(t.id, { active: true });
            if (t.windowId != null) await chrome.windows.update(t.windowId, { focused: true });
            if (sender.tab?.id != null) await chrome.tabs.remove(sender.tab.id);
          }
        })(),
      );
    case '__BMO_MUTE_DOMAIN':
      return reply(
        (async () => {
          const s = await getSettings();
          if (!s.dedupDomainMuted.includes(msg.domain)) {
            await saveSettings({ dedupDomainMuted: [...s.dedupDomainMuted, msg.domain] });
          }
        })(),
      );
    default:
      return; // not handled here
  }
});

/* ------------------------------------------------------------------ *
 * Tab lifecycle — the "detect tabs" layer
 * ------------------------------------------------------------------ */

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab?.url || !isCapturableUrl(tab.url)) return;
  const normalized = normalizeUrl(tab.url);
  const memory = await db.pages.where('normalizedUrl').equals(normalized).first();
  if (memory?.id != null) {
    await db.pages.update(memory.id, { lastVisitedAt: Date.now() });
  }
});

// Kick the ML worker awake on install so the first search is fast.
chrome.runtime.onInstalled.addListener(() => {
  ensureOffscreen().catch(() => void 0);
});
chrome.runtime.onStartup.addListener(() => {
  ensureOffscreen().catch(() => void 0);
});
