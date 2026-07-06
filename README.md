# Browser Memory OS

> People don't want to organize tabs. They want their browser to **remember everything** so they can safely close tabs.

A Chrome (Manifest V3) extension that turns your browsing into a searchable **second brain**. Every page you read is summarized, embedded, and stored locally so you can recall it later with natural language — and close tabs without fear.

## What it does

- **Remembers pages** — captures title, URL, and readable text on every page (SPA-aware).
- **Summarizes & tags** — on-device extractive summaries by default, or plug in OpenAI / Gemini / Ollama.
- **Semantic search** — local `all-MiniLM-L6-v2` embeddings + hybrid lexical search. Ask for _"that kubernetes article from last week"_.
- **Ask AI** — conversational recall over your own memory ("show everything related to AWS").
- **Smart dedup** — _"You already have this open — switch to it?"_ using URL normalization + embedding/title similarity, not just exact URLs.
- **Project detection** — clusters related pages (GitHub + Jira + AWS docs → _Infrastructure_).
- **Sessions** — snapshot the current window and restore it later.

Everything runs **locally** by default (IndexedDB via Dexie, embeddings via ONNX/WASM). No data leaves your machine unless you opt into a cloud LLM.

## Architecture

```
Content script  ──PAGE_EXTRACTED──►  Background SW  ──EMBED──►  Offscreen (Transformers.js/ONNX)
   (extract)                          (orchestrate)               (local embeddings)
                                           │
                                           ▼
                                   Dexie / IndexedDB  ◄── Popup (React spotlight UI)
                                   (memories + vectors)
```

| Layer      | Tech |
|------------|------|
| Extension  | Manifest V3, TypeScript, React, Vite, CRXJS |
| Storage    | IndexedDB (Dexie) |
| Search     | MiniSearch (lexical) + cosine similarity (semantic) |
| Embeddings | `Xenova/all-MiniLM-L6-v2` via `@xenova/transformers` (ONNX Runtime Web) |
| AI (opt.)  | OpenAI · Gemini · Ollama |

## Install & use (for users)

This extension isn't on the Chrome Web Store yet, so you install it in **Developer mode**. It takes ~2 minutes.

### Option A — Download the prebuilt extension (no coding, no Node) ⭐ easiest

1. Go to the [**Releases**](https://github.com/AshutoshKr17/browser-memory-os/releases) page.
2. Under the latest release, download **`browser-memory-os.zip`**.
3. Unzip it — you'll get a folder (e.g. `browser-memory-os`).
4. Open `chrome://extensions` (or `brave://extensions`, `edge://extensions`).
5. Turn on **Developer mode** (toggle, top-right).
6. Click **Load unpacked** and select the unzipped folder.
7. Done — jump to [**Start using it**](#start-using-it) below.

> Keep the unzipped folder somewhere permanent; if you delete it, the extension stops working.

### Option B — Build from source

**Requirements:** Google Chrome / Brave / Edge (any Chromium browser) + [Node.js 18+](https://nodejs.org) and npm.

1. **Get the code:**

```bash
git clone https://github.com/AshutoshKr17/browser-memory-os.git
cd browser-memory-os
```

2. **Install dependencies and build:**

```bash
npm install
npm run build
```

   This produces a `dist/` folder — that's the actual extension.

3. **Load it into your browser:**
   - Open `chrome://extensions` (or `brave://extensions`, `edge://extensions`)
   - Turn on **Developer mode** (toggle, top-right)
   - Click **Load unpacked**
   - Select the **`dist/`** folder inside the project

<a id="start-using-it"></a>
### Start using it

- Pin the extension from the puzzle-piece menu.
- Press **⌘⇧K** (Mac) or **Ctrl+Shift+K** (Windows/Linux), or click the icon, to open the spotlight.
- Browse a few pages normally — they get remembered automatically — then search for them in plain language.

> ℹ️ The **first search** downloads a ~25 MB on-device AI model once (then it's cached and works offline). Everything is stored locally in your browser; nothing is uploaded unless you opt into a cloud AI provider in **Settings**.

### Updating to a new version
- **Option A (prebuilt):** download the newer `browser-memory-os.zip` from [Releases](https://github.com/AshutoshKr17/browser-memory-os/releases), unzip over the old folder, then click the **↻ reload** icon on the extension card in `chrome://extensions`.
- **Option B (source):** pull, rebuild, then reload:

```bash
git pull
npm install
npm run build
```

## Develop

```bash
npm install
npm run dev        # HMR dev build (writes to dist/, watches for changes)
npm run build      # production build -> dist/
npm run typecheck  # type-check without emitting
```

## Roadmap

- [x] Track tabs (open/close/activate)
- [x] Extract page title/URL/text
- [x] Store metadata in IndexedDB
- [x] AI summaries + tags
- [x] Embeddings + semantic search
- [x] Spotlight-style search UI
- [x] Duplicate detection with "switch to existing"
- [x] Project clustering
- [x] Conversational AI recall
- [ ] Cross-device sync (encrypted)
- [ ] Timeline / "on this day" recall
- [ ] Export memories
