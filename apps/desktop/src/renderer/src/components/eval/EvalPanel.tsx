import { serializeToTurtle } from '@renderer/model/serialize';
import {
  type EvalEffort,
  type EvalModelId,
  type EvalReport as EvalReportType,
  useEvalStore,
} from '@renderer/store/eval';
import { useOntologyStore } from '@renderer/store/ontology';
import { useUIStore } from '@renderer/store/ui';
import { code } from '@streamdown/code';
import {
  ChevronDown,
  ChevronRight,
  ClipboardList,
  MessageSquarePlus,
  Play,
  Square,
  Wand2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Streamdown } from 'streamdown';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

const AUTH_MODE_STORAGE = 'contexture-auth-mode';
const API_KEY_STORAGE = 'contexture-api-key';

function getAuth(): { mode: 'api-key'; key: string } | { mode: 'max' } {
  const mode = (localStorage.getItem(AUTH_MODE_STORAGE) || 'max') as 'max' | 'api-key';
  if (mode === 'api-key') {
    return { mode: 'api-key', key: localStorage.getItem(API_KEY_STORAGE) || '' };
  }
  return { mode: 'max' };
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-500';
  if (score >= 60) return 'text-yellow-500';
  return 'text-red-500';
}

function scoreBg(score: number): string {
  if (score >= 80) return 'bg-green-500/10 border-green-500/20';
  if (score >= 60) return 'bg-yellow-500/10 border-yellow-500/20';
  return 'bg-red-500/10 border-red-500/20';
}

