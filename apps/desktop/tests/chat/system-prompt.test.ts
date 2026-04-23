import {
  buildSystemPromptAppend,
  buildUserMessage,
  type StdlibRegistry,
} from '@renderer/chat/system-prompt';
import type { Schema } from '@renderer/model/types';
import { describe, expect, it } from 'vitest';

const EMPTY_STDLIB: StdlibRegistry = { entries: [] };

describe('buildSystemPromptAppend', () => {
  it('includes the imperative role/mission header', () => {
    const prompt = buildSystemPromptAppend({ stdlibRegistry: EMPTY_STDLIB });
    expect(prompt).toMatch(/Contexture/);
    expect(prompt).toMatch(/schema/i);
    // Tool-use imperative — "calling the op tools", "do not respond
    // with TypeScript/Zod … in prose".
    expect(prompt).toMatch(/calling the op tools/i);
    expect(prompt).toMatch(/do \*\*not\*\* respond with TypeScript/i);
  });

  it('names the bundled skills so Claude knows to reach for them', () => {
    const prompt = buildSystemPromptAppend({ stdlibRegistry: EMPTY_STDLIB });
    expect(prompt).toContain('model-domain');
    expect(prompt).toContain('use-stdlib');
    expect(prompt).toContain('generate-sample');
  });

  it('does NOT embed the current IR section (IR now rides in the user message)', () => {
    const prompt = buildSystemPromptAppend({ stdlibRegistry: EMPTY_STDLIB });
    // The `## Current IR` heading + JSON block is gone — the header
    // itself still *mentions* the <current_ir> tag so Claude knows to
    // expect it in user messages, but there's no IR payload here.
    expect(prompt).not.toContain('## Current IR');
    expect(prompt).not.toContain('```json');
  });

  it('enumerates every op in the vocabulary with its shape', () => {
    const prompt = buildSystemPromptAppend({ stdlibRegistry: EMPTY_STDLIB });
    for (const op of [
      'add_type',
      'update_type',
      'rename_type',
      'delete_type',
      'add_field',
      'update_field',
      'delete_field',
      'reorder_fields',
      'add_variant',
      'set_discriminator',
      'add_import',
      'remove_import',
      'replace_schema',
    ]) {
      expect(prompt).toContain(op);
    }
  });

  it('enumerates stdlib types as "namespace.Name" with their description', () => {
    const stdlib: StdlibRegistry = {
      entries: [
        { namespace: 'common', name: 'Email', description: 'RFC 5322 email address' },
        { namespace: 'money', name: 'Money', description: 'Currency + minor-units amount' },
      ],
    };
    const prompt = buildSystemPromptAppend({ stdlibRegistry: stdlib });
    expect(prompt).toContain('common.Email');
    expect(prompt).toContain('RFC 5322 email address');
    expect(prompt).toContain('money.Money');
    expect(prompt).toContain('Currency + minor-units amount');
  });

  it('is deterministic across stdlib-entry orderings', () => {
    const a: StdlibRegistry = {
      entries: [
        { namespace: 'common', name: 'Email', description: 'Email' },
        { namespace: 'money', name: 'Money', description: 'Money' },
        { namespace: 'common', name: 'URL', description: 'URL' },
      ],
    };
    const b: StdlibRegistry = {
      entries: [
        { namespace: 'money', name: 'Money', description: 'Money' },
        { namespace: 'common', name: 'URL', description: 'URL' },
        { namespace: 'common', name: 'Email', description: 'Email' },
      ],
    };
    expect(buildSystemPromptAppend({ stdlibRegistry: a })).toBe(
      buildSystemPromptAppend({ stdlibRegistry: b }),
    );
  });

  it('is byte-identical when called twice with the same input', () => {
    const stdlib: StdlibRegistry = {
      entries: [{ namespace: 'common', name: 'Email', description: 'Email' }],
    };
    const once = buildSystemPromptAppend({ stdlibRegistry: stdlib });
    const twice = buildSystemPromptAppend({ stdlibRegistry: stdlib });
    expect(once).toBe(twice);
  });

  it('matches a stable snapshot for a representative registry', () => {
    const stdlib: StdlibRegistry = {
      entries: [
        { namespace: 'common', name: 'Email', description: 'RFC 5322 email address' },
        { namespace: 'common', name: 'URL', description: 'WHATWG URL' },
        { namespace: 'money', name: 'Money', description: 'Currency + minor units' },
      ],
    };
    expect(buildSystemPromptAppend({ stdlibRegistry: stdlib })).toMatchSnapshot();
  });
});

describe('buildUserMessage', () => {
  const sampleIR: Schema = {
    version: '1',
    types: [{ kind: 'object', name: 'Plot', fields: [] }],
  };

  it('wraps the IR in <current_ir> tags and appends the user message', () => {
    const out = buildUserMessage({ ir: sampleIR, userMessage: 'add a Harvest type' });
    expect(out).toContain('<current_ir>');
    expect(out).toContain('</current_ir>');
    expect(out).toContain(JSON.stringify(sampleIR, null, 2));
    expect(out).toContain('add a Harvest type');
  });

  it('places the IR block before the user message', () => {
    const out = buildUserMessage({ ir: sampleIR, userMessage: 'add a Harvest type' });
    const irEnd = out.indexOf('</current_ir>');
    const userStart = out.indexOf('add a Harvest type');
    expect(irEnd).toBeGreaterThan(-1);
    expect(userStart).toBeGreaterThan(irEnd);
  });

  it('preserves the user message verbatim (no transformation)', () => {
    const weird = 'line 1\nline 2\n  indented\n<tag>inner</tag>';
    const out = buildUserMessage({ ir: sampleIR, userMessage: weird });
    expect(out.endsWith(weird)).toBe(true);
  });

  it('is deterministic for identical inputs', () => {
    const a = buildUserMessage({ ir: sampleIR, userMessage: 'x' });
    const b = buildUserMessage({ ir: sampleIR, userMessage: 'x' });
    expect(a).toBe(b);
  });
});
