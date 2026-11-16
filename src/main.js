import { mount } from 'svelte';
import '@fontsource-variable/inter';
import './app.css';
import App from './App.svelte';
import PhoneNotice from './components/PhoneNotice.svelte';
import { registerServiceWorker } from './lib/pwa.js';
import { loadSavedQuiz } from './lib/store.svelte.js';
import { isPhone } from './lib/device.js';

registerServiceWorker();

const target = document.getElementById('app');
if (isPhone()) {
  // Phones only get a notice to use a computer; nothing is loaded or saved.
  mount(PhoneNotice, { target });
} else {
  // The saved quiz is read from IndexedDB (asynchronously) before the app starts tracking changes.
  loadSavedQuiz().finally(() => mount(App, { target }));
}
