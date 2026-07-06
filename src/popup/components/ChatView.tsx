import { useRef, useState } from 'react';
import { sendMessage, type ChatResponse } from '../../shared/messaging';
import type { ChatMessage } from '../../shared/types';

interface Props {
  onOpen: (id: number) => void;
}

export function ChatView({ onOpen }: Props) {
  const [history, setHistory] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        'Ask me anything about pages you\'ve visited.\nTry: "that kubernetes article from last week" or "everything about AWS".',
    },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const scroll = () =>
    requestAnimationFrame(() => {
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    });

  async function send() {
    const q = input.trim();
    if (!q || busy) return;
    const next = [...history, { role: 'user', content: q } as ChatMessage];
    setHistory(next);
    setInput('');
    setBusy(true);
    scroll();
    try {
      const res = await sendMessage<ChatResponse>({ type: 'CHAT', history: next, query: q });
      setHistory([...next, res.message]);
    } catch (e) {
      setHistory([
        ...next,
        { role: 'assistant', content: `Something went wrong: ${(e as Error).message}` },
      ]);
    } finally {
      setBusy(false);
      scroll();
    }
  }

  return (
    <div className="chat">
      <div className="chat-log" ref={logRef}>
        {history.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.content}
            {m.citations?.map(
              (c) =>
                c.id != null && (
                  <div key={c.id} className="citation" onClick={() => onOpen(c.id!)}>
                    ↗ {c.title}
                  </div>
                ),
            )}
          </div>
        ))}
        {busy && (
          <div className="bubble assistant">
            <span className="spinner" /> thinking…
          </div>
        )}
      </div>
      <div className="chat-input">
        <input
          value={input}
          placeholder="Ask your browser memory…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <button onClick={send} disabled={busy}>
          Ask
        </button>
      </div>
    </div>
  );
}
