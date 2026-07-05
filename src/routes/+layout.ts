// Round Table is a fully client-side app: it touches localStorage, WebRTC and
// WebGL at component-init time. Disable SSR so the page never runs on the server
// (fixes `npm run dev` crashing on `localStorage is not defined` and removes any
// hydration-mismatch risk). adapter-static's `fallback: index.html` serves the SPA.
export const ssr = false;
export const prerender = false;
