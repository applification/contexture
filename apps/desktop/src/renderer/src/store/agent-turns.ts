import {
  type AgentTurnOpResult,
  type AgentTurnRecord,
  buildAgentTurnSummary,
  hashAgentTurnSchema,
} from '@contexture/core/agent-turn-ledger';
import type { Schema } from '@contexture/core/ir';
import type { Op } from '@contexture/core/ops';
import { create } from 'zustand';

interface BeginAgentTurnInput {
  userMessage?: string;
  provider?: string;
  model?: string;
  providerThreadRef?: unknown;
  before: Schema;
}

interface FinishAgentTurnInput {
  status: AgentTurnRecord['status'];
  after?: Schema;
}

interface AgentTurnsState {
  turns: AgentTurnRecord[];
  activeTurnId: string | null;
  begin: (input: BeginAgentTurnInput) => void;
  finish: (input: FinishAgentTurnInput) => void;
  setAssistantText: (assistantText: string) => void;
  recordToolCallStarted: (input: { id: string; name: string; input?: unknown }) => void;
  recordToolResult: (input: { id: string; name?: string; op?: Op; result: unknown }) => void;
  markRolledBack: (id: string) => void;
  hydrate: (turns: AgentTurnRecord[]) => void;
  reset: () => void;
}

export const useAgentTurnsStore = create<AgentTurnsState>((set, get) => ({
  turns: [],
  activeTurnId: null,

  begin: (input) => {
    const id = makeId();
    const startedAt = new Date().toISOString();
    const turn: AgentTurnRecord = {
      id,
      status: 'running',
      startedAt,
      userMessage: input.userMessage,
      provider: input.provider,
      model: input.model,
      providerThreadRef: input.providerThreadRef,
      beforeHash: hashAgentTurnSchema(input.before),
      before: input.before,
      ops: [],
      summary: buildAgentTurnSummary({ status: 'running', ops: [] }),
    };
    set((state) => ({ activeTurnId: id, turns: [turn, ...state.turns] }));
  },

  finish: (input) => {
    const activeTurnId = get().activeTurnId;
    if (!activeTurnId) return;
    set((state) => ({
      activeTurnId: null,
      turns: state.turns.map((turn) => (turn.id === activeTurnId ? finishTurn(turn, input) : turn)),
    }));
  },

  setAssistantText: (assistantText) => {
    const activeTurnId = get().activeTurnId;
    if (!activeTurnId) return;
    set((state) => ({
      turns: state.turns.map((turn) =>
        turn.id === activeTurnId ? { ...turn, assistantText } : turn,
      ),
    }));
  },

  recordToolCallStarted: (input) => {
    const activeTurnId = get().activeTurnId;
    if (!activeTurnId) return;
    set((state) => ({
      turns: state.turns.map((turn) =>
        turn.id === activeTurnId
          ? {
              ...turn,
              ops: upsertOpResult(turn.ops, {
                id: input.id,
                name: input.name,
                input: input.input,
                status: 'pending',
              }),
            }
          : turn,
      ),
    }));
  },

  recordToolResult: (input) => {
    const activeTurnId = get().activeTurnId;
    if (!activeTurnId) return;
    set((state) => {
      const turns = state.turns.map((turn) => {
        if (turn.id !== activeTurnId) return turn;
        const existing = turn.ops.find((op) => op.id === input.id);
        const status = isApplyError(input.result) ? 'rejected' : input.op ? 'applied' : 'non_op';
        const nextOp: AgentTurnOpResult = {
          id: input.id,
          name: input.name ?? existing?.name ?? opKind(input.op),
          input: existing?.input,
          op: input.op,
          status,
          result: input.result,
          ...(isApplyError(input.result) ? { error: input.result.error } : {}),
        };
        const ops = upsertOpResult(turn.ops, nextOp);
        return {
          ...turn,
          ops,
          summary: buildAgentTurnSummary({ status: turn.status, ops }),
        };
      });
      return { turns };
    });
  },

  markRolledBack: (id) => {
    set((state) => ({
      activeTurnId: state.activeTurnId === id ? null : state.activeTurnId,
      turns: state.turns.map((turn) =>
        turn.id === id
          ? {
              ...turn,
              status: 'rolled_back',
              finishedAt: new Date().toISOString(),
              summary: buildAgentTurnSummary({ status: 'rolled_back', ops: turn.ops }),
            }
          : turn,
      ),
    }));
  },

  hydrate: (turns) => set({ turns, activeTurnId: null }),

  reset: () => set({ turns: [], activeTurnId: null }),
}));

function finishTurn(turn: AgentTurnRecord, input: FinishAgentTurnInput): AgentTurnRecord {
  const ops =
    input.status === 'running' ? turn.ops : turn.ops.filter((op) => op.status !== 'pending');
  return {
    ...turn,
    status: input.status,
    finishedAt: new Date().toISOString(),
    afterHash: hashAgentTurnSchema(input.after),
    after: input.after,
    ops,
    summary: buildAgentTurnSummary({ status: input.status, ops }),
  };
}

function upsertOpResult(ops: AgentTurnOpResult[], next: AgentTurnOpResult): AgentTurnOpResult[] {
  const index = ops.findIndex((op) => op.id === next.id);
  if (index === -1) {
    const pendingIndex =
      next.status === 'applied' || next.status === 'rejected'
        ? ops.findIndex(
            (op) => op.status === 'pending' && op.name === next.name && op.op === undefined,
          )
        : -1;
    if (pendingIndex === -1) return [...ops, next];
    return ops.map((op, i) =>
      i === pendingIndex
        ? {
            ...next,
            id: next.id,
            input: op.input ?? next.input,
          }
        : op,
    );
  }
  return ops.map((op, i) => (i === index ? { ...op, ...next } : op));
}

function isApplyError(value: unknown): value is { error: string } {
  return (
    !!value && typeof value === 'object' && typeof (value as { error?: unknown }).error === 'string'
  );
}

function opKind(op: Op | undefined): string {
  return op?.kind ?? 'tool';
}

function makeId(): string {
  const c = globalThis.crypto;
  return c?.randomUUID ? c.randomUUID() : `turn-${Date.now()}-${Math.random().toString(36)}`;
}

function shouldExposeTestHooks(): boolean {
  if (typeof window === 'undefined') return false;
  if (import.meta.env.DEV || import.meta.env.MODE === 'test') return true;
  return new URLSearchParams(window.location.search).get('e2e') === '1';
}

if (shouldExposeTestHooks()) {
  (
    window as unknown as {
      __contextureAgentTurns?: typeof useAgentTurnsStore;
    }
  ).__contextureAgentTurns = useAgentTurnsStore;
}
