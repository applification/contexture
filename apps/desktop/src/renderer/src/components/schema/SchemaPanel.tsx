/**
 * SchemaPanel — read-only preview of the emitted schema source.
 *
 * Supports grouped output previews:
 *   - Core: Zod, JSON Schema, Convex
 *   - AI: tool schemas, structured outputs, MCP definitions when enabled
 *   - Forms: form validators when enabled
 *
 * Three visual states:
 *   - Empty (schema has no types): an `Empty` nudge telling the
 *     user to add a type on the canvas.
 *   - Error (emit threw): a muted error line. Transient — the
 *     next valid IR clears it on re-render.
 *   - OK: a compact grouped selector, header with filename + font-size
 *     and copy controls, above a shiki-highlighted code block.
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
import {
  type GeneratedTargetGroup,
  type GeneratedTargetLanguage,
  generatedTargetDisplayPath,
  generatedTargetMetadata,
  generatedTargetPath,
  previewableGeneratedTargets,
} from '@contexture/core/generated-targets';
import type { GeneratedTargetKind } from '@contexture/core/paths';
import {
  AArrowDown,
  AArrowUp,
  Check,
  Copy,
  ExternalLink,
  FileBracesCorner,
  FileCode,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '../ui/empty';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { getHighlighter, SHIKI_THEMES } from './shiki-highlighter';

export type SchemaOutputType = GeneratedTargetKind;

export interface SchemaPanelAdditionalSource {
  type: Exclude<SchemaOutputType, 'zod' | 'json-schema' | 'schema-index' | 'convex'>;
  source: string;
  enabled?: boolean;
}

export interface SchemaPanelSource {
  type: SchemaOutputType;
  source: string;
  enabled?: boolean;
}

export interface SchemaPanelProps {
  /** Generated output previews. Disabled entries appear as opt-in choices. */
  sources?: SchemaPanelSource[];
  /** Emitted Zod TypeScript source. Kept for focused tests/stories that do not build sources. */
  zodSource?: string;
  /** Emitted JSON Schema (pre-stringified JSON). */
  jsonSource?: string;
  /** Emitted Convex schema TypeScript source. */
  convexSource?: string;
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
  /**
   * Optional non-core generated outputs. Disabled outputs are shown as
   * available choices; enabled outputs with empty sources stay hidden.
   */
  additionalSources?: SchemaPanelAdditionalSource[];
  /** Enable an optional output target from the grouped selector. */
  onEnableOutput?: (type: SchemaOutputType) => void;
  /** Absolute path of the active `.contexture.json`; absent for unsaved documents. */
  documentFilePath?: string | null;
  /** Open the selected generated file in an external editor. */
  onOpenGeneratedFile?: (path: string) => void;
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

const OUTPUT_GROUPS: { group: GeneratedTargetGroup; label: string }[] = [
  { group: 'core', label: 'Core' },
  { group: 'ai', label: 'AI' },
  { group: 'forms', label: 'Forms' },
];

interface OutputOption {
  type: SchemaOutputType;
  source: string;
  group: GeneratedTargetGroup;
  label: string;
  help: string;
  language: GeneratedTargetLanguage;
  fileName: string;
  enabled: boolean;
}

function fallbackBaseName(schemaFileName: string): string {
  const schemaTs = schemaFileName.replace(/\.schema\.ts$/i, '');
  if (schemaTs !== schemaFileName) return schemaTs;
  return schemaFileName.replace(/\.[^.]+$/i, '') || 'schema';
}

