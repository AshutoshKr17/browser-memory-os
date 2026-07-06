import type { ExtractedPage, Message } from '../shared/messaging';

/**
 * Content script: read the visible page and hand it to the background worker.
 * We intentionally keep this dumb — no storage, no ML — so it stays fast and
 * safe on every site.
 */

function metaContent(name: string): string {
  const el =
    document.querySelector(`meta[name="${name}"]`) ||
    document.querySelector(`meta[property="og:${name}"]`) ||
    document.querySelector(`meta[property="${name}"]`);
  return (el?.getAttribute('content') ?? '').trim();
}

function getFavicon(): string | undefined {
  const link =
    document.querySelector<HTMLLinkElement>('link[rel~="icon"]') ||
    document.querySelector<HTMLLinkElement>('link[rel="shortcut icon"]');
  if (link?.href) return link.href;
  try {
    return `${location.origin}/favicon.ico`;
  } catch {
    return undefined;
  }
}

function getMainText(): string {
  // Prefer semantic main/article content; fall back to body.
  const container =
    document.querySelector('main') ||
    document.querySelector('article') ||
    document.body;
  if (!container) return '';
  // Clone and strip noise so we don't capture nav/script soup.
  const clone = container.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll('script,style,noscript,nav,footer,header,svg,iframe,form')
    .forEach((n) => n.remove());
  const text = (clone.innerText || '').replace(/\s+\n/g, '\n').replace(/[ \t]{2,}/g, ' ');
  return text.trim().slice(0, 20000);
}

function extract(): ExtractedPage {
  const headings = [...document.querySelectorAll('h1, h2, h3')]
    .map((h) => (h as HTMLElement).innerText.trim())
    .filter(Boolean)
    .slice(0, 20);

  return {
    url: location.href,
    title: document.title || metaContent('title') || location.href,
    text: getMainText(),
    description: metaContent('description'),
    headings,
    favicon: getFavicon(),
  };
}

let lastSentUrl = '';

function capture(): void {
  const text = getMainText();
  // Skip near-empty or app-shell pages that haven't rendered yet.
  if (text.length < 200 && location.href === lastSentUrl) return;
  lastSentUrl = location.href;
  const payload = extract();
  const msg: Message = { type: 'PAGE_EXTRACTED', payload };
  try {
    chrome.runtime.sendMessage(msg, () => void chrome.runtime.lastError);
  } catch {
    /* extension context invalidated on reload — ignore */
  }
}

// Initial capture once the page settles.
if (document.readyState === 'complete') {
  setTimeout(capture, 800);
} else {
  window.addEventListener('load', () => setTimeout(capture, 800), { once: true });
}

// SPA navigations don't reload the page; re-capture on URL change.
let currentUrl = location.href;
const observer = new MutationObserver(() => {
  if (location.href !== currentUrl) {
    currentUrl = location.href;
    setTimeout(capture, 1000);
  }
});
observer.observe(document.documentElement, { subtree: true, childList: true });
