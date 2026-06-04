/**
 * SchemaPanel — read-only preview of the emitted schema source.
 *
 * Supports grouped output previews:
 *   - Convex: schema and validators for the app database boundary
 *   - Supporting contracts: Zod, JSON Schema, schema index
 *   - Agent and form targets: tool schemas, structured outputs, MCP, forms
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
  generatedTargetOutputDir,
  generatedTargetPath,
  previewableGeneratedTargets,
} from '@contexture/core/generated-targets';
import type { Schema } from '@contexture/core/ir';
import {
  bundlePathsFor,
  type GeneratedTargetKind,
  manifestKeyForGeneratedPath,
} from '@contexture/core/paths';
import {
  AArrowDown,
  AArrowUp,
  Check,
  Copy,
  ExternalLink,
  FileBracesCorner,
  FileCode,
  PlugZap,
  RotateCcw,
  Settings2,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '../ui/empty';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { getHighlighter, SHIKI_THEMES } from './shiki-highlighter';

export type SchemaOutputType = GeneratedTargetKind | 'stdlib-runtime';

export interface SchemaPanelAdditionalSource {
  type: Exclude<GeneratedTargetKind, 'zod' | 'json-schema' | 'schema-index' | 'convex'>;
  source: string;
  enabled?: boolean;
}

export interface SchemaPanelSource {
  type: GeneratedTargetKind;
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
  /** Non-null when the primary emit threw. Rendered as-is. */
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
  /** Enable an optional output target from the output configuration popover. */
  onEnableOutput?: (type: GeneratedTargetKind) => void;
  /** Configure a generated target's IR-relative output directory. */
  onOutputDirChange?: (type: SchemaOutputType, dir: string | null) => void;
  /** Absolute path of the active `.contexture.json`; absent for unsaved documents. */
  documentFilePath?: string | null;
  /** Current IR schema, used to resolve configured generated output paths. */
  schema?: Schema;
  /** Open the selected generated file in an external editor. */
  onOpenGeneratedFile?: (path: string) => void;
  /** Prompt the app save flow when agent setup needs a stable IR path. */
  onRequestSave?: () => void;
  /** Local Convex support and target app version information. */
  convexVersion?: {
    emitterVersion: string | null;
    targetVersion: string | null;
    targetPackagePath: string | null;
    status: 'idle' | 'loading' | 'ok' | 'mismatch' | 'target_missing' | 'probe_failed';
    message: string | null;
    convexAiFiles: {
      status: 'idle' | 'loading' | 'ready' | 'not_ready' | 'probe_failed';
      message: string | null;
      command: string | null;
    };
    contextureMcp: {
      status: 'idle' | 'loading' | 'ready' | 'not_ready' | 'probe_failed';
      message: string | null;
      command: string | null;
    };
  };
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
  { group: 'convex', label: 'Convex' },
  { group: 'supporting', label: 'Supporting contracts' },
  { group: 'agent', label: 'Agent and form targets' },
];

const CONTEXTURE_MCP_BIN_PATH =
  '/Applications/Contexture.app/Contents/Resources/bin/contexture-mcp';

const CODEX_MCP_INSTALL_COMMAND = `codex mcp add contexture -- ${CONTEXTURE_MCP_BIN_PATH}`;

const CONVEX_AI_FILES_INSTALL_COMMAND = 'bunx convex ai-files install';

const CONVEX_AI_FILES_STATUS_COMMAND = 'bunx convex ai-files status';

const CLAUDE_CODE_MCP_INSTALL_COMMAND = `claude mcp add --transport stdio --scope user contexture -- ${CONTEXTURE_MCP_BIN_PATH}`;

const CLAUDE_DESKTOP_CONFIG_PATH =
  '~/Library/Application Support/Claude/claude_desktop_config.json';

const CLAUDE_DESKTOP_CONFIG_SNIPPET = `{
  "mcpServers": {
    "contexture": {
      "command": "${CONTEXTURE_MCP_BIN_PATH}"
    }
  }
}`;

type AgentClient = 'codex' | 'claude-code' | 'claude-desktop';