export function EvalPanel(): React.JSX.Element {
  const config = useEvalStore((s) => s.config);
  const setConfig = useEvalStore((s) => s.setConfig);
  const status = useEvalStore((s) => s.status);
  const streamText = useEvalStore((s) => s.streamText);
  const report = useEvalStore((s) => s.report);
  const error = useEvalStore((s) => s.error);
  const startEval = useEvalStore((s) => s.startEval);
  const setStreamText = useEvalStore((s) => s.setStreamText);
  const setReport = useEvalStore((s) => s.setReport);
  const setError = useEvalStore((s) => s.setError);
  const selectedSuggestions = useEvalStore((s) => s.selectedSuggestions);
  const completedSuggestions = useEvalStore((s) => s.completedSuggestions);
  const toggleSuggestion = useEvalStore((s) => s.toggleSuggestion);
  const clearSelections = useEvalStore((s) => s.clearSelections);
  const markSuggestionsComplete = useEvalStore((s) => s.markSuggestionsComplete);
  const startImprovements = useEvalStore((s) => s.startImprovements);

  const filePath = useOntologyStore((s) => s.filePath);
  const ontology = useOntologyStore((s) => s.ontology);

  const setChatDraft = useUIStore((s) => s.setChatDraft);
  const setSidebarTab = useUIStore((s) => s.setSidebarTab);
  const setPendingChatMessage = useUIStore((s) => s.setPendingChatMessage);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sidecarPath = useCallback((): string | null => {
    if (!filePath || filePath.startsWith('sample://') || filePath.startsWith('Sample:'))
      return null;
    return filePath.replace(/\.ttl$/, '.eval.json');
  }, [filePath]);

  const saveSidecar = useCallback(
    async (data: object) => {
      const path = sidecarPath();
      if (!path) return;
      await window.api.saveFile(path, JSON.stringify(data, null, 2));
    },
    [sidecarPath],
  );

  // Load sidecar when file path changes
  useEffect(() => {
    const path = sidecarPath();
    if (!path) return;
    window.api.readFileSilent(path).then((content) => {
      if (!content) return;
      try {
        const data = JSON.parse(content);
        setConfig({
          domain: data.domain || '',
          intendedUse: data.intendedUse || '',
          model: data.model || 'claude-sonnet-4-6',
          effort: data.effort || 'auto',
        });
        if (data.lastReport) {
          setReport(data.lastReport);
        }
        if (data.completedSuggestions?.length) {
          markSuggestionsComplete(data.completedSuggestions);
        }
      } catch {
        // ignore malformed sidecar
      }
    });
  }, [markSuggestionsComplete, setConfig, setReport, sidecarPath]); // eslint-disable-line react-hooks/exhaustive-deps

  // Register eval event listeners
  useEffect(() => {
    const cleanups = [
      window.api.onEvalText((text: string) => setStreamText(text)),
      window.api.onEvalResult((reportJson: string) => {
        const parsed = JSON.parse(reportJson);
        const withTimestamp = { ...parsed, timestamp: new Date().toISOString() };
        setReport(withTimestamp);
        const currentConfig = useEvalStore.getState().config;
        const currentCompleted = useEvalStore.getState().completedSuggestions;
        saveSidecar({
          domain: currentConfig.domain,
          intendedUse: currentConfig.intendedUse,
          model: currentConfig.model,
          effort: currentConfig.effort,
          lastReport: withTimestamp,
          completedSuggestions: currentCompleted,
        });
      }),
      window.api.onEvalError((err: string) => setError(err)),
    ];
    return () => {
      for (const fn of cleanups) fn();
    };
  }, [saveSidecar, setError, setReport, setStreamText]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced config save
  const handleConfigChange = useCallback(
    (patch: Partial<typeof config>) => {
      setConfig(patch);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        const current = useEvalStore.getState().config;
        const merged = { ...current, ...patch };
        const currentReport = useEvalStore.getState().report;
        const currentCompleted = useEvalStore.getState().completedSuggestions;
        saveSidecar({
          domain: merged.domain,
          intendedUse: merged.intendedUse,
          model: merged.model,
          effort: merged.effort,
          ...(currentReport ? { lastReport: currentReport } : {}),
          ...(currentCompleted.length ? { completedSuggestions: currentCompleted } : {}),
        });
      }, 800);
    },
    [setConfig, saveSidecar],
  );

  const handleRunEval = useCallback(async () => {
    const turtle = serializeToTurtle(ontology);
    const auth = getAuth();
    startEval();
    window.api.runEval({
      turtle,
      domain: config.domain,
      intendedUse: config.intendedUse,
      auth,
      model: config.model,
      effort: config.effort,
    });
  }, [ontology, config, startEval]);

  const handleAbort = useCallback(() => {
    window.api.abortEval();
  }, []);

  const handleSendToChat = useCallback(
    (suggestion: string) => {
      setChatDraft(suggestion);
      setSidebarTab('chat');
    },
    [setChatDraft, setSidebarTab],
  );

  const handleRunImprovements = useCallback(() => {
    const items = [...selectedSuggestions];
    const numbered = items.map((s, i) => `${i + 1}. ${s}`).join('\n');
    const context = `Please address these ontology improvements one at a time. For each one, implement it using your tools, then output exactly "✅ DONE: N" (where N is the improvement number, 1-indexed) before proceeding to the next.`;
    const message = `Improvements to address:\n${numbered}\n\nWork through all improvements in order.`;
    markSuggestionsComplete(items);
    startImprovements(items);
    setPendingChatMessage({ message, context });
    setSidebarTab('chat');
    clearSelections();
    // Persist the completed set immediately
    const state = useEvalStore.getState();
    const newCompleted = [...new Set([...state.completedSuggestions, ...items])];
    saveSidecar({
      domain: state.config.domain,
      intendedUse: state.config.intendedUse,
      model: state.config.model,
      effort: state.config.effort,
      ...(state.report ? { lastReport: state.report } : {}),
      completedSuggestions: newCompleted,
    });
  }, [
    selectedSuggestions,
    markSuggestionsComplete,
    startImprovements,
    setPendingChatMessage,
    setSidebarTab,
    clearSelections,
    saveSidecar,
  ]);

  const canRun =
    config.domain.trim().length > 0 && status !== 'running' && ontology.classes.size > 0;
  const showReport = report && (status === 'complete' || status === 'idle');

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Config form */}
      <div className="p-3 border-b border-border space-y-2 shrink-0">
        <div className="space-y-1">
          <label
            htmlFor="eval-domain"
            className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide"
          >
            Domain
          </label>
          <input
            id="eval-domain"
            type="text"
            value={config.domain}
            onChange={(e) => handleConfigChange({ domain: e.target.value })}
            placeholder="e.g. Clinical trials in oncology"
            className="w-full text-xs bg-input border border-input rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
          />
        </div>
        <div className="space-y-1">
          <label
            htmlFor="eval-intended-use"
            className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide"
          >
            Intended use
          </label>
          <textarea
            id="eval-intended-use"
            value={config.intendedUse}
            onChange={(e) => handleConfigChange({ intendedUse: e.target.value })}
            placeholder="e.g. Reasoning system for drug interactions"
            rows={2}
            className="w-full text-xs bg-input border border-input rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground resize-none"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Select
            value={config.model}
            onValueChange={(v) => handleConfigChange({ model: v as EvalModelId })}
          >
            <SelectTrigger className="w-24 h-7 text-xs border-0 bg-transparent shadow-none focus:ring-0 px-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Model</SelectLabel>
                <SelectItem value="claude-haiku-4-5-20251001">Haiku</SelectItem>
                <SelectItem value="claude-sonnet-4-6">Sonnet</SelectItem>
                <SelectItem value="claude-opus-4-6">Opus</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select
            value={config.effort}
            onValueChange={(v) => handleConfigChange({ effort: v as EvalEffort })}
          >
            <SelectTrigger className="w-20 h-7 text-xs border-0 bg-transparent shadow-none focus:ring-0 px-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Effort</SelectLabel>
                <SelectItem value="auto">Auto</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="med">Med</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <div className="ml-auto">
            {status === 'running' ? (
              <Button
                size="sm"
                variant="destructive"
                onClick={handleAbort}
                className="h-7 text-xs gap-1.5"
              >
                <Square className="size-3 fill-current" />
                Abort
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleRunEval}
                disabled={!canRun}
                className="h-7 text-xs gap-1.5"
              >
                <Play className="size-3 fill-current" />
                Run Eval
              </Button>
            )}
          </div>
        </div>
        {!config.domain.trim() && (
          <p className="text-[10px] text-muted-foreground">Enter a domain to enable evaluation.</p>
        )}
        {ontology.classes.size === 0 && config.domain.trim() && (
          <p className="text-[10px] text-muted-foreground">Open or create an ontology first.</p>
        )}
      </div>

      {/* Results area */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {status === 'idle' && !report && (
          <Empty className="border-0 p-4">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ClipboardList />
              </EmptyMedia>
              <EmptyTitle className="text-sm font-medium">No evaluation yet</EmptyTitle>
              <EmptyDescription className="text-xs">
                Fill in the domain and intended use, then run an eval to score your ontology.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {status === 'running' && (
          <div className="p-3">
            <div className="flex gap-1 items-center text-xs text-muted-foreground mb-3">
              <span className="animate-pulse">●</span>
              <span>Evaluating ontology...</span>
            </div>
            {streamText && (
              <div className="text-sm text-foreground leading-relaxed">
                <Streamdown plugins={{ code }}>{streamText}</Streamdown>
              </div>
            )}
          </div>
        )}

        {status === 'error' && (
          <div className="p-3">
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}

        {showReport && (
          <EvalReport
            report={report as EvalReportType}
            selectedSuggestions={selectedSuggestions}
            completedSuggestions={completedSuggestions}
            onToggleSuggestion={toggleSuggestion}
            onSendToChat={handleSendToChat}
          />
        )}
      </div>

      {/* Run improvements footer */}
      {selectedSuggestions.length > 0 && (
        <div className="shrink-0 border-t border-border p-2.5 flex items-center gap-2">
          <Button size="sm" onClick={handleRunImprovements} className="flex-1 h-7 text-xs gap-1.5">
            <Wand2 className="size-3" />
            Run {selectedSuggestions.length} improvement
            {selectedSuggestions.length !== 1 ? 's' : ''}
          </Button>
          <button
            type="button"
            onClick={clearSelections}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Clear selection"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

function EvalReport({
  report,
  selectedSuggestions,
  completedSuggestions,
  onToggleSuggestion,
  onSendToChat,
}: {
  report: NonNullable<ReturnType<typeof useEvalStore.getState>['report']>;
  selectedSuggestions: string[];
  completedSuggestions: string[];
  onToggleSuggestion: (text: string) => void;
  onSendToChat: (suggestion: string) => void;
}): React.JSX.Element {
  const ts = report.timestamp ? new Date(report.timestamp).toLocaleString() : null;

  return (
    <div className="p-3 space-y-4">
      {/* Overall score */}
      <div className={cn('rounded-lg border p-4 text-center', scoreBg(report.score))}>
        <div className={cn('text-5xl font-bold tabular-nums', scoreColor(report.score))}>
          {report.score}
        </div>
        <div className="text-xs text-muted-foreground mt-1">out of 100</div>
        {report.summary && (
          <p className="text-xs text-foreground mt-3 leading-relaxed text-left">{report.summary}</p>
        )}
        {ts && <p className="text-[10px] text-muted-foreground mt-2">{ts}</p>}
      </div>

      {/* Hint when no selections */}
      {report.dimensions.some((d) => d.suggestions.length > 0) &&
        selectedSuggestions.length === 0 && (
          <p className="text-[10px] text-muted-foreground px-0.5">
            Check suggestions below to queue them for automated improvement.
          </p>
        )}

      {/* Dimensions */}
      <div className="space-y-2">
        {report.dimensions.map((dim) => (
          <DimensionCard
            key={dim.name}
            dimension={dim}
            selectedSuggestions={selectedSuggestions}
            completedSuggestions={completedSuggestions}
            onToggleSuggestion={onToggleSuggestion}
            onSendToChat={onSendToChat}
          />
        ))}
      </div>
    </div>
  );
}

function DimensionCard({
  dimension,
  selectedSuggestions,
  completedSuggestions,
  onToggleSuggestion,
  onSendToChat,
}: {
  dimension: { name: string; score: number; findings: string[]; suggestions: string[] };
  selectedSuggestions: string[];
  completedSuggestions: string[];
  onToggleSuggestion: (text: string) => void;
  onSendToChat: (suggestion: string) => void;
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const selectedCount = dimension.suggestions.filter((s) => selectedSuggestions.includes(s)).length;

  return (
    <div className="rounded-md border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          {expanded ? (
            <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
          )}
          <span className="text-xs font-medium truncate">{dimension.name}</span>
          {selectedCount > 0 && (
            <span className="text-[9px] bg-primary/15 text-primary rounded px-1 py-0.5 font-mono shrink-0">
              {selectedCount}
            </span>
          )}
        </div>
        <span
          className={cn(
            'text-sm font-bold tabular-nums ml-2 shrink-0',
            scoreColor(dimension.score),
          )}
        >
          {dimension.score}
        </span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-border pt-2">
          {dimension.findings.length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                Findings
              </p>
              <ul className="space-y-1">
                {dimension.findings.map((f) => (
                  <li key={f} className="text-xs text-foreground flex gap-1.5">
                    <span className="text-muted-foreground shrink-0 mt-0.5">·</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {dimension.suggestions.length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                Suggestions
              </p>
              <ul className="space-y-2">
                {dimension.suggestions.map((s) => {
                  const completed = completedSuggestions.includes(s);
                  const checked = selectedSuggestions.includes(s);
                  return (
                    <li key={s} className={cn('flex items-start gap-2', completed && 'opacity-50')}>
                      <Checkbox
                        id={`sug-${dimension.name}-${s.slice(0, 20)}`}
                        checked={completed || checked}
                        disabled={completed}
                        onCheckedChange={() => !completed && onToggleSuggestion(s)}
                        className="mt-0.5 shrink-0 size-3.5"
                      />
                      <button
                        type="button"
                        className={cn(
                          'text-xs flex-1 leading-relaxed select-none text-left',
                          completed ? 'line-through text-muted-foreground' : 'cursor-pointer',
                          !completed && checked && 'text-foreground',
                          !completed && !checked && 'text-foreground/80',
                        )}
                        onClick={() => !completed && onToggleSuggestion(s)}
                        disabled={completed}
                      >
                        {s}
                      </button>
                      {!completed && (
                        <button
                          type="button"
                          onClick={() => onSendToChat(s)}
                          title="Send to Chat"
                          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5"
                        >
                          <MessageSquarePlus className="size-3.5" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
