import {
  buildDomainBrief,
  type DomainDecision,
  type DomainReviewItem,
} from '@contexture/core/domain-brief';
import type { Schema } from '@contexture/core/ir';
import { useChatComposerStore } from '@renderer/store/chat-composer';
import { useGraphSelectionStore } from '@renderer/store/selection';
import { useUIChromeStore } from '@renderer/store/ui-chrome';
import { STDLIB_REGISTRY } from '@shared/stdlib-registry';
import {
  AlertTriangle,
  CheckCircle2,
  FileJson2,
  Lightbulb,
  LocateFixed,
  MessageSquare,
  Search,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '../ui/empty';
import { Input } from '../ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';

interface ReviewPanelProps {
  schema: Schema;
}

type ReviewTab = 'unresolved' | 'declared';

export function ReviewPanel({ schema }: ReviewPanelProps): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<ReviewTab>('unresolved');
  const brief = useMemo(() => buildDomainBrief(schema, { stdlib: STDLIB_REGISTRY }), [schema]);
  const normalizedQuery = query.trim().toLowerCase();
  const unresolved = useMemo(
    () =>
      brief.unresolvedDecisions.filter((item) =>
        reviewItemHaystack(item).includes(normalizedQuery),
      ),
    [brief.unresolvedDecisions, normalizedQuery],
  );
  const declared = useMemo(
    () =>
      brief.declaredDecisions.filter((decision) =>
        decisionHaystack(decision).includes(normalizedQuery),
      ),
    [brief.declaredDecisions, normalizedQuery],
  );

  if (schema.types.length === 0) {
    return (
      <PanelEmpty
        icon={<FileJson2 />}
        title="No model to review"
        description="Create or open a Contexture model to review domain decisions."
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="review-panel">
      <div className="border-b border-border p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Domain review</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Agent preflight for model contracts and unresolved decisions.
            </p>
          </div>
          <Badge variant={brief.summary.unresolvedDecisionCount > 0 ? 'outline' : 'secondary'}>
            {brief.summary.unresolvedDecisionCount === 0
              ? 'Ready'
              : `${brief.summary.unresolvedDecisionCount} open`}
          </Badge>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <Metric label="Tables" value={brief.summary.tableCount} />
          <Metric label="Contracts" value={brief.declaredDecisions.length} />
          <Metric label="Open" value={brief.summary.unresolvedDecisionCount} />
        </div>

        <div className="relative mt-3">
          <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search review"
            className="h-8 pl-7 text-xs"
          />
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as ReviewTab)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="border-b border-border px-3 py-2">
          <TabsList className="grid h-8 w-full grid-cols-2">
            <TabsTrigger value="unresolved" className="text-xs">
              Unresolved
            </TabsTrigger>
            <TabsTrigger value="declared" className="text-xs">
              Declared
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="unresolved" className="m-0 min-h-0 flex-1 overflow-y-auto">
          {unresolved.length === 0 ? (
            <PanelEmpty
              icon={normalizedQuery ? <Search /> : <CheckCircle2 />}
              title={normalizedQuery ? 'No matching items' : 'No unresolved decisions'}
              description={
                normalizedQuery
                  ? 'Adjust the search text.'
                  : 'Contexture did not find model-level gaps that need attention before app code.'
              }
            />
          ) : (
            <div className="divide-y divide-border">
              {unresolved.map((item) => (
                <ReviewItemRow key={item.id} item={item} schema={schema} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="declared" className="m-0 min-h-0 flex-1 overflow-y-auto">
          {declared.length === 0 ? (
            <PanelEmpty
              icon={normalizedQuery ? <Search /> : <FileJson2 />}
              title={normalizedQuery ? 'No matching contracts' : 'No declared contracts'}
              description={
                normalizedQuery
                  ? 'Adjust the search text.'
                  : 'Add invariants, derivations, relationships, indexes, or search indexes to make domain decisions explicit.'
              }
            />
          ) : (
            <div className="divide-y divide-border">
              {declared.map((decision) => (
                <DecisionRow key={decision.id} decision={decision} schema={schema} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }): React.JSX.Element {
  return (
    <div className="rounded-md border border-border/70 bg-muted/25 px-2 py-1.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="font-mono text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

function ReviewItemRow({
  item,
  schema,
}: {
  item: DomainReviewItem;
  schema: Schema;
}): React.JSX.Element {
  const focusTarget = targetFromPath(schema, item.path);
  const Icon = item.severity === 'warning' ? AlertTriangle : Lightbulb;
  return (
    <article className="px-3 py-3 text-xs" data-testid="review-unresolved-item">
      <div className="flex items-start gap-2">
        <Icon
          aria-hidden="true"
          className={cn(
            'mt-0.5 size-3.5 shrink-0',
            item.severity === 'warning' ? 'text-warning' : 'text-[var(--inspector-advisory)]',
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-xs font-semibold text-foreground">{item.title}</h3>
            <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[10px]">
              {item.scope}
            </Badge>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.message}</p>
          {item.rationale && (
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/80">
              {item.rationale}
            </p>
          )}
          <div className="mt-2 flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => focusPath(schema, item.path)}
              disabled={!focusTarget}
            >
              <LocateFixed aria-hidden="true" className="size-3.5" />
              Focus
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => discussReviewItem(item, schema)}
            >
              <MessageSquare aria-hidden="true" className="size-3.5" />
              Discuss
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}

function DecisionRow({
  decision,
  schema,
}: {
  decision: DomainDecision;
  schema: Schema;
}): React.JSX.Element {
  const focusTarget = targetFromPath(schema, decision.path);
  return (
    <article className="px-3 py-3 text-xs" data-testid="review-declared-item">
      <div className="flex items-start gap-2">
        <CheckCircle2 aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-success" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-xs font-semibold text-foreground">{decision.title}</h3>
            <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-[10px]">
              {decision.kind}
            </Badge>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{decision.statement}</p>
          <div className="mt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => focusPath(schema, decision.path)}
              disabled={!focusTarget}
            >
              <LocateFixed aria-hidden="true" className="size-3.5" />
              Focus
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}

function focusPath(schema: Schema, path: string): void {
  const target = targetFromPath(schema, path);
  if (!target) return;
  useGraphSelectionStore.getState().click(target.typeName, 'replace');
  if (target.fieldName) {
    useGraphSelectionStore
      .getState()
      .selectField({ typeName: target.typeName, fieldName: target.fieldName });
    useGraphSelectionStore
      .getState()
      .focus({ nodeId: target.typeName, fieldName: target.fieldName });
  } else {
    useGraphSelectionStore.getState().selectField(null);
    useGraphSelectionStore.getState().focus(target.typeName);
  }
  useUIChromeStore.getState().setSidebarTab('properties');
  useUIChromeStore.getState().setSidebarVisible(true);
}

function targetFromPath(
  schema: Schema,
  path: string,
): { typeName: string; fieldName?: string } | null {
  const match = path.match(/^types\.(\d+)(?:\.fields\.(\d+))?/u);
  if (!match) return null;
  const type = schema.types[Number(match[1])];
  if (!type) return null;
  if (type.kind === 'object' && match[2] !== undefined) {
    const field = type.fields[Number(match[2])];
    if (field) return { typeName: type.name, fieldName: field.name };
  }
  return { typeName: type.name };
}

function discussReviewItem(item: DomainReviewItem, schema: Schema): void {
  const target = targetFromPath(schema, item.path);
  useChatComposerStore.getState().setPendingChatMessage({
    message: [
      `Review this Contexture domain decision: ${item.title}`,
      '',
      item.message,
      item.rationale ? `\nRationale: ${item.rationale}` : '',
      target
        ? `\nScope: ${target.fieldName ? `${target.typeName}.${target.fieldName}` : target.typeName}`
        : '',
    ]
      .filter(Boolean)
      .join('\n'),
    context: '',
  });
  useUIChromeStore.getState().setSidebarTab('chat');
  useUIChromeStore.getState().setSidebarVisible(true);
}

function reviewItemHaystack(item: DomainReviewItem): string {
  return [item.title, item.scope, item.message, item.rationale, item.kind, item.severity]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function decisionHaystack(decision: DomainDecision): string {
  return [decision.title, decision.scope, decision.statement, decision.kind]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function PanelEmpty({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}): React.JSX.Element {
  return (
    <Empty className="h-full border-0 p-4">
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle className="text-sm font-medium">{title}</EmptyTitle>
        <EmptyDescription className="max-w-[32ch] text-xs">{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
