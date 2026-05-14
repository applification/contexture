import { buildUserMessage } from '@renderer/chat/system-prompt';
import type { Schema } from '@renderer/model/ir';
import type { ChatTurnController } from '../ipc/chat-turn';
import type {
  ModelOptions,
  ProviderRuntime,
  ProviderRuntimeEvent,
  ProviderThreadRef,
} from './runtime';

export const SCHEMA_AGENT_ASSISTANT_DELTA = 'schema-agent:assistant-delta' as const;
export const SCHEMA_AGENT_ASSISTANT_FINAL = 'schema-agent:assistant-final' as const;
export const SCHEMA_AGENT_TOOL_CALL_STARTED = 'schema-agent:tool-call-started' as const;
export const SCHEMA_AGENT_TOOL_CALL_FINISHED = 'schema-agent:tool-call-finished' as const;
export const SCHEMA_AGENT_ERROR = 'schema-agent:error' as const;
export const SCHEMA_AGENT_STATUS_CHANGED = 'schema-agent:status-changed' as const;
export const SCHEMA_AGENT_THREAD_UPDATED = 'schema-agent:thread-updated' as const;
export const SCHEMA_AGENT_THREAD_DESYNCED = 'schema-agent:thread-desynced' as const;

export interface SchemaAgentTransport {
  send: (channel: string, payload: unknown) => void;
}

export interface SchemaAgentDriverDeps {
  runtime?: ProviderRuntime;
  getRuntime?: () => ProviderRuntime;
  transport: SchemaAgentTransport;
  turnController: ChatTurnController;
  getCurrentIR: () => Schema | null;
  getThreadRef: () => ProviderThreadRef | undefined;
  setThreadRef: (thread: ProviderThreadRef) => void;
  markThreadDesynced: (thread: ProviderThreadRef, reason: string) => void;
  getModelOptions?: () => { model?: string; effort?: string; options?: ModelOptions };
}

export class SchemaAgentDriver {
  readonly #deps: SchemaAgentDriverDeps;

  constructor(deps: SchemaAgentDriverDeps) {
    this.#deps = deps;
  }

  async send(userMessage: string): Promise<void> {
    const {
      runtime: staticRuntime,
      getRuntime,
      transport,
      turnController,
      getCurrentIR,
      getThreadRef,
      setThreadRef,
      markThreadDesynced,
      getModelOptions,
    } = this.#deps;
    const runtime = getRuntime?.() ?? staticRuntime;
    if (!runtime) throw new Error('No schema-agent provider runtime configured');
    const schema = getCurrentIR() ?? { version: '1', types: [] };
    const modelOptions = getModelOptions?.() ?? {};
    let thread = getThreadRef();
    if (!thread) {
      thread = await runtime.startThread({ schema, ...modelOptions });
      setThreadRef(thread);
      transport.send(SCHEMA_AGENT_THREAD_UPDATED, { thread });
    }

    try {
      await turnController.run(async () => {
        for await (const event of runtime.sendTurn({
          thread,
          schema,
          message: buildUserMessage({ ir: schema, userMessage }),
          ...modelOptions,
        })) {
          handleRuntimeEvent(event, transport, setThreadRef);
          if (event.type === 'turn_failed') {
            throw new Error(event.message);
          }
          if (event.type === 'turn_interrupted') {
            throw new Error(event.message ?? 'turn interrupted');
          }
        }
      });
    } catch (err) {
      await rollbackProviderThread({
        err,
        thread,
        runtime,
        transport,
        markThreadDesynced,
      });
      throw err;
    }
  }
}

function handleRuntimeEvent(
  event: ProviderRuntimeEvent,
  transport: SchemaAgentTransport,
  setThreadRef: (thread: ProviderThreadRef) => void,
): void {
  switch (event.type) {
    case 'status_changed':
    case 'auth_changed':
      transport.send(SCHEMA_AGENT_STATUS_CHANGED, event.status);
      return;
    case 'thread_started':
    case 'thread_resumed':
      setThreadRef(event.thread);
      transport.send(SCHEMA_AGENT_THREAD_UPDATED, { thread: event.thread });
      return;
    case 'assistant_delta':
      transport.send(SCHEMA_AGENT_ASSISTANT_DELTA, { text: event.text });
      return;
    case 'assistant_final':
      transport.send(SCHEMA_AGENT_ASSISTANT_FINAL, { text: event.text });
      return;
    case 'tool_call_started':
      transport.send(SCHEMA_AGENT_TOOL_CALL_STARTED, {
        id: event.id,
        name: event.name,
        input: event.input,
      });
      return;
    case 'tool_call_finished':
      transport.send(SCHEMA_AGENT_TOOL_CALL_FINISHED, {
        id: event.id,
        name: event.name,
        ok: event.ok,
        result: event.result,
      });
      return;
    case 'turn_failed':
      return;
    case 'turn_interrupted':
      return;
    case 'thread_desynced':
      transport.send(SCHEMA_AGENT_THREAD_DESYNCED, {
        thread: event.thread,
        reason: event.reason,
      });
      return;
    case 'turn_started':
    case 'turn_completed':
      return;
  }
}

async function rollbackProviderThread({
  err,
  thread,
  runtime,
  transport,
  markThreadDesynced,
}: {
  err: unknown;
  thread: ProviderThreadRef;
  runtime: ProviderRuntime;
  transport: SchemaAgentTransport;
  markThreadDesynced: (thread: ProviderThreadRef, reason: string) => void;
}): Promise<void> {
  if (!runtime.capabilities.supportsThreadRollback) {
    const reason = 'provider does not support thread rollback';
    markThreadDesynced(thread, reason);
    transport.send(SCHEMA_AGENT_THREAD_DESYNCED, { thread, reason });
    return;
  }

  try {
    await runtime.rollbackThread({ thread, turns: 1 });
  } catch (rollbackErr) {
    const reason = rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr);
    markThreadDesynced(thread, reason);
    transport.send(SCHEMA_AGENT_THREAD_DESYNCED, { thread, reason });
  }

  if (err instanceof Error) {
    transport.send(SCHEMA_AGENT_ERROR, { message: err.message });
  }
}
