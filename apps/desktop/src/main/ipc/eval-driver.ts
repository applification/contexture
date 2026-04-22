/**
 * Eval driver — single-shot sample generation.
 *
 * Unlike the chat driver, Eval doesn't wrap the stream in a turn
 * envelope (there's no schema mutation) and exposes only one tool:
 * `emit_sample(sample: <root jsonSchema>)`. Claude calls the tool with
 * the generated document, the driver captures its argument, and the
 * renderer validates it against the root's Zod schema.
 *
 * `query` and the tool server are dependency-injected so tests can
 * feed a canned stream without booting the SDK.
 */

import type { EvalMode } from '@renderer/chat/eval-prompt';

export interface EvalSdkMessage {
  type: 'assistant' | 'tool_input' | 'result' | 'error';
  /** `tool_input.sample` is the generated JSON. */
  sample?: unknown;
  /** `error.message`. */
  message?: string;
  /** `assistant.text` — plain text from the model (logged, not displayed). */
  text?: string;
}

export type EvalQueryFn = (input: {
  prompt: string;
  systemPrompt: string;
  rootJsonSchema: object;
}) => AsyncIterable<EvalSdkMessage>;

export interface EvalTransport {
  send: (channel: string, payload: unknown) => void;
}

export interface EvalGenerateArgs {
  rootTypeName: string;
  rootJsonSchema: object;
  mode: EvalMode;
  grounding?: string;
  /** Optional user prompt; concatenated after the generated system prompt. */
  userPrompt?: string;
  /** System prompt already built by the renderer via `buildEvalPrompt`. */
  systemPrompt: string;
}

export interface EvalGenerateResult {
  sample: unknown;
  /** Raw model text (usually empty for tool-only responses). */
  text?: string;
}

export const EVAL_SAMPLE = 'eval:sample' as const;
export const EVAL_ASSISTANT = 'eval:assistant' as const;
export const EVAL_RESULT = 'eval:result' as const;
export const EVAL_ERROR = 'eval:error' as const;

export class EvalDriver {
  readonly #query: EvalQueryFn;
  readonly #transport: EvalTransport;

  constructor(deps: { query: EvalQueryFn; transport: EvalTransport }) {
    this.#query = deps.query;
    this.#transport = deps.transport;
  }

  async generate(args: EvalGenerateArgs): Promise<EvalGenerateResult> {
    const { systemPrompt, rootJsonSchema, userPrompt } = args;
    const prompt =
      userPrompt && userPrompt.trim().length > 0
        ? userPrompt.trim()
        : `Generate a sample for root type ${args.rootTypeName} in ${args.mode} mode.`;

    let sample: unknown;
    let text = '';
    try {
      for await (const msg of this.#query({ prompt, systemPrompt, rootJsonSchema })) {
        if (msg.type === 'assistant' && typeof msg.text === 'string') {
          text += msg.text;
          this.#transport.send(EVAL_ASSISTANT, { text: msg.text });
        } else if (msg.type === 'tool_input') {
          sample = msg.sample;
          this.#transport.send(EVAL_SAMPLE, { sample });
        } else if (msg.type === 'result') {
          this.#transport.send(EVAL_RESULT, { ok: true });
        } else if (msg.type === 'error') {
          const message = msg.message ?? 'Unknown eval error';
          this.#transport.send(EVAL_ERROR, { message });
          throw new Error(message);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.#transport.send(EVAL_ERROR, { message });
      throw err;
    }

    if (sample === undefined) {
      throw new Error('Eval completed without an emit_sample call.');
    }
    return { sample, text };
  }
}