export function SchemaPanel({
  sources,
  zodSource,
  jsonSource,
  convexSource,
  isEmpty,
  error,
  onCopy,
  schemaFileName = 'schema.ts',
  additionalSources = [],
  onEnableOutput,
  documentFilePath = null,
  onOpenGeneratedFile,
}: SchemaPanelProps): React.JSX.Element {
  const [activeOutput, setActiveOutput] = useState<SchemaOutputType>('zod');
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);
  const [fontSizeIndex, setFontSizeIndex] = useState<number>(DEFAULT_FONT_SIZE_INDEX);
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<number | null>(null);
  const codeRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (codeRef.current) codeRef.current.innerHTML = highlightedHtml ?? '';
  }, [highlightedHtml]);

  // Pre-warm shiki on first mount so it loads in the background.
  // By the time the user opens the Schema tab the highlighter is
  // usually already initialised and the code colours appear immediately.
  useEffect(() => {
    getHighlighter().catch(() => undefined);
  }, []);

  const outputOptions = useMemo<OutputOption[]>(() => {
    const sourceEntries =
      sources && sources.length > 0
        ? sources
        : ([
            { type: 'zod', source: zodSource ?? '' },
            { type: 'json-schema', source: jsonSource ?? '' },
            { type: 'convex', source: convexSource ?? '' },
            ...additionalSources,
          ] satisfies SchemaPanelSource[]);
    const visibleSourceEntries = sourceEntries.filter(
      (source) =>
        source.type === 'zod' ||
        source.type === 'json-schema' ||
        source.type === 'convex' ||
        source.enabled === false ||
        source.source.trim().length > 0,
    );
    const baseName = fallbackBaseName(schemaFileName);
    const sortOrder = new Map(
      previewableGeneratedTargets().map((target, index) => [target.kind, index] as const),
    );
    return [...visibleSourceEntries]
      .sort((a, b) => (sortOrder.get(a.type) ?? 999) - (sortOrder.get(b.type) ?? 999))
      .map(({ type, source, enabled = true }) => {
        const metadata = generatedTargetMetadata(type);
        return {
          type,
          source,
          group: metadata.group,
          label: metadata.label,
          help: metadata.help,
          language: metadata.language,
          fileName: generatedTargetDisplayPath(type, baseName),
          enabled,
        };
      });
  }, [additionalSources, convexSource, jsonSource, schemaFileName, sources, zodSource]);

  useEffect(() => {
    if (!outputOptions.some((output) => output.type === activeOutput && output.enabled)) {
      setActiveOutput('zod');
    }
  }, [activeOutput, outputOptions]);

  const selectedOutput =
    outputOptions.find((output) => output.type === activeOutput && output.enabled) ??
    outputOptions[0];
  const activeSource = selectedOutput?.source ?? '';
  const selectedOutputPath =
    selectedOutput && documentFilePath
      ? generatedTargetPath(selectedOutput.type, documentFilePath)
      : null;

  // Re-highlight whenever the active source or output type changes.
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
          lang: selectedOutput?.language ?? 'typescript',
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
  }, [activeSource, selectedOutput?.language, isEmpty, error]);

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

  return (
    <div className="flex h-full flex-col p-3" data-testid="schema-panel">
      <div
        className="mb-2 space-y-1 rounded-md border border-border bg-muted/35 p-1.5"
        role="listbox"
        aria-label="Generated outputs"
        data-testid="schema-output-selector"
      >
        {OUTPUT_GROUPS.map(({ group, label }) => {
          const groupOutputs = outputOptions.filter((output) => output.group === group);
          if (groupOutputs.length === 0) return null;
          return (
            <div
              key={group}
              className="flex items-start gap-2"
              data-testid={`schema-group-${group}`}
            >
              <div className="w-11 shrink-0 px-0.5 py-1.5 text-[9px] font-semibold uppercase leading-none tracking-wider text-muted-foreground/50">
                {label}
              </div>
              <TooltipProvider delayDuration={250}>
                <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                  {groupOutputs.map((output) => {
                    const tooltip = output.enabled
                      ? output.help
                      : `Enable ${output.label}: ${output.help}`;
                    return (
                      <Tooltip key={output.type}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            role="option"
                            aria-selected={output.enabled && activeOutput === output.type}
                            data-testid={`schema-output-${output.type}`}
                            onClick={() => {
                              if (!output.enabled) {
                                setActiveOutput(output.type);
                                setHighlightedHtml(null);
                                onEnableOutput?.(output.type);
                                return;
                              }
                              setActiveOutput(output.type);
                              setHighlightedHtml(null);
                            }}
                            className={[
                              'min-w-0 rounded px-2 py-1 text-left text-xs font-medium leading-none transition-colors',
                              output.enabled && activeOutput === output.type
                                ? 'bg-primary text-primary-foreground'
                                : !output.enabled
                                  ? 'border border-dashed border-border/80 text-muted-foreground/60 hover:border-border hover:bg-muted hover:text-foreground'
                                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                            ].join(' ')}
                          >
                            <span className="truncate">{output.label}</span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-64 text-xs leading-snug">
                          {tooltip}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </TooltipProvider>
            </div>
          );
        })}
      </div>

      <div className="group relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-background text-foreground shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/80 px-3 py-2 text-xs text-muted-foreground">
          <div className="flex min-w-0 items-center gap-2" data-testid="schema-filename">
            <FileCode className="size-3.5 shrink-0" />
            <span className="truncate font-mono">{selectedOutput.fileName}</span>
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
            {selectedOutputPath && onOpenGeneratedFile ? (
              <Button
                size="icon"
                type="button"
                variant="ghost"
                className="size-7"
                onClick={() => onOpenGeneratedFile(selectedOutputPath)}
                aria-label={`Open ${selectedOutput.fileName} in VS Code`}
                title={`Open ${selectedOutput.fileName} in VS Code`}
                data-testid="schema-open-generated"
              >
                <ExternalLink className="size-3.5" />
              </Button>
            ) : null}
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
