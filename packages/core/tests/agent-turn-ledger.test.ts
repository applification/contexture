import { describe, expect, test } from 'vitest';
import {
  buildAgentTurnSummary,
  describeAgentTurnOp,
  diffAgentTurnSchema,
  hashAgentTurnSchema,
  summarizeAgentTurnSchemaDiff,
} from '../src/agent-turn-ledger';

describe('buildAgentTurnSummary', () => {
  test('describes a running turn with no ops as in progress', () => {
    expect(buildAgentTurnSummary({ status: 'running', ops: [] })).toBe(
      'Agent is working on your request',
    );
  });

  test('describes pending ops without implying completion', () => {
    expect(
      buildAgentTurnSummary({
        status: 'running',
        ops: [{ status: 'pending' }],
      }),
    ).toBe('Agent is working on 1 model change: 0 applied, 0 rejected, 1 pending');
  });

  test('keeps completed no-op turns distinct from running turns', () => {
    expect(buildAgentTurnSummary({ status: 'committed', ops: [] })).toBe(
      'Agent turn completed with no model changes',
    );
  });

  test('describes undone turns as rolled back', () => {
    expect(
      buildAgentTurnSummary({
        status: 'rolled_back',
        ops: [{ status: 'applied' }],
      }),
    ).toBe('Agent turn undone: 1 model change rolled back');
  });

  test('describes common ops in user-facing language', () => {
    expect(
      describeAgentTurnOp({
        name: 'add_field',
        op: {
          kind: 'add_field',
          typeName: 'Release',
          field: { name: 'discogsReleaseId', type: { kind: 'string' } },
        },
      }),
    ).toBe('Added field Release.discogsReleaseId');
  });

  test('describes completed generated/drift tool turns', () => {
    expect(
      buildAgentTurnSummary({
        status: 'committed',
        ops: [
          { name: 'emit_contexture', status: 'non_op', result: { emitted: ['convex/schema.ts'] } },
          { name: 'check_contexture_drift', status: 'non_op', result: { clean: true } },
        ],
      }),
    ).toBe('Agent emitted generated files and checked drift: clean');
  });
});

describe('diffAgentTurnSchema', () => {
  test('summarizes type, field, and index changes from turn snapshots', () => {
    const rows = summarizeAgentTurnSchemaDiff(
      diffAgentTurnSchema(
        {
          version: '1',
          types: [
            {
              kind: 'object',
              name: 'Release',
              fields: [{ name: 'title', type: { kind: 'string' } }],
              table: true,
            },
          ],
        },
        {
          version: '1',
          types: [
            {
              kind: 'object',
              name: 'Release',
              fields: [
                { name: 'title', type: { kind: 'string' } },
                { name: 'discogsReleaseId', type: { kind: 'string' } },
              ],
              table: true,
              indexes: [{ name: 'byDiscogsId', fields: ['discogsReleaseId'] }],
            },
            { kind: 'enum', name: 'Format', values: [{ value: 'LP' }] },
          ],
        },
      ),
    );

    expect(rows).toEqual([
      'Added type Format',
      'Added field Release.discogsReleaseId',
      'Added index Release.byDiscogsId',
    ]);
  });
});

describe('hashAgentTurnSchema', () => {
  test('returns a stable browser-safe snapshot hash', () => {
    expect(hashAgentTurnSchema({ version: '1', types: [] })).toBe(
      hashAgentTurnSchema({ version: '1', types: [] }),
    );
    expect(hashAgentTurnSchema(undefined)).toBeUndefined();
  });
});
