import { mount } from 'svelte';
import '@fontsource-variable/inter';
import './app.css';
import App from './App.svelte';
import { registerServiceWorker } from './lib/pwa.js';
import { loadSavedQuiz } from './lib/store.svelte.js';

registerServiceWorker();

// The saved quiz is read from IndexedDB (asynchronously) before the app starts tracking changes.
loadSavedQuiz().finally(() => mount(App, { target: document.getElementById('app') }));
