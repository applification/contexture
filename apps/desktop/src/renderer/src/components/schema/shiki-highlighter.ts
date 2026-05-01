/**
 * Lazy, module-scoped shiki highlighter.
 *
 * The Schema panel needs syntax-highlighted TypeScript, but loading
 * shiki eagerly costs every user startup regardless of whether they
 * open the panel. Instead we initialise on first access and cache the
 * promise so every subsequent call reuses the same instance.
 *
 * Fine-grained import: only TS, only two themes, JS regex engine
 * (avoids loading the WASM engine). Dual theme support lets shiki
 * emit CSS variables that follow the app's `.dark` class without us
 * observing DOM changes.
 */
import type { HighlighterCore } from 'shiki/core';
import { createHighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

let highlighterPromise: Promise<HighlighterCore> | null = null;

export function getHighlighter(): Promise<HighlighterCore> {
  if (highlighterPromise === null) {
    highlighterPromise = (async () => {
      const [ts, json, light, dark] = await Promise.all([
        import('shiki/langs/typescript.mjs'),
        import('shiki/langs/json.mjs'),
        import('shiki/themes/github-light.mjs'),
        import('shiki/themes/github-dark.mjs'),
      ]);
      return createHighlighterCore({
        themes: [light.default, dark.default],
        langs: [ts.default, json.default],
        engine: createJavaScriptRegexEngine(),
      });
    })();
  }
  return highlighterPromise;
}

/**
 * Light/dark theme names passed to `codeToHtml`. Centralised so the
 * panel and any future caller stay in sync with what the highlighter
 * was initialised with.
 */
export const SHIKI_THEMES = {
  light: 'github-light',
  dark: 'github-dark',
} as const;
