import { env, pipeline, type FeatureExtractionPipeline } from '@xenova/transformers';
import type { Message, MessageResponse } from '../shared/messaging';
import { extractiveSummary } from '../shared/summarize';

/**
 * Offscreen document = long-lived DOM context where we can run WASM/ONNX.
 * MV3 service workers can't reliably host heavy ML, so embedding lives here.
 * Model weights are fetched once from the HuggingFace CDN, then cached.
 */

env.allowLocalModels = false;
env.useBrowserCache = true;
// onnxruntime-web pulls its wasm from jsDelivr by default (allowed via CSP).

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    extractorPromise = pipeline('feature-extraction', MODEL_ID);
  }
  return extractorPromise;
}

async function embed(texts: string[]): Promise<number[][]> {
  const extractor = await getExtractor();
  const vectors: number[][] = [];
  for (const t of texts) {
    const input = (t || '').slice(0, 2000);
    const output = await extractor(input, { pooling: 'mean', normalize: true });
    vectors.push(Array.from(output.data as Float32Array));
  }
  return vectors;
}

chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
  if (msg.type !== 'EMBED' && msg.type !== 'SUMMARIZE_LOCAL') return; // not ours

  (async () => {
    try {
      if (msg.type === 'EMBED') {
        const vectors = await embed(msg.texts);
        sendResponse({ ok: true, data: { vectors } } satisfies MessageResponse);
      } else {
        const { summary, keywords } = extractiveSummary(msg.text, msg.title);
        sendResponse({ ok: true, data: { summary, keywords } } satisfies MessageResponse);
      }
    } catch (e) {
      sendResponse({ ok: false, error: (e as Error).message } satisfies MessageResponse);
    }
  })();

  return true; // async response
});

// Signal readiness (useful for debugging).
console.debug('[BMO] offscreen ML worker ready');