const AGENT_CLIENT_LABEL: Record<AgentClient, string> = {
  codex: 'Codex',
  'claude-code': 'Claude Code',
  'claude-desktop': 'Claude Desktop',
};

const CONTEXTURE_MCP_TOOLS = [
  'inspect_contexture',
  'inspect_domain_brief',
  'validate_contexture',
  'apply_contexture_op',
  'emit_contexture',
  'check_contexture_drift',
] as const;

type AgentSetupCopyKey = 'install' | 'convex-ai-files' | 'prompt' | 'smoke';

interface OutputOption {
  type: SchemaOutputType;
  source: string;
  group: GeneratedTargetGroup;
  label: string;
  help: string;
  language: GeneratedTargetLanguage;
  fileName: string;
  dir: string | null;
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
  onOutputDirChange,
  documentFilePath = null,
  schema,
  onOpenGeneratedFile,
  onRequestSave,
  convexVersion,
}: SchemaPanelProps): React.JSX.Element {
  const [activeOutput, setActiveOutput] = useState<GeneratedTargetKind>('convex');
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);
  const [fontSizeIndex, setFontSizeIndex] = useState<number>(DEFAULT_FONT_SIZE_INDEX);
  const [copied, setCopied] = useState(false);
  const [agentCopied, setAgentCopied] = useState<AgentSetupCopyKey | null>(null);
  const copyTimeoutRef = useRef<number | null>(null);
  const agentCopyTimeoutRef = useRef<number | null>(null);
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
          dir: schema ? generatedTargetOutputDir(schema, type) : null,
          enabled,
        };
      });
  }, [additionalSources, convexSource, jsonSource, schema, schemaFileName, sources, zodSource]);

  const configOptions = useMemo<OutputOption[]>(
    () => [
      ...outputOptions,
      {
        type: 'stdlib-runtime',
        source: '',
        group: 'supporting',
        label: 'Stdlib runtime',
        help: 'Generated runtime modules for stdlib types referenced by this schema.',
        language: 'typescript',
        fileName: 'contexture-runtime/*.ts',
        dir: schema?.outputs?.stdlibRuntime?.dir ?? null,
        enabled: true,
      },
    ],
    [outputOptions, schema?.outputs?.stdlibRuntime?.dir],
  );

  const enabledOutputOptions = useMemo(
    () =>
      outputOptions.filter(
        (output): output is OutputOption & { type: GeneratedTargetKind } =>
          output.enabled && output.type !== 'stdlib-runtime',
      ),
    [outputOptions],
  );

  useEffect(() => {
    const active = enabledOutputOptions.find((output) => output.type === activeOutput);
    const firstWithSource = enabledOutputOptions.find((output) => output.source.trim().length > 0);
    if (!active || (active.source.trim().length === 0 && firstWithSource)) {
      setActiveOutput(firstWithSource?.type ?? enabledOutputOptions[0]?.type ?? 'convex');
    }
  }, [activeOutput, enabledOutputOptions]);

  const selectedOutput =
    enabledOutputOptions.find((output) => output.type === activeOutput) ?? enabledOutputOptions[0];
  const activeSource = selectedOutput?.source ?? '';
  const selectedOutputPath =
    selectedOutput && documentFilePath
      ? safePreviewTargetPath(selectedOutput, documentFilePath, schema)
      : null;
  const selectedOutputDisplayPath =
    selectedOutput && documentFilePath && selectedOutputPath
      ? manifestKeyForGeneratedPath(documentFilePath, selectedOutputPath)
      : (selectedOutput?.fileName ?? 'schema.ts');

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
      if (agentCopyTimeoutRef.current !== null) {
        window.clearTimeout(agentCopyTimeoutRef.current);
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

  const handleAgentCopy = (key: AgentSetupCopyKey, text: string): void => {
    onCopy?.(text);
    setAgentCopied(key);
    if (agentCopyTimeoutRef.current !== null) {
      window.clearTimeout(agentCopyTimeoutRef.current);
    }
    agentCopyTimeoutRef.current = window.setTimeout(() => {
      setAgentCopied(null);
      agentCopyTimeoutRef.current = null;
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
              Add a type to the canvas to see generated Convex schema and validators.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
        <div className="px-3 pb-3">
          <AgentSetupPopover
            documentFilePath={documentFilePath}
            convexVersion={convexVersion}
            copied={agentCopied}
            onCopy={handleAgentCopy}
            onRequestSave={onRequestSave}
          />
        </div>
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
        <div className="pt-2">
          <AgentSetupPopover
            documentFilePath={documentFilePath}
            convexVersion={convexVersion}
            copied={agentCopied}
            onCopy={handleAgentCopy}
            onRequestSave={onRequestSave}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col p-3" data-testid="schema-panel">
      <div className="mb-2">
        <AgentSetupPopover
          documentFilePath={documentFilePath}
          convexVersion={convexVersion}
          copied={agentCopied}
          onCopy={handleAgentCopy}
          onRequestSave={onRequestSave}
        />
      </div>
      <div className="group relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-background text-foreground shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/80 px-2 py-2 text-xs text-muted-foreground">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <FileCode className="size-3.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <OutputSelect
                  activeOutput={activeOutput}
                  enabledOptions={enabledOutputOptions}
                  onValueChange={(type) => {
                    setActiveOutput(type);
                    setHighlightedHtml(null);
                  }}
                />
                <OutputConfigPopover
                  options={configOptions}
                  documentFilePath={documentFilePath}
                  schema={schema}
                  onEnableOutput={(type) => {
                    setActiveOutput(type);
                    setHighlightedHtml(null);
                    onEnableOutput?.(type);
                  }}
                  onOutputDirChange={onOutputDirChange}
                />
              </div>
              <div className="truncate font-mono text-[10px]" data-testid="schema-filename">
                {selectedOutputDisplayPath}
              </div>
              <div
                className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80"
                data-testid="schema-output-boundary"
              >
                Read-only generated output
              </div>
              {selectedOutput?.group === 'convex' && convexVersion?.emitterVersion ? (
                <div
                  className={`mt-0.5 truncate text-[10px] ${
                    convexVersion.status === 'mismatch' || convexVersion.status === 'target_missing'
                      ? 'text-warning'
                      : 'text-muted-foreground'
                  }`}
                  title={convexVersionTooltip(convexVersion)}
                  data-testid="schema-convex-version"
                >
                  {convexVersion.status === 'mismatch'
                    ? 'Convex version mismatch'
                    : convexVersion.status === 'target_missing'
                      ? 'Convex package missing'
                      : convexVersionLabel(convexVersion)}
                </div>
              ) : null}
            </div>
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

function convexVersionLabel(version: NonNullable<SchemaPanelProps['convexVersion']>): string {
  if (version.status === 'loading') return 'Checking Convex version...';
  if (version.targetVersion) {
    if (version.status === 'ok') {
      return `Convex ${version.emitterVersion} · emitter and target app`;
    }
    return `Emitter Convex ${version.emitterVersion} · target app ${version.targetVersion}`;
  }
  return `Emitter Convex ${version.emitterVersion}`;
}

function convexVersionTooltip(version: NonNullable<SchemaPanelProps['convexVersion']>): string {
  return [
    `Contexture emitter Convex: ${version.emitterVersion ?? 'unknown'}`,
    `Target app Convex: ${version.targetVersion ?? 'not detected'}`,
    version.targetPackagePath ? `Target package: ${version.targetPackagePath}` : null,
    version.message,
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n');
}

function safeGeneratedTargetPath(
  type: GeneratedTargetKind,
  documentFilePath: string,
  schema?: Schema,
): string | null {
  try {
    return generatedTargetPath(type, documentFilePath, schema);
  } catch {
    return null;
  }
}

function safePreviewTargetPath(
  output: OutputOption,
  documentFilePath: string,
  schema?: Schema,
): string | null {
  if (output.type === 'stdlib-runtime') return null;
  return safeGeneratedTargetPath(output.type, documentFilePath, schema);
}

function OutputSelect({
  activeOutput,
  enabledOptions,
  onValueChange,
}: {
  activeOutput: GeneratedTargetKind;
  enabledOptions: OutputOption[];
  onValueChange: (type: GeneratedTargetKind) => void;
}): React.JSX.Element {
  return (
    <Select
      value={activeOutput}
      onValueChange={(value) => onValueChange(value as GeneratedTargetKind)}
    >
      <SelectTrigger
        className="h-7 min-w-0 flex-1 border-border/70 bg-background/80 px-2 py-1 text-xs"
        aria-label="Generated output"
        data-testid="schema-output-selector"
      >
        <SelectValue placeholder="Select output" />
      </SelectTrigger>
      <SelectContent align="start" className="max-h-80">
        {OUTPUT_GROUPS.map(({ group, label }) => {
          const groupOutputs = enabledOptions.filter((output) => output.group === group);
          if (groupOutputs.length === 0) return null;
          return (
            <SelectGroup key={group} data-testid={`schema-group-${group}`}>
              <SelectLabel className="py-1 pl-2 pr-2 text-[10px] uppercase tracking-wider text-muted-foreground/70">
                {label}
              </SelectLabel>
              {groupOutputs.map((output) => (
                <SelectItem
                  key={output.type}
                  value={output.type}
                  className="text-xs"
                  data-testid={`schema-output-${output.type}`}
                >
                  {output.label}
                </SelectItem>
              ))}
              <SelectSeparator />
            </SelectGroup>
          );
        })}
      </SelectContent>
    </Select>
  );
}

function OutputConfigPopover({
  options,
  documentFilePath,
  schema,
  onEnableOutput,
  onOutputDirChange,
}: {
  options: OutputOption[];
  documentFilePath: string | null;
  schema?: Schema;
  onEnableOutput?: (type: GeneratedTargetKind) => void;
  onOutputDirChange?: (type: SchemaOutputType, dir: string | null) => void;
}): React.JSX.Element {
  return (
    <Popover>
      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-7 shrink-0"
                aria-label="Configure generated outputs"
                title="Configure generated outputs"
                data-testid="schema-output-config"
              >
                <Settings2 className="size-3.5" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Configure generated outputs
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PopoverContent className="w-[420px] p-2" align="end">
        <div className="mb-2 px-1">
          <div className="text-xs font-semibold text-foreground">Generated outputs</div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Set IR-relative folders for each generated target. Empty folders use Contexture's
            default layout.
          </p>
        </div>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
          {OUTPUT_GROUPS.map(({ group, label }) => {
            const groupOutputs = options.filter((output) => output.group === group);
            if (groupOutputs.length === 0) return null;
            return (
              <div key={group} data-testid={`schema-group-${group}`}>
                <div className="px-1 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {label}
                </div>
                {groupOutputs.map((output) => (
                  <OutputConfigRow
                    key={output.type}
                    output={output}
                    documentFilePath={documentFilePath}
                    schema={schema}
                    onEnableOutput={onEnableOutput}
                    onOutputDirChange={onOutputDirChange}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function OutputConfigRow({
  output,
  documentFilePath,
  schema,
  onEnableOutput,
  onOutputDirChange,
}: {
  output: OutputOption;
  documentFilePath: string | null;
  schema?: Schema;
  onEnableOutput?: (type: GeneratedTargetKind) => void;
  onOutputDirChange?: (type: SchemaOutputType, dir: string | null) => void;
}): React.JSX.Element {
  const inputId = `output-dir-${output.type}`;
  const defaultDir = defaultOutputDirFor(output.type, documentFilePath, output.fileName, schema);
  const [draft, setDraft] = useState(output.dir ?? '');

  useEffect(() => {
    setDraft(output.dir ?? '');
  }, [output.dir]);

  const validation = validateOutputDirDraft(draft);
  const canApply = validation === null && draft.trim() !== (output.dir ?? '');

  const applyDraft = (): void => {
    if (!canApply) return;
    const normalized = normalizeOutputDirDraft(draft);
    onOutputDirChange?.(output.type, normalized === '' ? null : normalized);
  };

  return (
    <div
      className="rounded-md border border-border/70 bg-background/80 px-2 py-2"
      data-testid={`schema-output-${output.type}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-xs font-medium text-foreground">{output.label}</span>
            {!output.enabled ? (
              <span className="rounded border border-border px-1 py-0.5 text-[10px] text-muted-foreground">
                Off
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{output.help}</p>
        </div>
        {!output.enabled ? (
          <Button
            type="button"
            variant="secondary"
            className="h-7 shrink-0 px-2 text-xs"
            onClick={() => {
              if (output.type !== 'stdlib-runtime') onEnableOutput?.(output.type);
            }}
            data-testid={`schema-enable-${output.type}`}
          >
            Enable
          </Button>
        ) : null}
      </div>
      <div className="mt-2 grid gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={inputId} className="text-[11px] text-muted-foreground">
            Output folder
          </Label>
          {output.dir ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-6"
              onClick={() => onOutputDirChange?.(output.type, null)}
              aria-label={`Reset ${output.label} output folder`}
              title={`Reset ${output.label} output folder`}
              data-testid={`schema-output-dir-reset-${output.type}`}
            >
              <RotateCcw className="size-3" />
            </Button>
          ) : null}
        </div>
        <div className="flex gap-1.5">
          <Input
            id={inputId}
            value={draft}
            placeholder={defaultDir}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={applyDraft}
            onKeyDown={(event) => {
              if (event.key === 'Enter') applyDraft();
            }}
            className="h-8 font-mono text-xs"
            aria-invalid={validation !== null}
            data-testid={`schema-output-dir-${output.type}`}
          />
          <Button
            type="button"
            variant="secondary"
            className="h-8 px-2 text-xs"
            disabled={!canApply}
            onClick={applyDraft}
            data-testid={`schema-output-dir-apply-${output.type}`}
          >
            Apply
          </Button>
        </div>
        <p
          className={`text-[10px] leading-snug ${
            validation ? 'text-destructive' : 'text-muted-foreground'
          }`}
          data-testid={`schema-output-dir-help-${output.type}`}
        >
          {validation ?? `Default: ${defaultDir}`}
        </p>
      </div>
    </div>
  );
}

function defaultOutputDirFor(
  type: SchemaOutputType,
  documentFilePath: string | null,
  fallbackPath: string,
  schema?: Schema,
): string {
  if (documentFilePath) {
    if (type === 'stdlib-runtime') {
      return dirname(
        manifestKeyForGeneratedPath(
          documentFilePath,
          bundlePathsFor(documentFilePath, schema).stdlibRuntimeDir,
        ),
      );
    }
    const path = safeGeneratedTargetPath(type, documentFilePath, schema);
    if (path) return dirname(manifestKeyForGeneratedPath(documentFilePath, path));
  }
  return dirname(fallbackPath);
}

function validateOutputDirDraft(value: string): string | null {
  const normalized = normalizeOutputDirDraft(value);
  if (normalized === '') return null;
  if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) {
    return 'Use a relative folder path.';
  }
  if (normalized === '..' || normalized.startsWith('../')) {
    return 'Folder must stay within the directory containing the IR.';
  }
  return null;
}

function normalizeOutputDirDraft(value: string): string {
  return value.trim().replaceAll('\\', '/').replace(/\/+/g, '/').replace(/^\.\//, '');
}

function dirname(path: string): string {
  const slash = path.lastIndexOf('/');
  if (slash <= 0) return slash === 0 ? '/' : '.';
  return path.slice(0, slash);
}

function AgentSetupPopover({
  documentFilePath,
  convexVersion,
  copied,
  onCopy,
  onRequestSave,
}: {
  documentFilePath: string | null;
  convexVersion?: SchemaPanelProps['convexVersion'];
  copied: AgentSetupCopyKey | null;
  onCopy: (key: AgentSetupCopyKey, text: string) => void;
  onRequestSave?: () => void;
}): React.JSX.Element {
  const [activeClient, setActiveClient] = useState<AgentClient>('codex');
  const convexPackageStatus = setupConvexPackageStatus(convexVersion);
  const convexAiFilesStatus = setupAgentReadinessStatus(convexVersion?.convexAiFiles);
  const contextureMcpStatus = setupAgentReadinessStatus(convexVersion?.contextureMcp);
  const savedPrompt =
    documentFilePath === null
      ? null
      : `Use Convex AI files for Convex implementation choices. Use the Contexture MCP server to inspect ${documentFilePath}, inspect the domain brief for unresolved decisions, propose reviewable Convex model changes, emit convex/schema.ts and convex/validators.ts, then check drift before finishing. Do not edit @contexture-generated files directly.`;
  const smokeTest =
    documentFilePath === null
      ? 'Ask your agent: "List the contexture MCP tools."'
      : `Ask your agent: "List the contexture MCP tools, then inspect ${documentFilePath}, read the domain brief, check Convex AI files with '${CONVEX_AI_FILES_STATUS_COMMAND}', and summarize the Convex tables plus unresolved decisions."`;
  const copiedLabel =
    copied === 'install'
      ? 'Copied install command'
      : copied === 'convex-ai-files'
        ? 'Copied Convex AI files command'
        : copied === 'prompt'
          ? 'Copied saved-document prompt'
          : copied === 'smoke'
            ? 'Copied smoke test'
            : '';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          className="h-auto w-full justify-start gap-2 px-2 py-2 text-left"
          aria-label="Open setup readiness"
          data-testid="agent-setup"
        >
          <PlugZap className="size-3.5 shrink-0 text-accent" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-xs font-semibold">Setup readiness</span>
            <span className="block text-[11px] font-normal text-muted-foreground">
              {savedPrompt === null ? 'Save to create agent prompt' : 'Prompt ready'}
            </span>
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[430px] p-2" align="end" data-testid="agent-setup-content">
        <div className="mb-2 px-1">
          <h3 id="agent-setup-title" className="text-xs font-semibold text-foreground">
            Setup readiness
          </h3>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Connect an agent to inspect, edit, emit, and check drift through Contexture MCP.
          </p>
        </div>

        <div className="mb-2 space-y-1.5">
          <SetupReadinessRow
            label="Convex package"
            status={convexPackageStatus.status}
            description={convexPackageStatus.description}
          />
          <SetupReadinessRow
            label="Convex AI files"
            status={convexAiFilesStatus.status}
            description={convexAiFilesStatus.description}
            actionLabel="Copy install"
            onAction={() => onCopy('convex-ai-files', CONVEX_AI_FILES_INSTALL_COMMAND)}
          />
          <SetupReadinessRow
            label="Contexture MCP"
            status={contextureMcpStatus.status}
            description={contextureMcpStatus.description}
            actionLabel="Choose client"
          />
        </div>

        <Tabs
          value={activeClient}
          onValueChange={(value) => setActiveClient(value as AgentClient)}
          className="mb-2"
        >
          <TabsList
            className="grid h-8 w-full grid-cols-3 p-0.5"
            aria-label="MCP client install instructions"
          >
            <TabsTrigger
              value="codex"
              className="h-7 px-1 text-[11px]"
              data-testid="agent-setup-tab-codex"
            >
              {AGENT_CLIENT_LABEL.codex}
            </TabsTrigger>
            <TabsTrigger
              value="claude-code"
              className="h-7 px-1 text-[11px]"
              data-testid="agent-setup-tab-claude-code"
            >
              {AGENT_CLIENT_LABEL['claude-code']}
            </TabsTrigger>
            <TabsTrigger
              value="claude-desktop"
              className="h-7 px-1 text-[11px]"
              data-testid="agent-setup-tab-claude-desktop"
            >
              {AGENT_CLIENT_LABEL['claude-desktop']}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="codex" className="mt-2">
            <AgentCopyRow
              label="Codex MCP command"
              value={CODEX_MCP_INSTALL_COMMAND}
              copied={copied === 'install'}
              onCopy={() => onCopy('install', CODEX_MCP_INSTALL_COMMAND)}
              copyLabel="Copy Codex MCP install command"
              testId="agent-setup-install"
            />
            <p className="mt-1.5 px-1 text-[10px] leading-snug text-muted-foreground">
              Run in a terminal. Codex picks the server up on the next session.
            </p>
          </TabsContent>

          <TabsContent value="claude-code" className="mt-2">
            <AgentCopyRow
              label="Claude Code install command"
              value={CLAUDE_CODE_MCP_INSTALL_COMMAND}
              copied={copied === 'install'}
              onCopy={() => onCopy('install', CLAUDE_CODE_MCP_INSTALL_COMMAND)}
              copyLabel="Copy Claude Code MCP install command"
              testId="agent-setup-claude-code-install"
            />
            <p className="mt-1.5 px-1 text-[10px] leading-snug text-muted-foreground">
              Run in a terminal. <code className="font-mono">--scope user</code> makes the server
              available in every project; drop it to scope to the current directory. Verify with{' '}
              <code className="font-mono">/mcp</code> inside Claude Code.
            </p>
          </TabsContent>

          <TabsContent value="claude-desktop" className="mt-2">
            <AgentCopyRow
              label="claude_desktop_config.json"
              value={CLAUDE_DESKTOP_CONFIG_SNIPPET}
              copied={copied === 'install'}
              onCopy={() => onCopy('install', CLAUDE_DESKTOP_CONFIG_SNIPPET)}
              copyLabel="Copy Claude Desktop MCP config"
              testId="agent-setup-claude-desktop-install"
            />
            <p className="mt-1.5 px-1 text-[10px] leading-snug text-muted-foreground">
              Merge into{' '}
              <code
                className="font-mono break-all"
                data-testid="agent-setup-claude-desktop-config-path"
              >
                {CLAUDE_DESKTOP_CONFIG_PATH}
              </code>{' '}
              (Settings → Developer → Edit Config), then restart Claude Desktop.
            </p>
          </TabsContent>
        </Tabs>

        <div className="space-y-1.5">
          {savedPrompt === null ? (
            <div
              className="rounded border border-dashed border-border/80 bg-background/60 p-2 text-[11px] leading-snug text-muted-foreground"
              data-testid="agent-setup-unsaved"
            >
              <p>
                Save this document to create a stable .contexture.json path before handing it to an
                agent.
              </p>
              {onRequestSave ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="mt-2 h-7 text-xs"
                  onClick={onRequestSave}
                >
                  Save first
                </Button>
              ) : null}
            </div>
          ) : (
            <AgentCopyRow
              label="Prompt"
              value={savedPrompt}
              copied={copied === 'prompt'}
              onCopy={() => onCopy('prompt', savedPrompt)}
              copyLabel="Copy saved-document prompt"
              testId="agent-setup-prompt"
            />
          )}

          <AgentCopyRow
            label="Smoke test"
            value={smokeTest}
            copied={copied === 'smoke'}
            onCopy={() => onCopy('smoke', smokeTest)}
            copyLabel="Copy MCP smoke test"
            testId="agent-setup-smoke"
          />
        </div>

        <details className="mt-2 rounded border border-border/60 bg-background/50 px-2 py-1.5">
          <summary className="cursor-pointer text-[11px] font-medium text-muted-foreground">
            Advanced
          </summary>
          <ul className="mt-1.5 flex flex-wrap gap-1 text-[10px]" aria-label="Contexture MCP tools">
            {CONTEXTURE_MCP_TOOLS.map((tool) => (
              <li key={tool}>
                <code className="rounded border border-border/70 bg-background/70 px-1.5 py-0.5 font-mono text-muted-foreground">
                  {tool}
                </code>
              </li>
            ))}
          </ul>
        </details>
        <p className="sr-only" aria-live="polite">
          {copiedLabel}
        </p>
      </PopoverContent>
    </Popover>
  );
}

type SetupReadinessStatus = 'ready' | 'needs_action' | 'unknown';

function setupConvexPackageStatus(convexVersion: SchemaPanelProps['convexVersion']): {
  status: SetupReadinessStatus;
  description: string;
} {
  if (!convexVersion || convexVersion.status === 'idle' || convexVersion.status === 'loading') {
    return { status: 'unknown', description: 'Checking the project Convex package.' };
  }
  if (convexVersion.status === 'ok') {
    const version = convexVersion.targetVersion ?? convexVersion.emitterVersion ?? 'installed';
    return { status: 'ready', description: `Installed ${version}.` };
  }
  if (convexVersion.status === 'mismatch') {
    return {
      status: 'needs_action',
      description: convexVersion.message ?? 'Target app version differs from the emitter.',
    };
  }
  if (convexVersion.status === 'target_missing') {
    return {
      status: 'needs_action',
      description: convexVersion.message ?? 'Install Convex in the target app.',
    };
  }
  return {
    status: 'unknown',
    description: convexVersion.message ?? 'Convex package status could not be checked.',
  };
}

function setupAgentReadinessStatus(
  check:
    | {
        status: 'idle' | 'loading' | 'ready' | 'not_ready' | 'probe_failed';
        message: string | null;
        command: string | null;
      }
    | undefined,
): { status: SetupReadinessStatus; description: string } {
  if (!check || check.status === 'idle' || check.status === 'loading') {
    return { status: 'unknown', description: 'Checking setup status.' };
  }
  if (check.status === 'ready') {
    return { status: 'ready', description: 'Detected and ready.' };
  }
  if (check.status === 'not_ready') {
    return {
      status: 'needs_action',
      description: check.message || 'Setup is not ready yet.',
    };
  }
  return {
    status: 'needs_action',
    description: check.message || 'Setup status could not be checked.',
  };
}

function SetupReadinessRow({
  label,
  status,
  description,
  actionLabel,
  onAction,
}: {
  label: string;
  status: SetupReadinessStatus;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}): React.JSX.Element {
  const statusLabel =
    status === 'ready' ? 'Ready' : status === 'needs_action' ? 'Needs action' : 'Not checked';
  const indicatorClass =
    status === 'ready'
      ? 'border-success/70 bg-success/15'
      : status === 'needs_action'
        ? 'border-warning/70 bg-warning/15'
        : 'border-muted-foreground/40 bg-muted/20';

  return (
    <div className="flex items-center gap-2 rounded border border-border/70 bg-background/70 px-2 py-1.5">
      <span className="sr-only">{`${label}: ${statusLabel}. ${description}`}</span>
      <span className={`size-2.5 shrink-0 rounded-full border ${indicatorClass}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] font-medium text-foreground">{label}</span>
          <span className="text-[10px] text-muted-foreground">{statusLabel}</span>
        </div>
        <p className="truncate text-[10px] text-muted-foreground">{description}</p>
      </div>
      {actionLabel && onAction ? (
        <Button
          type="button"
          variant="ghost"
          className="h-6 shrink-0 px-2 text-[11px]"
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      ) : actionLabel ? (
        <span className="shrink-0 text-[10px] text-muted-foreground">{actionLabel}</span>
      ) : null}
    </div>
  );
}

function AgentCopyRow({
  label,
  value,
  copied,
  onCopy,
  copyLabel,
  testId,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
  copyLabel: string;
  testId: string;
}): React.JSX.Element {
  return (
    <div className="rounded border border-border/70 bg-background/70 p-1.5" data-testid={testId}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase leading-none tracking-wider text-muted-foreground/70">
          {label}
        </span>
        <Button
          size="icon"
          type="button"
          variant="ghost"
          className="size-6"
          onClick={onCopy}
          aria-label={copyLabel}
          title={copied ? 'Copied' : copyLabel}
          data-testid={`${testId}-copy`}
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        </Button>
      </div>
      <pre
        data-testid={`${testId}-value`}
        className="max-h-20 overflow-auto whitespace-pre-wrap break-all rounded border border-border/50 bg-muted/20 p-1.5 font-mono text-[11px] leading-snug text-foreground"
      >
        {value}
      </pre>
    </div>
  );
}
