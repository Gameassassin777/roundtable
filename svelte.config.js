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
    version: {
      pollInterval: 60000
    }
  }
};