/** How often to look for a new version of the app. */
const CHECK_EVERY = 10_000;

/** Whether a new version is downloaded and waiting; the header then shows an Update button. */
export const appUpdate = $state({ ready: false });

let registration = null;
let updating = false;

/**
 * Registers the service worker that makes the app work offline (production builds only), and checks for a new
 * version every few seconds. A new version waits until the Update button is clicked, so the open page keeps working.
 */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updating) location.reload();
  });
  window.addEventListener('load', async () => {
    try {
      registration = await navigator.serviceWorker.register('./sw.js');
    } catch {
      return; // offline support is optional
    }
    watch(registration);
    setInterval(() => {
      if (!document.hidden && navigator.onLine) registration.update().catch(() => {});
    }, CHECK_EVERY);
  });
}

function watch(reg) {
  const check = () => {
    // A waiting worker with a page already controlled is a new version; the first install takes over by itself.
    if (reg.waiting && navigator.serviceWorker.controller) appUpdate.ready = true;
  };
  check();
  reg.addEventListener('updatefound', () => {
    const worker = reg.installing;
    worker?.addEventListener('statechange', () => worker.state === 'installed' && check());
  });
}

/** Switches to the new version and reloads. The open quiz is saved before the page unloads. */
export function applyUpdate() {
  const waiting = registration?.waiting;
  if (!waiting) return location.reload();
  updating = true;
  waiting.postMessage({ type: 'SKIP_WAITING' });
}
