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
 *   - OK: a header with the derived schema filename + font-size
 *     and copy controls, above a shiki-highlighted code block.
 *     Horizontal scroll, no wrap — preserves the emitter's exact
 *     formatting.
 *
 * The header mirrors the shadcn `ai-elements` CodeBlock pattern
 * used on the marketing site's /brand page so the two surfaces
 * feel like the same component family.
 *
 * Shiki init is lazy (first mount) via `getHighlighter`. While
 * the highlighter is still loading we render a plain `<pre>`
 * fallback so the code is readable immediately.
 *
 * Security note: the highlighted HTML is injected via shiki's
 * escaped output (see rendering block below). Shiki tokenises
 * input via TextMate grammars and emits its own HTML with all
 * user text escaped in `<span>` text nodes — there is no path
 * for user-authored Zod source to introduce raw tags. The
 * alternative (`hast-util-to-jsx-runtime`) buys nothing here
 * since the source is already trusted local output from
 * `emit-zod`.
 */
import { AArrowDown, AArrowUp, Check, Copy, FileBracesCorner, FileCode } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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
  /**
   * Filename to show in the header — typically the basename of the
   * current document with `.schema.ts` in place of the IR suffix.
   * Defaults to `schema.ts` so the header stays useful before the
   * document has been saved.
   */
  schemaFileName?: string;
}

/**
 * Font-size ladder in pixels. Steps roughly correspond to Tailwind's
 * xs → xl so the default (13px) matches the surrounding panel chrome
 * but users can bump up for presentation or down to fit more lines.
 */
const FONT_SIZE_STEPS = [11, 12, 13, 14, 16, 18, 20] as const;
const DEFAULT_FONT_SIZE_INDEX = 2; // 13px
/** How long the Copy icon flips to a check after a successful copy. */
const COPY_FEEDBACK_MS = 2000;

export function SchemaPanel({
  zodSource,
  isEmpty,
  error,
  onCopy,
  schemaFileName = 'schema.ts',
}: SchemaPanelProps): React.JSX.Element {
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);
  const [fontSizeIndex, setFontSizeIndex] = useState<number>(DEFAULT_FONT_SIZE_INDEX);
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<number | null>(null);

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

  // Clear the "copied" feedback timer on unmount so a late-firing
  // setState can't hit an unmounted component.
  useEffect(
    () => () => {
      if (copyTimeoutRef.current !== null) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    },
    [],
  );

  const handleCopy = (): void => {
    onCopy?.(zodSource);
    setCopied(true);
    if (copyTimeoutRef.current !== null) {
      window.clearTimeout(copyTimeoutRef.current);
    }
    copyTimeoutRef.current = window.setTimeout(() => {
      setCopied(false);
      copyTimeoutRef.current = null;
    }, COPY_FEEDBACK_MS);
  };

  const fontSize = FONT_SIZE_STEPS[fontSizeIndex];
  const canShrink = fontSizeIndex > 0;
  const canGrow = fontSizeIndex < FONT_SIZE_STEPS.length - 1;

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
        <div className="rounded-md border border-border bg-background p-3 shadow-sm">
          <p
            data-testid="schema-error"
            className="font-mono text-xs text-destructive whitespace-pre-wrap"
          >
            Couldn't emit Zod: {error}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col p-3" data-testid="schema-panel">
      <div className="group relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-background text-foreground shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/80 px-3 py-2 text-xs text-muted-foreground">
          <div className="flex min-w-0 items-center gap-2" data-testid="schema-filename">
            <FileCode className="size-3.5 shrink-0" />
            <span className="truncate font-mono">{schemaFileName}</span>
          </div>
          <div className="-my-1 -mr-1 flex shrink-0 items-center gap-1">
            <Button
              size="icon"
              type="button"
              variant="ghost"
              className="size-7"
              onClick={() => setFontSizeIndex((i) => Math.max(0, i - 1))}
              disabled={!canShrink}
              aria-label="Decrease font size"
              title="Decrease font size"
              data-testid="schema-font-decrease"
            >
              <AArrowDown className="size-3.5" />
            </Button>
            <Button
              size="icon"
              type="button"
              variant="ghost"
              className="size-7"
              onClick={() => setFontSizeIndex((i) => Math.min(FONT_SIZE_STEPS.length - 1, i + 1))}
              disabled={!canGrow}
              aria-label="Increase font size"
              title="Increase font size"
              data-testid="schema-font-increase"
            >
              <AArrowUp className="size-3.5" />
            </Button>
            <Button
              size="icon"
              type="button"
              variant="ghost"
              className="size-7"
              onClick={handleCopy}
              aria-label={copied ? 'Copied' : 'Copy schema source'}
              title={copied ? 'Copied' : 'Copy schema source'}
              data-testid="schema-copy"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </Button>
          </div>
        </div>
        <div
          className="flex-1 min-h-0 overflow-auto [&_pre]:p-4 [&_pre]:m-0 [&_pre]:font-mono"
          style={{ fontSize: `${fontSize}px` }}
          data-testid="schema-code"
        >
          {highlightedHtml !== null ? (
            /* shiki emits pre-escaped HTML tokens; see security note in the file header. */
            /* biome-ignore lint/security/noDangerouslySetInnerHtml: shiki output is trusted, tokenised, escaped HTML */
            <div dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
          ) : (
            <pre className="p-4 m-0 font-mono">{zodSource}</pre>
          )}
        </div>
      </div>
    </div>
  );
}
