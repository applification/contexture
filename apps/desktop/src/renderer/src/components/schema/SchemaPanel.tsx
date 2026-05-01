/**
 * SchemaPanel — read-only preview of the emitted schema source.
 *
 * Supports three schema formats via an in-panel tab strip:
 *   - Zod (TypeScript)  → <name>.schema.ts
 *   - JSON Schema        → <name>.schema.json
 *   - Convex             → convex/schema.ts
 *
 * Three visual states:
 *   - Empty (schema has no types): an `Empty` nudge telling the
 *     user to add a type on the canvas.
 *   - Error (emit threw): a muted error line. Transient — the
 *     next valid IR clears it on re-render.
 *   - OK: a tab strip, header with filename + font-size and copy
 *     controls, above a shiki-highlighted code block.
 *
 * Shiki init is lazy (first mount) via `getHighlighter`. We pre-warm
 * the highlighter on mount so it loads in the background — by the time
 * the user opens the panel it is usually already initialised. While
 * loading, a plain `<pre>` fallback keeps the code readable immediately.
 *
 * Security note: the highlighted HTML is injected via shiki's escaped
 * output. Shiki tokenises input via TextMate grammars and emits its own
 * HTML with all user text escaped in `<span>` text nodes — there is no
 * path for user-authored source to introduce raw tags.
 */
import { AArrowDown, AArrowUp, Check, Copy, FileBracesCorner, FileCode } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '../ui/empty';
import { getHighlighter, SHIKI_THEMES } from './shiki-highlighter';

export type SchemaType = 'zod' | 'json' | 'convex';

export interface SchemaPanelProps {
  /** Emitted Zod TypeScript source. */
  zodSource: string;
  /** Emitted JSON Schema (pre-stringified JSON). */
  jsonSource: string;
  /** Emitted Convex schema TypeScript source. */
  convexSource: string;
  /** True when the IR has zero types; drives the empty state. */
  isEmpty: boolean;
  /** Non-null when the primary (Zod) emit threw. Rendered as-is. */
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

const SCHEMA_TABS: { type: SchemaType; label: string }[] = [
  { type: 'zod', label: 'Zod' },
  { type: 'json', label: 'JSON Schema' },
  { type: 'convex', label: 'Convex' },
];

function deriveFileName(schemaFileName: string, type: SchemaType): string {
  if (type === 'zod') return schemaFileName;
  if (type === 'convex') return 'convex/schema.ts';
  // json: replace .schema.ts → .schema.json, or .ts → .json as fallback
  const replaced = schemaFileName.replace(/\.schema\.ts$/i, '.schema.json');
  return replaced !== schemaFileName ? replaced : schemaFileName.replace(/\.ts$/i, '.json');
}

function langForType(type: SchemaType): string {
  return type === 'json' ? 'json' : 'typescript';
}

export function SchemaPanel({
  zodSource,
  jsonSource,
  convexSource,
  isEmpty,
  error,
  onCopy,
  schemaFileName = 'schema.ts',
}: SchemaPanelProps): React.JSX.Element {
  const [activeSchema, setActiveSchema] = useState<SchemaType>('zod');
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);
  const [fontSizeIndex, setFontSizeIndex] = useState<number>(DEFAULT_FONT_SIZE_INDEX);
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<number | null>(null);
  const codeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (codeRef.current) codeRef.current.innerHTML = highlightedHtml ?? '';
  }, [highlightedHtml]);

  // Pre-warm shiki on first mount so it loads in the background.
  // By the time the user opens the Schema tab the highlighter is
  // usually already initialised and the code colours appear immediately.
  useEffect(() => {
    getHighlighter().catch(() => undefined);
  }, []);

  const sourceByType: Record<SchemaType, string> = {
    zod: zodSource,
    json: jsonSource,
    convex: convexSource,
  };
  const activeSource = sourceByType[activeSchema];

  // Re-highlight whenever the active source or schema type changes.
  useEffect(() => {
    if (isEmpty || error !== null || activeSource === '') {
      setHighlightedHtml(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const hl = await getHighlighter();
        if (cancelled) return;
        const html = hl.codeToHtml(activeSource, {
          lang: langForType(activeSchema),
          themes: SHIKI_THEMES,
          defaultColor: false,
        });
        setHighlightedHtml(html);
      } catch {
        if (!cancelled) setHighlightedHtml(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeSource, activeSchema, isEmpty, error]);

  // Clear the "copied" feedback timer on unmount.
  useEffect(
    () => () => {
      if (copyTimeoutRef.current !== null) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    },
    [],
  );

  const handleCopy = (): void => {
    onCopy?.(activeSource);
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
              Add a type to the canvas to see the generated schemas.
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
            Couldn't emit schema: {error}
          </p>
        </div>
      </div>
    );
  }

  const displayFileName = deriveFileName(schemaFileName, activeSchema);

  return (
    <div className="flex h-full flex-col p-3" data-testid="schema-panel">
      {/* Schema type tab strip */}
      <div className="flex items-center gap-1 mb-2" role="tablist" aria-label="Schema format">
        {SCHEMA_TABS.map(({ type, label }) => (
          <button
            key={type}
            type="button"
            role="tab"
            aria-selected={activeSchema === type}
            data-testid={`schema-tab-${type}`}
            onClick={() => {
              setActiveSchema(type);
              setHighlightedHtml(null);
            }}
            className={[
              'rounded px-2.5 py-1 text-xs font-medium transition-colors',
              activeSchema === type
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="group relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-background text-foreground shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/80 px-3 py-2 text-xs text-muted-foreground">
          <div className="flex min-w-0 items-center gap-2" data-testid="schema-filename">
            <FileCode className="size-3.5 shrink-0" />
            <span className="truncate font-mono">{displayFileName}</span>
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
            <div ref={codeRef} />
          ) : (
            <pre className="p-4 m-0 font-mono">{activeSource}</pre>
          )}
        </div>
      </div>
    </div>
  );
}
