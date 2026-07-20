import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: 'index.html',
      precompress: false,
      strict: true
    }),
    paths: {
      base: process.env.NODE_ENV === 'production' ? '/roundtable' : ''
    },
    // Poll for a newer deploy every 60s so installed iOS PWAs update themselves
    // (the `updated` store flips true; +layout.svelte refreshes to fetch it).
    // Bump `name` explicitly on every push — auto-timestamp can collide and
    // gets pinned by GH Pages' CDN max-age=600. Manual bump guarantees the
    // SW sees a different string and triggers the update flow.
    version: {
      name: '58',
      pollInterval: 60000
    }
  }
};