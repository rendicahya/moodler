import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

/** Writes sw.js into the build with a list of every built file, so the app works offline after the first visit. */
function serviceWorker() {
  let outDir;
  return {
    name: 'moodler-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    writeBundle(_, bundle) {
      const publicFiles = readdirSync('public');
      const files = [...new Set([...Object.keys(bundle), ...publicFiles])].filter((f) => f !== 'sw.js' && !f.endsWith('.map')).sort();
      // The cache name changes whenever any file does, so each deploy replaces the old cache.
      const hash = createHash('sha256');
      for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = hash.digest('hex').slice(0, 12);
      const source = readFileSync('pwa/sw.js', 'utf8')
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(['./', ...files.filter((f) => f !== 'index.html')]));
      writeFileSync(join(outDir, 'sw.js'), source);
    },
  };
}

// A relative base makes the build work on GitHub Pages under any repository name.
export default defineConfig({
  base: './',
  plugins: [svelte(), serviceWorker()],
});
