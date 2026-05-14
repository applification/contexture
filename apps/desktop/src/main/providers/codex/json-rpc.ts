import { createInterface, type Interface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';

type JsonRpcId = number | string;

export interface JsonRpcRequestMessage {
  jsonrpc: '2.0';
  id: JsonRpcId;
  method: string;
  params?: unknown;
}

export interface JsonRpcNotificationMessage {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

export interface JsonRpcResponseMessage {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export type JsonRpcIncomingMessage =
  | JsonRpcRequestMessage
  | JsonRpcNotificationMessage
  | JsonRpcResponseMessage;

export interface CodexJsonRpcClientOptions {
  input: Readable;
  output: Writable;
  onNotification?: (message: JsonRpcNotificationMessage) => void;
  onServerRequest?: (message: JsonRpcRequestMessage, client: CodexJsonRpcClient) => void;
}

export class CodexJsonRpcClient {
  readonly #output: Writable;
  readonly #notificationListeners = new Set<(message: JsonRpcNotificationMessage) => void>();
  readonly #serverRequestListeners = new Set<
    (message: JsonRpcRequestMessage, client: CodexJsonRpcClient) => boolean | undefined
  >();
  readonly #reader: Interface;
  readonly #pending = new Map<
    JsonRpcId,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  #nextId = 1;

  constructor({ input, output, onNotification, onServerRequest }: CodexJsonRpcClientOptions) {
    this.#output = output;
    if (onNotification) this.#notificationListeners.add(onNotification);
    if (onServerRequest) {
      this.#serverRequestListeners.add((message, client) => {
        onServerRequest(message, client);
        return true;
      });
    }
    this.#reader = createInterface({ input });
    this.#reader.on('line', (line) => this.#handleLine(line));
    this.#reader.on('close', () =>
      this.#rejectAll(new Error('Codex app-server connection closed')),
    );
  }

  onNotification(listener: (message: JsonRpcNotificationMessage) => void): () => void {
    this.#notificationListeners.add(listener);
    return () => this.#notificationListeners.delete(listener);
  }

  onServerRequest(
    listener: (message: JsonRpcRequestMessage, client: CodexJsonRpcClient) => boolean | undefined,
  ): () => void {
    this.#serverRequestListeners.add(listener);
    return () => this.#serverRequestListeners.delete(listener);
  }

  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    const id = this.#nextId;
    this.#nextId += 1;
    const message: JsonRpcRequestMessage = { jsonrpc: '2.0', id, method, params };
    return new Promise<T>((resolve, reject) => {
      this.#pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
      });
      this.#write(message);
    });
  }

  notify(method: string, params?: unknown): void {
    this.#write({ jsonrpc: '2.0', method, params });
  }

  respond(id: JsonRpcId, result: unknown): void {
    this.#write({ jsonrpc: '2.0', id, result });
  }

  respondError(id: JsonRpcId, code: number, message: string, data?: unknown): void {
    this.#write({ jsonrpc: '2.0', id, error: { code, message, data } });
  }

  dispose(): void {
    this.#reader.close();
    this.#rejectAll(new Error('Codex app-server connection disposed'));
  }

  #handleLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;
    let parsed: JsonRpcIncomingMessage;
    try {
      parsed = JSON.parse(trimmed) as JsonRpcIncomingMessage;
    } catch {
      return;
    }

    if ('id' in parsed && !('method' in parsed)) {
      this.#handleResponse(parsed);
      return;
    }

    if ('id' in parsed && 'method' in parsed) {
      let handled = false;
      for (const listener of this.#serverRequestListeners) {
        if (listener(parsed, this) === true) {
          handled = true;
          break;
        }
      }
      if (!handled)
        this.respondError(parsed.id, -32601, `Unhandled server request: ${parsed.method}`);
      return;
    }

    if ('method' in parsed) {
      for (const listener of this.#notificationListeners) listener(parsed);
    }
  }

  #handleResponse(message: JsonRpcResponseMessage): void {
    const pending = this.#pending.get(message.id);
    if (!pending) return;
    this.#pending.delete(message.id);
    if (message.error) {
      pending.reject(new Error(message.error.message));
      return;
    }
    pending.resolve(message.result);
  }

  #write(
    message: JsonRpcRequestMessage | JsonRpcNotificationMessage | JsonRpcResponseMessage,
  ): void {
    this.#output.write(`${JSON.stringify(message)}\n`);
  }

  #rejectAll(error: Error): void {
    for (const pending of this.#pending.values()) {
      pending.reject(error);
    }
    this.#pending.clear();
  }
}
