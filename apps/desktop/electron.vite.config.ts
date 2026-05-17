import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { varlockVitePlugin } from '@varlock/vite-integration';
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

// Shared aliases — main bundles a few pure helpers used by both Electron
// processes and the renderer, so every surface resolves the same paths.
const sharedAliases = {
  '@renderer': resolve('src/renderer/src'),
  '@main': resolve('src/main'),
  '@shared': resolve('src/shared'),
  '@': resolve('src/renderer/src'),
};

export default defineConfig({
  main: {
    // Keep `@contexture/*` workspace packages inlined into the main/preload
    // bundle. They ship as `.ts` sources with ESM exports, and externalizing
    // them would leave CJS `require()` calls at runtime that can't load
    // `export` statements.
    plugins: [
      varlockVitePlugin({ ssrInjectMode: 'resolved-env' }),
      externalizeDepsPlugin({
        exclude: ['@contexture/core', '@contexture/stdlib', '@contexture/runtime'],
      }),
    ],
    resolve: { alias: sharedAliases },
  },
  preload: {
    // Keep `@contexture/*` workspace packages inlined into the main/preload
    // bundle. They ship as `.ts` sources with ESM exports, and externalizing
    // them would leave CJS `require()` calls at runtime that can't load
    // `export` statements.
    plugins: [
      varlockVitePlugin({ ssrInjectMode: 'resolved-env' }),
      externalizeDepsPlugin({
        exclude: ['@contexture/core', '@contexture/stdlib', '@contexture/runtime'],
      }),
    ],
    resolve: { alias: sharedAliases },
  },
  renderer: {
    resolve: { alias: sharedAliases },
    plugins: [varlockVitePlugin({ ssrInjectMode: 'resolved-env' }), tailwindcss(), react()],
  },
});
