/**
 * `EventSinkPort` adapter that forwards `TurnEvent` to `webContents.send`
 * on the channel names the renderer already listens to.
 *
 * Keeping the fan-out here — instead of inside `ChatSession` — means the
 * session deals in one discriminated union rather than seven channel
 * strings, and a test run never touches a channel name.
 */
import type { EventSinkPort, TurnEvent } from './chat-session';

export interface SinkTransport {
  send(channel: string, payload?: unknown): void;
}

export function createIpcSink(transport: SinkTransport): EventSinkPort {
  return {
    emit(event: TurnEvent) {
      switch (event.kind) {
        case 'turn-begin':
          transport.send('turn:begin');
          return;
        case 'turn-commit':
          transport.send('turn:commit');
          return;
        case 'turn-rollback':
          transport.send('turn:rollback');
          return;
        case 'assistant':
          transport.send('chat:assistant', { text: event.textDelta });
          return;
        case 'tool-use':
          transport.send('chat:tool-use', { name: event.name, input: event.input });
          return;
        case 'result':
          transport.send('chat:result', { ok: event.ok, error: event.error });
          return;
        case 'session':
          transport.send('chat:session', { sessionId: event.sessionId });
          return;
        case 'error':
          transport.send('chat:error', { message: event.message });
          return;
        case 'auth-required':
          transport.send('chat:auth-required', { message: event.message });
          return;
      }
    },
  };
}
