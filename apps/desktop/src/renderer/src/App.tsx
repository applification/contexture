/**
 * Contexture app shell.
 *
 * Layout:
 *   ┌──────────────────────────┬──────────────┐
 *   │                          │              │
 *   │      GraphCanvas         │  SidePanel   │
 *   │                          │  (Detail /   │
 *   │                          │   Chat /     │
 *   │                          │   Eval)      │
 *   │                          │              │
 *   └──────────────────────────┴──────────────┘
 *
 * The SidePanel tabs share real estate between the kind-dispatched
 * DetailPanel (selection-driven), the ChatPanel (schema-design
 * conversation with Claude), and the EvalPanel (sample generation).
 * Only the ChatPanel / DetailPanel / EvalPanel know about their own
 * data flows — this shell just chooses which one is visible and
 * holds the canvas positions map while the layout sidecar UI lands.
 */
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { evalRootCandidates } from './chat/eval-prompt';
import { useClaudeEval } from './chat/useClaudeEval';
import { useClaudeSchemaChat } from './chat/useClaudeSchemaChat';
import { ChatPanel } from './components/chat/ChatPanel';
import { DetailPanel } from './components/detail/DetailPanel';
import { EvalPanel } from './components/eval/EvalPanel';
import { type CanvasPosition, GraphCanvas } from './components/graph/GraphCanvas';
import { UpdateBanner } from './components/UpdateBanner';
import { Button } from './components/ui/button';
import { emit as emitJsonSchema } from './model/emit-json-schema';
import allotment from './samples/allotment.contexture.json' with { type: 'json' };
import { STDLIB_REGISTRY } from './services/stdlib-registry';
import { validate } from './services/validation';
import { useUIStore } from './store/ui';
import { useUndoStore } from './store/undo';

type Tab = 'detail' | 'chat' | 'eval';

export default function App() {
  const schema = useSyncExternalStore(useUndoStore.subscribe, () => useUndoStore.getState().schema);
  const hasSchema = schema.types.length > 0;

  const [tab, setTab] = useState<Tab>('chat');
  const [positions, setPositions] = useState<Record<string, CanvasPosition>>({});
  const selectedNodeId = useUIStore((s) => s.selectedNodeId);

  const loadSample = useCallback(() => {
    useUndoStore
      .getState()
      .apply({ kind: 'replace_schema', schema: allotment as unknown as never });
  }, []);

  const chat = useClaudeSchemaChat({
    api:
      typeof window !== 'undefined' && window.contexture?.chat
        ? window.contexture.chat
        : noopChatApi(),
  });

  const ev = useClaudeEval({
    api: {
      generate: async () => ({ sample: {} }),
      saveFixture: async () => '',
    },
    ir: schema,
    getRootJsonSchema: (rootTypeName) => emitJsonSchema(schema, rootTypeName),
    validate: ({ rootTypeName }) => {
      // Lightweight validation placeholder: the semantic rules apply
      // to IR shape, not to sample data. A proper sample-vs-schema
      // check belongs to the Zod round-trip (see `stdlib/ir-to-zod`);
      // v1 surfaces any schema issues on the root type so users see
      // why their generated sample might not match a broken IR.
      const errors = validate(schema, { stdlib: STDLIB_REGISTRY });
      return errors.length === 0
        ? { ok: true }
        : {
            ok: false,
            errors: errors.map((e) => ({
              path: e.path,
              message: `${rootTypeName}: ${e.message}`,
            })),
          };
    },
  });

  const rootCandidates = useMemo(() => evalRootCandidates(schema), [schema]);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <UpdateBanner />
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <h1 className="text-sm font-semibold">Contexture</h1>
        {!hasSchema && (
          <Button size="sm" type="button" variant="outline" onClick={loadSample}>
            Load allotment sample
          </Button>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1">
          <GraphCanvas positions={positions} onPositionsChange={setPositions} />
        </main>
        <aside className="w-[360px] border-l border-border flex flex-col">
          <nav className="flex border-b border-border text-xs">
            <TabButton id="detail" active={tab} onSelect={setTab}>
              Detail
            </TabButton>
            <TabButton id="chat" active={tab} onSelect={setTab}>
              Chat
            </TabButton>
            <TabButton id="eval" active={tab} onSelect={setTab}>
              Eval
            </TabButton>
          </nav>
          <div className="flex-1 overflow-auto">
            {tab === 'detail' && (
              <DetailPanel selection={{ typeName: selectedNodeId ?? undefined }} />
            )}
            {tab === 'chat' && <ChatPanel chat={chat} />}
            {tab === 'eval' && (
              <EvalPanel eval={ev} rootCandidates={rootCandidates} onCopy={copyToClipboard} />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function TabButton({
  id,
  active,
  onSelect,
  children,
}: {
  id: Tab;
  active: Tab;
  onSelect: (t: Tab) => void;
  children: React.ReactNode;
}) {
  const isActive = id === active;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={() => onSelect(id)}
      className={`flex-1 px-3 py-2 ${isActive ? 'border-b-2 border-primary' : 'text-muted-foreground'}`}
      data-testid={`tab-${id}`}
    >
      {children}
    </button>
  );
}

function copyToClipboard(text: string) {
  if (typeof navigator === 'undefined') return;
  navigator.clipboard?.writeText(text).catch(() => {});
}

function noopChatApi() {
  const unsub = () => undefined;
  return {
    send: async () => ({ ok: false, error: 'chat unavailable (no preload bridge)' }),
    setIR: () => undefined,
    replyOp: () => undefined,
    onAssistant: () => unsub,
    onToolUse: () => unsub,
    onResult: () => unsub,
    onError: () => unsub,
    onTurnBegin: () => unsub,
    onTurnCommit: () => unsub,
    onTurnRollback: () => unsub,
    onOpRequest: () => unsub,
  };
}
