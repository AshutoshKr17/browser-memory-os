import { useEffect, useState } from 'react';
import { sendMessage } from '../../shared/messaging';
import type { Settings } from '../../shared/types';

export function SettingsView() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    sendMessage<Settings>({ type: 'GET_SETTINGS' }).then(setSettings);
  }, []);

  function update(patch: Partial<Settings>) {
    setSettings((s) => (s ? { ...s, ...patch } : s));
  }

  async function persist(patch: Partial<Settings>) {
    const next = await sendMessage<Settings>({ type: 'SET_SETTINGS', patch });
    setSettings(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  }

  if (!settings) return <div className="empty"><span className="spinner" /></div>;

  return (
    <div className="settings">
      <div className="toggle-row">
        <label style={{ margin: 0 }}>Capture pages I visit</label>
        <input
          type="checkbox"
          checked={settings.captureEnabled}
          onChange={(e) => persist({ captureEnabled: e.target.checked })}
        />
      </div>

      <div className="field">
        <label>AI provider (for summaries &amp; chat)</label>
        <select
          value={settings.llmProvider}
          onChange={(e) => persist({ llmProvider: e.target.value as Settings['llmProvider'] })}
        >
          <option value="local">Local (on-device, private)</option>
          <option value="openai">OpenAI</option>
          <option value="gemini">Gemini</option>
          <option value="ollama">Ollama (local server)</option>
          <option value="none">None (extractive only)</option>
        </select>
      </div>

      {settings.llmProvider === 'openai' && (
        <div className="field">
          <label>OpenAI API key</label>
          <input
            type="password"
            value={settings.openaiApiKey ?? ''}
            placeholder="sk-…"
            onChange={(e) => update({ openaiApiKey: e.target.value })}
            onBlur={(e) => persist({ openaiApiKey: e.target.value })}
          />
        </div>
      )}
      {settings.llmProvider === 'gemini' && (
        <div className="field">
          <label>Gemini API key</label>
          <input
            type="password"
            value={settings.geminiApiKey ?? ''}
            placeholder="AIza…"
            onChange={(e) => update({ geminiApiKey: e.target.value })}
            onBlur={(e) => persist({ geminiApiKey: e.target.value })}
          />
        </div>
      )}
      {settings.llmProvider === 'ollama' && (
        <>
          <div className="field">
            <label>Ollama URL</label>
            <input
              value={settings.ollamaUrl ?? ''}
              onChange={(e) => update({ ollamaUrl: e.target.value })}
              onBlur={(e) => persist({ ollamaUrl: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Ollama model</label>
            <input
              value={settings.ollamaModel ?? ''}
              onChange={(e) => update({ ollamaModel: e.target.value })}
              onBlur={(e) => persist({ ollamaModel: e.target.value })}
            />
          </div>
        </>
      )}

      <div className="field">
        <label>Duplicate threshold: {Math.round(settings.dedupThreshold * 100)}%</label>
        <input
          type="range"
          min={0.8}
          max={0.99}
          step={0.01}
          value={settings.dedupThreshold}
          onChange={(e) => update({ dedupThreshold: Number(e.target.value) })}
          onMouseUp={(e) => persist({ dedupThreshold: Number((e.target as HTMLInputElement).value) })}
        />
        <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
          At/above this similarity, a page counts as "already open".
        </div>
      </div>

      <div className="toggle-row">
        <label style={{ margin: 0 }}>Nudge me about related open tabs</label>
        <input
          type="checkbox"
          checked={settings.relatedEnabled}
          onChange={(e) => persist({ relatedEnabled: e.target.checked })}
        />
      </div>

      {settings.relatedEnabled && (
        <div className="field">
          <label>Related threshold: {Math.round(settings.relatedThreshold * 100)}%</label>
          <input
            type="range"
            min={0.5}
            max={Math.max(0.5, settings.dedupThreshold - 0.02)}
            step={0.01}
            value={settings.relatedThreshold}
            onChange={(e) => update({ relatedThreshold: Number(e.target.value) })}
            onMouseUp={(e) =>
              persist({ relatedThreshold: Number((e.target as HTMLInputElement).value) })
            }
          />
          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
            Lower = more "you have a related page open" suggestions.
          </div>
        </div>
      )}

      <div className="field">
        <label>Never capture (comma-separated domains)</label>
        <input
          value={settings.blocklist.join(', ')}
          onChange={(e) => update({ blocklist: e.target.value.split(',').map((s) => s.trim()) })}
          onBlur={(e) =>
            persist({ blocklist: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })
          }
        />
      </div>

      {saved && <div style={{ color: 'var(--green)', fontSize: 12 }}>Saved ✓</div>}
    </div>
  );
}
