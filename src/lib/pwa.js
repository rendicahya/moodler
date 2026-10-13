import { notify } from './store.svelte.js';

/** Registers the service worker that makes the app work offline (production builds only). */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  // With no controller this is the first install, which needs no reload; otherwise a new version has taken over.
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    notify('A new version of Moodler is available. Your work is saved.', 'info', 0, { label: 'Reload', run: () => location.reload() });
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline support is optional */
    });
  });
}
