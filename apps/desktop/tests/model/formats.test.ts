import { getAdapterForExtension, getAdapterForFilePath } from '@renderer/model/formats';
import { describe, expect, it } from 'vitest';

describe('format registry', () => {
  it('resolves .ttl to turtle adapter', () => {
    const adapter = getAdapterForExtension('.ttl');
    expect(adapter).toBeDefined();
    expect(adapter?.mimeType).toBe('text/turtle');
  });

  it('resolves .rdf to rdfxml adapter', () => {
    const adapter = getAdapterForExtension('.rdf');
    expect(adapter).toBeDefined();
    expect(adapter?.mimeType).toBe('application/rdf+xml');
  });

  it('resolves .owl to rdfxml adapter', () => {
    const adapter = getAdapterForExtension('.owl');
    expect(adapter).toBeDefined();
    expect(adapter?.mimeType).toBe('application/rdf+xml');
  });

  it('resolves full file path', () => {
    const adapter = getAdapterForFilePath('/some/path/ontology.owl');
    expect(adapter?.mimeType).toBe('application/rdf+xml');
  });

  it('returns undefined for unknown extension', () => {
    const adapter = getAdapterForExtension('.csv');
    expect(adapter).toBeUndefined();
  });
});
