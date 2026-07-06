import Dexie, { type Table } from 'dexie';
import {
  DEFAULT_SETTINGS,
  type PageMemory,
  type Project,
  type SavedSession,
  type Settings,
} from './types';

/**
 * Dexie (IndexedDB) is our "browser memory". A few thousand pages fit
 * comfortably and cosine similarity over them is fast enough to run in-memory.
 */
class MemoryDB extends Dexie {
  pages!: Table<PageMemory, number>;
  projects!: Table<Project, number>;
  sessions!: Table<SavedSession, number>;
  meta!: Table<{ key: string; value: unknown }, string>;

  constructor() {
    super('browser-memory-os');
    this.version(1).stores({
      // Indexed fields only; embedding/text live on the row but aren't indexed.
      pages: '++id, normalizedUrl, domain, status, lastVisitedAt, projectId',
      projects: '++id, name, updatedAt',
      sessions: '++id, name, createdAt',
      meta: 'key',
    });
  }
}

export const db = new MemoryDB();

export async function getSettings(): Promise<Settings> {
  const row = await db.meta.get('settings');
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await db.meta.put({ key: 'settings', value: next });
  return next;
}

export async function upsertMemoryByUrl(
  normalizedUrl: string,
  build: (existing?: PageMemory) => PageMemory,
): Promise<PageMemory> {
  return db.transaction('rw', db.pages, async () => {
    const existing = await db.pages.where('normalizedUrl').equals(normalizedUrl).first();
    const next = build(existing);
    const id = await db.pages.put(existing ? { ...next, id: existing.id } : next);
    return { ...next, id };
  });
}

export async function getPendingMemories(limit = 5): Promise<PageMemory[]> {
  // status "pending" -> needs summary; "summarized" -> needs embedding.
  const pending = await db.pages.where('status').anyOf('pending', 'summarized').limit(limit).toArray();
  return pending;
}

export async function allEmbeddedMemories(): Promise<PageMemory[]> {
  return db.pages.where('status').equals('embedded').toArray();
}
