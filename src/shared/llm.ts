import type { PageMemory, Settings } from './types';

/**
 * Optional LLM layer. Everything degrades gracefully: if no provider is
 * configured we fall back to extractive summaries and template-based chat,
 * so the extension is fully functional offline.
 */

interface SummaryOut {
  summary: string;
  keywords: string[];
  category: string;
  intent: string;
}

const SUMMARY_SYSTEM =
  'You compress web pages into structured memory. Reply ONLY with minified JSON: {"summary":string(1-2 sentences),"keywords":string[3-6],"category":string,"intent":"research"|"reference"|"shopping"|"reading"|"work"|"other"}.';

function buildSummaryPrompt(title: string, text: string): string {
  return `Title: ${title}\n\nContent:\n${text.slice(0, 6000)}`;
}

async function openaiChat(
  settings: Settings,
  messages: { role: string; content: string }[],
  json = false,
): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.openaiApiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.2,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

async function geminiChat(
  settings: Settings,
  system: string,
  user: string,
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${settings.geminiApiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

async function ollamaChat(
  settings: Settings,
  system: string,
  user: string,
): Promise<string> {
  const res = await fetch(`${settings.ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: settings.ollamaModel || 'llama3',
      stream: false,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}`);
  const data = await res.json();
  return data.message?.content ?? '';
}

function parseSummaryJson(raw: string): SummaryOut | null {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const obj = JSON.parse(match[0]);
    return {
      summary: String(obj.summary ?? ''),
      keywords: Array.isArray(obj.keywords) ? obj.keywords.map(String) : [],
      category: String(obj.category ?? 'General'),
      intent: String(obj.intent ?? 'other'),
    };
  } catch {
    return null;
  }
}

/** Returns a rich summary via the configured cloud/local LLM, or null. */
export async function llmSummarize(
  settings: Settings,
  title: string,
  text: string,
): Promise<SummaryOut | null> {
  const prompt = buildSummaryPrompt(title, text);
  try {
    let raw = '';
    if (settings.llmProvider === 'openai' && settings.openaiApiKey) {
      raw = await openaiChat(
        settings,
        [
          { role: 'system', content: SUMMARY_SYSTEM },
          { role: 'user', content: prompt },
        ],
        true,
      );
    } else if (settings.llmProvider === 'gemini' && settings.geminiApiKey) {
      raw = await geminiChat(settings, SUMMARY_SYSTEM, prompt);
    } else if (settings.llmProvider === 'ollama') {
      raw = await ollamaChat(settings, SUMMARY_SYSTEM, prompt);
    } else {
      return null;
    }
    return parseSummaryJson(raw);
  } catch (e) {
    console.warn('[BMO] llmSummarize failed, falling back:', (e as Error).message);
    return null;
  }
}

const CHAT_SYSTEM =
  'You are Browser Memory OS, the user\'s second brain. Answer using ONLY the provided remembered pages. Be concise. Reference pages by their title. If nothing matches, say so plainly.';

function buildChatContext(memories: PageMemory[]): string {
  return memories
    .map(
      (m, i) =>
        `[${i + 1}] ${m.title}\nURL: ${m.url}\nWhen: ${new Date(
          m.lastVisitedAt,
        ).toDateString()}\nSummary: ${m.summary}`,
    )
    .join('\n\n');
}

/** Chat over retrieved memories. Falls back to a template answer if no LLM. */
export async function llmChat(
  settings: Settings,
  query: string,
  memories: PageMemory[],
): Promise<string | null> {
  if (memories.length === 0) return null;
  const context = buildChatContext(memories);
  const user = `Remembered pages:\n${context}\n\nQuestion: ${query}`;
  try {
    if (settings.llmProvider === 'openai' && settings.openaiApiKey) {
      return await openaiChat(settings, [
        { role: 'system', content: CHAT_SYSTEM },
        { role: 'user', content: user },
      ]);
    }
    if (settings.llmProvider === 'gemini' && settings.geminiApiKey) {
      return await geminiChat(settings, CHAT_SYSTEM, user);
    }
    if (settings.llmProvider === 'ollama') {
      return await ollamaChat(settings, CHAT_SYSTEM, user);
    }
  } catch (e) {
    console.warn('[BMO] llmChat failed, falling back:', (e as Error).message);
  }
  return null;
}
