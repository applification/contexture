import type { Schema } from '@contexture/core/ir';
import type {
  GenerateTextInput,
  ProviderCapabilities,
  ProviderKind,
  ProviderRuntime,
  ProviderRuntimeEvent,
  ProviderStatus,
} from '@main/providers/runtime';
import { generateReconcileProposal, type ReconcileProposalInput } from '@main/reconcile/proposals';
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
  it('uses deterministic Convex schema proposals before invoking the provider', async () => {
    const current: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Post',
          table: true,
          fields: [{ name: 'title', type: { kind: 'string' } }],
        },
      ],
    };
    const codex = runtime('codex', { provider: 'codex', readiness: 'not_signed_in' });

    await expect(
      generateReconcileProposal({
        runtime: codex,
        schema: current,
        payload: {
          irJson: JSON.stringify(current),
          targetKind: 'convex',
          onDiskSource: [
            `import { defineSchema, defineTable } from 'convex/server';`,
            `import { v } from 'convex/values';`,
            '',
            'export default defineSchema({',
            '  post: defineTable({',
            '    title: v.string(),',
            '    published: v.boolean(),',
            '  }).index("by_published", ["published"]),',
            '});',
          ].join('\n'),
        },
      }),
    ).resolves.toEqual({
      ok: true,
      ops: [
        {
          op: {
            kind: 'add_field',
            typeName: 'Post',
            field: { name: 'published', type: { kind: 'boolean' } },
          },
          label: 'Add field "published" to "Post"',
          lossy: false,
          provenance: 'deterministic',
        },
        {
          op: {
            kind: 'add_index',
            typeName: 'Post',
            index: { name: 'by_published', fields: ['published'] },
          },
          label: 'Add index "by_published" to "Post"',
          lossy: false,
          provenance: 'deterministic',
        },
      ],
    });
    expect(codex.generateText).not.toHaveBeenCalled();
  });

  it('maps supported Convex validators back to existing IR field semantics', async () => {
    const current: Schema = {
      version: '1',
      types: [
        { kind: 'object', name: 'User', table: true, tableName: 'users', fields: [] },
        {
          kind: 'object',
          name: 'Post',
          table: true,
          fields: [{ name: 'title', type: { kind: 'string' } }],
        },
      ],
    };
    const codex = runtime('codex', { provider: 'codex', readiness: 'not_signed_in' });

    await expect(
      generateReconcileProposal({
        runtime: codex,
        schema: current,
        payload: {
          irJson: JSON.stringify(current),
          targetKind: 'convex',
          onDiskSource: [
            `import { defineSchema, defineTable } from 'convex/server';`,
            `import { v } from 'convex/values';`,
            '',
            'export default defineSchema({',
            '  post: defineTable({',
            '    title: v.string(),',
            '    author: v.id("users"),',
            '    tags: v.optional(v.array(v.string())),',
            '    summary: v.union(v.string(), v.null()),',
            '  }),',
            '});',
          ].join('\n'),
        },
      }),
    ).resolves.toMatchObject({
      ok: true,
      ops: [
        {
          op: {
            kind: 'add_field',
            typeName: 'Post',
            field: { name: 'author', type: { kind: 'ref', typeName: 'User' } },
          },
        },
        {
          op: {
            kind: 'add_field',
            typeName: 'Post',
            field: {
              name: 'tags',
              type: { kind: 'array', element: { kind: 'string' } },
              optional: true,
            },
          },
        },
        {
          op: {
            kind: 'add_field',
            typeName: 'Post',
            field: { name: 'summary', type: { kind: 'string' }, nullable: true },
          },
        },
      ],
    });
    expect(codex.generateText).not.toHaveBeenCalled();
  });

  it('proposes reviewable lossy ops for removed Convex fields and indexes', async () => {
    const current: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Post',
          table: true,
          fields: [
            { name: 'title', type: { kind: 'string' } },
            { name: 'archived', type: { kind: 'boolean' } },
          ],
          indexes: [{ name: 'by_archived', fields: ['archived'] }],
        },
      ],
    };
    const codex = runtime('codex', { provider: 'codex', readiness: 'not_signed_in' });

    await expect(
      generateReconcileProposal({
        runtime: codex,
        schema: current,
        payload: {
          irJson: JSON.stringify(current),
          targetKind: 'convex',
          onDiskSource: [
            `import { defineSchema, defineTable } from 'convex/server';`,
            `import { v } from 'convex/values';`,
            '',
            'export default defineSchema({',
            '  post: defineTable({',
            '    title: v.string(),',
            '  }),',
            '});',
          ].join('\n'),
        },
      }),
    ).resolves.toEqual({
      ok: true,
      ops: [
        {
          op: { kind: 'remove_field', typeName: 'Post', fieldName: 'archived' },
          label: 'Remove field "archived" from "Post"',
          lossy: true,
          provenance: 'deterministic',
        },
        {
          op: { kind: 'remove_index', typeName: 'Post', name: 'by_archived' },
          label: 'Remove index "by_archived" from "Post"',
          lossy: false,
          provenance: 'deterministic',
        },
      ],
    });
    expect(codex.generateText).not.toHaveBeenCalled();
  });

  it('falls back to the provider with a deterministic reason when Convex edits leave the supported subset', async () => {
    const codex = runtime('codex', { provider: 'codex', readiness: 'authenticated_chatgpt' });

    await expect(
      generateReconcileProposal({
        runtime: codex,
        schema,
        payload: {
          irJson: JSON.stringify(schema),
          targetKind: 'convex',
          onDiskSource: 'export default makeSchemaSomeOtherWay();',
        },
      }),
    ).resolves.toMatchObject({
      ok: true,
      deterministicFallbackReason: 'Could not find `export default defineSchema({ ... })`.',
      ops: [
        {
          label: 'Add Plot',
          provenance: 'provider',
        },
      ],
    });

    expect(codex.generateText).toHaveBeenCalledOnce();
  });

  it('does not attach deterministic fallback reasons for non-Convex provider proposals', async () => {
    const codex = runtime('codex', { provider: 'codex', readiness: 'authenticated_chatgpt' });

    await expect(
      generateReconcileProposal({
        runtime: codex,
        schema,
        payload,
      }),
    ).resolves.toEqual({
      ok: true,
      ops: [
        {
          op: {
            kind: 'add_type',
            type: { kind: 'object', name: 'Plot', fields: [] },
          },
          label: 'Add Plot',
          lossy: false,
          provenance: 'provider',
        },
      ],
    });

    expect(codex.generateText).toHaveBeenCalledOnce();
  });

  it('provider provenance overrides model-supplied provenance', async () => {
    const codex = runtime('codex', { provider: 'codex', readiness: 'authenticated_chatgpt' });
    vi.mocked(codex.generateText).mockResolvedValueOnce(
      JSON.stringify([
        {
          op: {
            kind: 'add_type',
            type: { kind: 'object', name: 'Plot', fields: [] },
          },
          label: 'Add Plot',
          lossy: false,
          provenance: 'deterministic',
        },
      ]),
    );

    await expect(
      generateReconcileProposal({
        runtime: codex,
        schema,
        payload,
      }),
    ).resolves.toMatchObject({
      ok: true,
      ops: [
        {
          label: 'Add Plot',
          provenance: 'provider',
        },
      ],
    });

    expect(codex.generateText).toHaveBeenCalledOnce();
  });

  it('routes Codex proposals through the active provider model settings', async () => {
    const codex = runtime('codex', { provider: 'codex', readiness: 'authenticated_chatgpt' });

    await expect(
      generateReconcileProposal({
        runtime: codex,
        schema,
        modelOptions: { model: 'gpt-5.4', effort: 'high', options: { fastMode: true } },
        payload,
      }),
    ).resolves.toMatchObject({
      ok: true,
      ops: [expect.objectContaining({ label: 'Add Plot', provenance: 'provider' })],
    });

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
