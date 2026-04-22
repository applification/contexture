/**
 * `useClaudeEval` — Eval panel's session hook.
 *
 * Deliberately separate from `useClaudeSchemaChat`: the Eval surface
 * has its own history (not persisted in v1), its own system prompt,
 * and a single tool (`emit_sample`). Schema edits are out of scope —
 * Eval never dispatches ops into the IR store.
 *
 * Lifecycle per generation:
 *   1. Caller picks a `rootTypeName` and `mode` in the panel.
 *   2. Hook builds the system prompt via `buildEvalPrompt` using the
 *      current IR and the root's JSON Schema.
 *   3. Hook calls `api.generate(...)`; returns the sample.
 *   4. Hook validates the sample against the root's Zod schema
 *      (best-effort — the schema is rebuilt from the IR) and exposes
 *      `validation: 'valid' | { errors }`.
 *
 * Tests inject a fake `api` so the full lifecycle runs without IPC or
 * the SDK.
 */

import { useCallback, useState } from 'react';
import type { Schema } from '../model/types';
import { buildEvalPrompt, type EvalMode } from './eval-prompt';

export interface EvalAPI {
  generate: (args: {
    rootTypeName: string;
    rootJsonSchema: object;
    systemPrompt: string;
    mode: EvalMode;
    userPrompt?: string;
    grounding?: string;
  }) => Promise<{ sample: unknown }>;
  /** Save the sample as a fixture file. Returns the written path. */
  saveFixture: (args: { sample: unknown; name: string }) => Promise<string>;
}

export interface EvalValidation {
  ok: boolean;
  errors?: Array<{ path: string; message: string }>;
}

export interface UseClaudeEvalOptions {
  api: EvalAPI;
  ir: Schema;
  /** Build a JSON Schema for the selected root type. */
  getRootJsonSchema: (rootTypeName: string) => object;
  /** Validate a candidate sample against the root's Zod schema. */
  validate: (args: { rootTypeName: string; sample: unknown }) => EvalValidation;
}

export interface EvalState {
  rootTypeName: string | null;
  mode: EvalMode;
  grounding: string;
  userPrompt: string;
  sample: unknown | null;
  validation: EvalValidation | null;
  status: 'idle' | 'running' | 'done' | 'error';
  error: string | null;
}

export function useClaudeEval({ api, ir, getRootJsonSchema, validate }: UseClaudeEvalOptions) {
  const [state, setState] = useState<EvalState>({
    rootTypeName: null,
    mode: 'realistic',
    grounding: '',
    userPrompt: '',
    sample: null,
    validation: null,
    status: 'idle',
    error: null,
  });

  const setRoot = useCallback((name: string | null) => {
    setState((s) => ({ ...s, rootTypeName: name, sample: null, validation: null }));
  }, []);
  const setMode = useCallback((mode: EvalMode) => setState((s) => ({ ...s, mode })), []);
  const setGrounding = useCallback((g: string) => setState((s) => ({ ...s, grounding: g })), []);
  const setUserPrompt = useCallback((p: string) => setState((s) => ({ ...s, userPrompt: p })), []);

  const generate = useCallback(async () => {
    if (!state.rootTypeName || state.status === 'running') return;
    const rootJsonSchema = getRootJsonSchema(state.rootTypeName);
    const systemPrompt = buildEvalPrompt({
      ir,
      rootTypeName: state.rootTypeName,
      rootJsonSchema,
      mode: state.mode,
      grounding: state.grounding || undefined,
    });
    setState((s) => ({ ...s, status: 'running', error: null, sample: null, validation: null }));
    try {
      const { sample } = await api.generate({
        rootTypeName: state.rootTypeName,
        rootJsonSchema,
        systemPrompt,
        mode: state.mode,
        userPrompt: state.userPrompt,
        grounding: state.grounding,
      });
      const validation = validate({ rootTypeName: state.rootTypeName, sample });
      setState((s) => ({ ...s, status: 'done', sample, validation }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState((s) => ({ ...s, status: 'error', error: message }));
    }
  }, [
    api,
    ir,
    getRootJsonSchema,
    state.grounding,
    state.mode,
    state.rootTypeName,
    state.status,
    state.userPrompt,
    validate,
  ]);

  const saveFixture = useCallback(
    async (name: string) => {
      if (state.sample === null) throw new Error('No sample to save');
      return api.saveFixture({ sample: state.sample, name });
    },
    [api, state.sample],
  );

  return {
    state,
    setRoot,
    setMode,
    setGrounding,
    setUserPrompt,
    generate,
    saveFixture,
  };
}
