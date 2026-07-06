import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json';

export default defineManifest({
  manifest_version: 3,
  name: 'Browser Memory OS',
  description:
    'Your browser remembers everything so you can safely close tabs. Semantic search, recall, and smart dedup.',
  version: pkg.version,
  action: {
    default_title: 'Browser Memory OS',
    default_popup: 'src/popup/index.html',
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['http://*/*', 'https://*/*'],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
    },
  ],
  permissions: ['tabs', 'storage', 'unlimitedStorage', 'offscreen', 'scripting'],
  host_permissions: ['http://*/*', 'https://*/*'],
  // Allow loading remote model weights for local embeddings (Transformers.js).
  content_security_policy: {
    extension_pages:
      "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; connect-src 'self' https://huggingface.co https://cdn.jsdelivr.net https://*.hf.co https://api.openai.com https://generativelanguage.googleapis.com http://localhost:11434;",
  },
  web_accessible_resources: [
    {
      resources: ['models/*', 'assets/*'],
      matches: ['<all_urls>'],
    },
  ],
  commands: {
    _execute_action: {
      suggested_key: {
        default: 'Ctrl+Shift+K',
        mac: 'Command+Shift+K',
      },
      description: 'Open Browser Memory search',
    },
  },
  icons: {
    '16': 'src/assets/icon-16.png',
    '48': 'src/assets/icon-48.png',
    '128': 'src/assets/icon-128.png',
  },
});
