import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// A relative base makes the build work on GitHub Pages under any repository name.
export default defineConfig({
  base: './',
  plugins: [svelte()],
});
