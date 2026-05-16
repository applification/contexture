import { describe, expect, it } from 'vitest';
import { load, runEmitPipeline, type Schema, save } from '../src';

const baseSchema: Schema = {
  version: '1',
  types: [{ kind: 'object', name: 'Post', fields: [] }],
};

describe('runEmitPipeline output config', () => {
  it('keeps existing generated outputs enabled when outputs config is omitted', () => {
    const { emitted } = runEmitPipeline(
      baseSchema,
      '/repo/packages/contexture/app.contexture.json',
    );

    expect(emitted.map((file) => file.path)).toEqual([
      '/repo/packages/contexture/app.schema.ts',
      '/repo/packages/contexture/app.schema.json',
      '/repo/packages/contexture/index.ts',
      '/repo/packages/contexture/convex/schema.ts',
    ]);
  });

  it('can disable existing generated targets explicitly', () => {
    const schema: Schema = {
      ...baseSchema,
      outputs: {
        jsonSchema: { enabled: false },
        convex: { enabled: false },
      },
    };

    const { emitted, manifest } = runEmitPipeline(
      schema,
      '/repo/packages/contexture/app.contexture.json',
    );

    expect(emitted.map((file) => file.path)).toEqual([
      '/repo/packages/contexture/app.schema.ts',
      '/repo/packages/contexture/index.ts',
    ]);
    expect(Object.keys(manifest.files)).toEqual([
      '/repo/packages/contexture/app.schema.ts',
      '/repo/packages/contexture/index.ts',
    ]);
  });

  it('round-trips opt-in future AI-pipeline output slots without emitting them yet', () => {
    const schema: Schema = {
      ...baseSchema,
      outputs: {
        aiPipeline: {
          toolSchemas: { enabled: true },
          structuredOutputs: { enabled: false },
        },
      },
    };

    const { schema: parsed } = load(save(schema));
    expect(parsed.outputs).toEqual(schema.outputs);

    const { emitted } = runEmitPipeline(parsed, '/repo/packages/contexture/app.contexture.json');
    expect(emitted.map((file) => file.path)).toEqual([
      '/repo/packages/contexture/app.schema.ts',
      '/repo/packages/contexture/app.schema.json',
      '/repo/packages/contexture/index.ts',
      '/repo/packages/contexture/convex/schema.ts',
    ]);
  });
});
