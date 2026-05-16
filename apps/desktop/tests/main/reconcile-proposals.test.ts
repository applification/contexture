import type {
  GenerateTextInput,
  ProviderCapabilities,
  ProviderKind,
  ProviderRuntime,
  ProviderRuntimeEvent,
  ProviderStatus,
} from '@main/providers/runtime';
import { generateReconcileProposal, type ReconcileProposalInput } from '@main/reconcile/proposals';
import type { Schema } from '@renderer/model/ir';
import { describe, expect, it, vi } from 'vitest';

const capabilities: ProviderCapabilities = {
  authModes: ['chatgpt', 'api-key'],
  modelSource: 'runtime',
  supportsThreadResume: true,
  supportsThreadRollback: true,
  supportsDynamicTools: true,
  supportsMcpTools: false,
  supportsInterrupt: true,
  supportsRateLimitStatus: true,
  supportsReasoningEffort: true,
  supportsSchemaOnlyMode: true,
};

const schema: Schema = { version: '1', types: [] };
const payload: ReconcileProposalInput = {
  irJson: JSON.stringify(schema),
  onDiskSource: 'export const Plot = z.object({ name: z.string() });',
  targetKind: 'zod',
};

function runtime(provider: ProviderKind, status: ProviderStatus): ProviderRuntime {
  return {
    provider,
    capabilities,
    getStatus: vi.fn(async () => status),
    listModels: vi.fn(async () => []),
    startThread: vi.fn(),
    resumeThread: vi.fn(),
    sendTurn: vi.fn(async function* (): AsyncIterable<ProviderRuntimeEvent> {}),
    generateText: vi.fn(async () =>
      JSON.stringify([
        {
          op: {
            kind: 'add_type',
            type: { kind: 'object', name: 'Plot', fields: [] },
          },
          label: 'Add Plot',
          lossy: false,
        },
      ]),
    ),
    interruptTurn: vi.fn(),
    rollbackThread: vi.fn(),
    startLogin: vi.fn(),
    cancelLogin: vi.fn(),
    logout: vi.fn(),
  };
}

describe('generateReconcileProposal', () => {
  it('routes Codex proposals through the active provider model settings', async () => {
    const codex = runtime('codex', { provider: 'codex', readiness: 'authenticated_chatgpt' });

    await expect(
      generateReconcileProposal({
        runtime: codex,
        schema,
        modelOptions: { model: 'gpt-5.4', effort: 'high', options: { fastMode: true } },
        payload,
      }),
    ).resolves.toMatchObject({ ok: true, ops: [expect.objectContaining({ label: 'Add Plot' })] });

    expect(codex.generateText).toHaveBeenCalledWith(
      expect.objectContaining<Partial<GenerateTextInput>>({
        schema,
        model: 'gpt-5.4',
        effort: 'high',
        options: { fastMode: true },
        message: expect.stringContaining('<on_disk_source kind="zod">'),
      }),
    );
  });

  it('routes Claude proposals through the same provider-neutral path', async () => {
    const claude = runtime('claude', { provider: 'claude', readiness: 'authenticated_cli' });

    await generateReconcileProposal({
      runtime: claude,
      schema,
      modelOptions: { model: 'claude-sonnet-4-6', effort: 'medium' },
      payload,
    });

    expect(claude.generateText).toHaveBeenCalledWith(
      expect.objectContaining<Partial<GenerateTextInput>>({
        model: 'claude-sonnet-4-6',
        effort: 'medium',
      }),
    );
  });

  it('fails explicitly without invoking the provider when the active provider is unavailable', async () => {
    const codex = runtime('codex', {
      provider: 'codex',
      readiness: 'not_signed_in',
      detail: 'Sign in required',
    });

    await expect(generateReconcileProposal({ runtime: codex, schema, payload })).resolves.toEqual({
      ok: false,
      error: 'Codex is unavailable for reconcile proposals: Sign in required.',
    });
    expect(codex.generateText).not.toHaveBeenCalled();
  });
});
