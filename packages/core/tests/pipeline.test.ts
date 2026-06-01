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
      '/repo/packages/contexture/convex/schema.ts',
      '/repo/packages/contexture/convex/validators.ts',
      '/repo/packages/contexture/app.schema.ts',
      '/repo/packages/contexture/app.schema.json',
      '/repo/packages/contexture/index.ts',
    ]);
  });

  it('emits schemas and Convex under app-root folders for a root app IR', () => {
    const { emitted } = runEmitPipeline(baseSchema, '/repo/apps/misprint/misprint.contexture.json');

    expect(emitted.map((file) => file.path)).toEqual([
      '/repo/apps/misprint/convex/schema.ts',
      '/repo/apps/misprint/convex/validators.ts',
      '/repo/apps/misprint/schema/misprint.schema.ts',
      '/repo/apps/misprint/schema/misprint.schema.json',
      '/repo/apps/misprint/schema/index.ts',
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
    expect(Object.keys(manifest.files)).toEqual(['app.schema.ts', 'index.ts']);
  });

  it('uses stable source labels and manifest keys across checkout roots', () => {
    const first = runEmitPipeline(baseSchema, '/Users/rufus/Apps/plantry/plantry.contexture.json');
    const second = runEmitPipeline(
      baseSchema,
      '/Users/davehudson/Apps/plantry/plantry.contexture.json',
    );

    const firstByRelativePath = new Map(
      first.emitted.map((file) => [file.path.replace('/Users/rufus/Apps/plantry/', ''), file]),
    );
    for (const secondFile of second.emitted) {
      const key = secondFile.path.replace('/Users/davehudson/Apps/plantry/', '');
      expect(secondFile.content).toBe(firstByRelativePath.get(key)?.content);
    }

    expect(first.manifest.files).toEqual(second.manifest.files);
    expect(first.emitted[0]?.content).toContain('Source: plantry.contexture.json');
    expect(first.emitted[0]?.content).not.toContain('/Users/rufus');
  });

  it('omits AI-pipeline outputs until they are explicitly enabled', () => {
    const schema: Schema = {
      ...baseSchema,
      outputs: {
        aiPipeline: {
          structuredOutputs: { enabled: false },
        },
      },
    };

    const { schema: parsed } = load(save(schema));
    expect(parsed.outputs).toEqual(schema.outputs);

    const { emitted } = runEmitPipeline(parsed, '/repo/packages/contexture/app.contexture.json');
    expect(emitted.map((file) => file.path)).toEqual([
      '/repo/packages/contexture/convex/schema.ts',
      '/repo/packages/contexture/convex/validators.ts',
      '/repo/packages/contexture/app.schema.ts',
      '/repo/packages/contexture/app.schema.json',
      '/repo/packages/contexture/index.ts',
    ]);
  });

  it('emits opt-in AI tool schemas and tracks them in the manifest', () => {
    const schema: Schema = {
      ...baseSchema,
      outputs: {
        aiPipeline: {
          toolSchemas: { enabled: true },
        },
      },
    };

    const { emitted, manifest } = runEmitPipeline(
      schema,
      '/repo/packages/contexture/app.contexture.json',
    );

    expect(emitted.map((file) => file.path)).toContain(
      '/repo/packages/contexture/.contexture/ai-tool-schemas.json',
    );
    const toolSchemas = emitted.find((file) => file.path.endsWith('ai-tool-schemas.json'));
    expect(toolSchemas?.content).toContain('submit_post');
    expect(manifest.files).toHaveProperty('.contexture/ai-tool-schemas.json');
  });

  it('emits opt-in structured-output schemas, MCP definitions, and form validators', () => {
    const schema: Schema = {
      ...baseSchema,
      outputs: {
        aiPipeline: {
          structuredOutputs: { enabled: true },
          mcpDefinitions: { enabled: true },
          formValidators: { enabled: true },
        },
      },
    };

    const { emitted, manifest } = runEmitPipeline(
      schema,
      '/repo/packages/contexture/app.contexture.json',
    );

    expect(emitted.map((file) => file.path)).toContain(
      '/repo/packages/contexture/.contexture/structured-output-schemas.json',
    );
    expect(emitted.map((file) => file.path)).toContain(
      '/repo/packages/contexture/.contexture/mcp-definitions.json',
    );
    expect(emitted.map((file) => file.path)).toContain(
      '/repo/packages/contexture/form-validators.ts',
    );
    expect(manifest.files).toHaveProperty('.contexture/structured-output-schemas.json');
    expect(manifest.files).toHaveProperty('.contexture/mcp-definitions.json');
    expect(manifest.files).toHaveProperty('form-validators.ts');
  });
});
