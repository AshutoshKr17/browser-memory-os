import { useCallback, useEffect, useRef, useState } from 'react';
import {
  sendMessage,
  type RecentResponse,
  type SearchResponse,
  type StatsResponse,
} from '../shared/messaging';
import type { PageMemory, SearchResult, SavedSession } from '../shared/types';
import { ChatView } from './components/ChatView';
import { MemoryRow } from './components/MemoryRow';
import { ProjectsView } from './components/ProjectsView';
import { SettingsView } from './components/SettingsView';

type Tab = 'search' | 'chat' | 'projects' | 'sessions' | 'settings';

const TABS: { id: Tab; label: string }[] = [
  { id: 'search', label: 'Search' },
  { id: 'chat', label: 'Ask AI' },
  { id: 'projects', label: 'Projects' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'settings', label: 'Settings' },
];

export function App() {
  const [tab, setTab] = useState<Tab>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [recent, setRecent] = useState<PageMemory[]>([]);
  const [sel, setSel] = useState(0);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const openMemory = useCallback((id: number) => {
    sendMessage({ type: 'OPEN_MEMORY', memoryId: id }).then(() => window.close());
  }, []);

  useEffect(() => {
    sendMessage<RecentResponse>({ type: 'RECENT', limit: 12 }).then((r) => setRecent(r.memories));
    sendMessage<StatsResponse>({ type: 'STATS' }).then(setStats);
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (tab !== 'search') return;
    if (debounce.current) clearTimeout(debounce.current);
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounce.current = setTimeout(async () => {
      try {
        const res = await sendMessage<SearchResponse>({ type: 'SEARCH', query });
        setResults(res.results);
        setSel(0);
      } finally {
        setLoading(false);
      }
    }, 180);
  }, [query, tab]);

  const list = query.trim() ? results.map((r) => r.memory) : recent;

  function onKeyDown(e: React.KeyboardEvent) {
    if (tab !== 'search') return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, list.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      const m = list[sel];
      if (m?.id != null) openMemory(m.id);
    }
  }

  return (
    <div className="app">
      <div className="search-wrap">
        <div className="search-box">
          <span className="search-icon">⌕</span>
          <input
            ref={inputRef}
            value={query}
            placeholder="Search your browser memory…"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => setTab('search')}
          />
          {loading && <span className="spinner" />}
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? 'active' : ''}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="body">
        {tab === 'search' && (
          <SearchResults
            query={query}
            results={results}
            recent={recent}
            sel={sel}
            loading={loading}
            onOpen={openMemory}
          />
        )}
        {tab === 'chat' && <ChatView onOpen={openMemory} />}
        {tab === 'projects' && <ProjectsView />}
        {tab === 'sessions' && <SessionsView onOpen={openMemory} />}
        {tab === 'settings' && <SettingsView />}
      </div>

      {stats && (
        <div className="footer">
          <span>
            <b>{stats.total}</b> memories
          </span>
          <span>
            <b>{stats.embedded}</b> indexed
          </span>
          <span>
            <b>{stats.projects}</b> projects
          </span>
          <span>
            <b>{stats.domains}</b> sites
          </span>
        </div>
      )}
    </div>
  );
}

function SearchResults({
  query,
  results,
  recent,
  sel,
  loading,
  onOpen,
}: {
  query: string;
  results: SearchResult[];
  recent: PageMemory[];
  sel: number;
  loading: boolean;
  onOpen: (id: number) => void;
}) {
  if (query.trim()) {
    if (loading && results.length === 0)
      return (
        <div className="empty">
          <span className="spinner" /> searching…
        </div>
      );
    if (results.length === 0)
      return (
        <div className="empty">
          <div className="big">🔍</div>
          No memories match "{query}". Keep browsing — everything you read gets
          remembered.
        </div>
      );
    return (
      <>
        <div className="section-label">Results</div>
        {results.map((r, i) => (
          <MemoryRow
            key={r.memory.id}
            memory={r.memory}
            score={r.score}
            matchType={r.matchType}
            selected={i === sel}
            onOpen={onOpen}
          />
        ))}
      </>
    );
  }

  if (recent.length === 0)
    return (
      <div className="empty">
        <div className="big">🧠</div>
        Your browser memory is empty. Visit a few pages and they&apos;ll appear
        here — then you can safely close tabs.
      </div>
    );

  return (
    <>
      <div className="section-label">Recent</div>
      {recent.map((m, i) => (
        <MemoryRow key={m.id} memory={m} selected={i === sel} onOpen={onOpen} />
      ))}
    </>
  );
}

function SessionsView({ onOpen }: { onOpen: (id: number) => void }) {
  const [name, setName] = useState('');
  const [ok, setOk] = useState(false);
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  void onOpen;

  const load = useCallback(() => {
    sendMessage<SavedSession[]>({ type: 'LIST_SESSIONS' }).then(setSessions).catch(() => setSessions([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    const n = name.trim() || `Session ${new Date().toLocaleString()}`;
    await sendMessage({ type: 'SAVE_SESSION', name: n });
    setName('');
    setOk(true);
    setTimeout(() => setOk(false), 1500);
    load();
  }

  async function restore(id?: number) {
    if (id == null) return;
    await sendMessage({ type: 'RESTORE_SESSION', sessionId: id });
    window.close();
  }

  async function remove(id?: number) {
    if (id == null) return;
    await sendMessage({ type: 'DELETE_SESSION', sessionId: id });
    load();
  }

  return (
    <div className="settings">
      <div className="section-label" style={{ padding: '4px 0' }}>
        Save current window
      </div>
      <div className="field" style={{ display: 'flex', gap: 8 }}>
        <input
          value={name}
          placeholder="Session name (optional)"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
        <button className="primary-btn" onClick={save}>
          Save
        </button>
      </div>
      {ok && <div style={{ color: 'var(--green)', fontSize: 12 }}>Session saved ✓</div>}

      <div className="section-label" style={{ padding: '10px 0 2px' }}>
        Saved sessions
      </div>
      {sessions.length === 0 ? (
        <div className="empty" style={{ padding: '20px' }}>
          No saved sessions yet.
        </div>
      ) : (
        sessions.map((s) => (
          <div className="project-card" key={s.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0 }}>{s.name}</h4>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="primary-btn"
                  style={{ padding: '4px 10px', fontSize: 12 }}
                  onClick={() => restore(s.id)}
                >
                  Restore
                </button>
                <button
                  style={{
                    padding: '4px 8px',
                    fontSize: 12,
                    background: 'var(--bg-hover)',
                    color: 'var(--text-dim)',
                    border: 0,
                    borderRadius: 8,
                    cursor: 'pointer',
                  }}
                  onClick={() => remove(s.id)}
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="domains">
              {s.tabs.length} tabs · {new Date(s.createdAt).toLocaleDateString()}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
