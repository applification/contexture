/**
 * SchemaPanel — read-only preview of the emitted Zod TypeScript
 * source.
 *
 * The canvas IR is the source of truth; this panel shows exactly
 * what would be written to `<name>.schema.ts` on save, re-rendered
 * whenever the caller hands us a new `zodSource` string (the
 * caller gates re-emission on `activeTab === 'schema'` so we only
 * do the work when the user is looking).
 *
 * Three visual states:
 *   - Empty (schema has no types): an `Empty` nudge telling the
 *     user to add a type on the canvas.
 *   - Error (emit threw): a muted error line. Transient — the
 *     next valid IR clears it on re-render.
 *   - OK: a top toolbar with a Copy button + shiki-highlighted
 *     code block. Horizontal scroll, no wrap — preserves the
 *     emitter's exact formatting.
 *
 * Shiki init is lazy (first mount) via `getHighlighter`. While
 * the highlighter is still loading we render a plain `<pre>`
 * fallback so the code is readable immediately.
 *
 * Security note: the highlighted HTML is injected via
 * `dangerouslySetInnerHTML`. Shiki tokenises input via TextMate
 * grammars and emits its own HTML with all user text escaped in
 * `<span>` text nodes — there is no path for user-authored Zod
 * source to introduce raw tags. The alternative (the
 * `hast-util-to-jsx-runtime` transformer) buys nothing here since
 * the source is already trusted local output from `emit-zod`.
 */
import { Copy, FileBracesCorner } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '../ui/empty';
import { getHighlighter, SHIKI_THEMES } from './shiki-highlighter';

export interface SchemaPanelProps {
  /** Emitted Zod TypeScript. Non-empty even for empty schemas (header + z import). */
  zodSource: string;
  /** True when the IR has zero types; drives the empty state. */
  isEmpty: boolean;
  /** Non-null when `emit()` threw. The message is rendered as-is. */
  error: string | null;
  /** Copy full source to clipboard — host wires `navigator.clipboard`. */
  onCopy?: (text: string) => void;
}

export function SchemaPanel({
  zodSource,
  isEmpty,
  error,
  onCopy,
}: SchemaPanelProps): React.JSX.Element {
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);

  // Re-highlight whenever the source changes. `codeToHtml` is sync
  // after init, so we only `await` the highlighter itself. The
  // effect bails for the empty / error states which don't render
  // the code block.
  useEffect(() => {
    if (isEmpty || error !== null || zodSource === '') {
      setHighlightedHtml(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const hl = await getHighlighter();
        if (cancelled) return;
        const html = hl.codeToHtml(zodSource, {
          lang: 'typescript',
          themes: SHIKI_THEMES,
          defaultColor: false,
        });
        setHighlightedHtml(html);
      } catch {
        // Highlighter init or render failed — fall back to plain
        // <pre>. Don't surface to the user; the source itself is
        // still readable.
        if (!cancelled) setHighlightedHtml(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [zodSource, isEmpty, error]);

  if (isEmpty) {
    return (
      <div className="flex h-full flex-col" data-testid="schema-panel">
        <Empty className="border-0 p-4">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileBracesCorner />
            </EmptyMedia>
            <EmptyTitle className="text-sm font-medium">No schema yet</EmptyTitle>
            <EmptyDescription className="text-xs">
              Add a type to the canvas to see the generated Zod schema.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  if (error !== null) {
    return (
      <div className="flex h-full flex-col p-3" data-testid="schema-panel">
        <p
          data-testid="schema-error"
          className="font-mono text-xs text-destructive whitespace-pre-wrap"
        >
          Couldn't emit Zod: {error}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col" data-testid="schema-panel">
      <div className="flex justify-end p-2 border-b border-border">
        <Button
          size="sm"
          type="button"
          variant="outline"
          onClick={() => onCopy?.(zodSource)}
          data-testid="schema-copy"
        >
          <Copy className="size-3" />
          Copy
        </Button>
      </div>
      <div
        className="flex-1 min-h-0 overflow-auto text-xs [&_pre]:p-3 [&_pre]:m-0 [&_pre]:font-mono"
        data-testid="schema-code"
      >
        {highlightedHtml !== null ? (
          // biome-ignore lint/security/noDangerouslySetInnerHtml: shiki output is trusted, tokenised, escaped HTML
          <div dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
        ) : (
          <pre className="p-3 m-0 font-mono">{zodSource}</pre>
        )}
      </div>
    </div>
  );
}
