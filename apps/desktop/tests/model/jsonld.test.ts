import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getAdapterForExtension, getAdapterForFilePath } from '@renderer/model/formats';
import { parseTurtle } from '@renderer/model/parse';
import { describe, expect, it } from 'vitest';

const FIXTURE = resolve(__dirname, '../../resources/sample-ontologies/jsonld-roundtrip.ttl');

const EX = 'http://example.org/ontograph#';

function getJsonLdAdapter() {
  const adapter = getAdapterForExtension('.jsonld');
  if (!adapter?.parseAsync || !adapter.serializeAsync) {
    throw new Error('JSON-LD adapter missing parseAsync/serializeAsync');
  }
  return adapter as typeof adapter & {
    parseAsync: NonNullable<(typeof adapter)['parseAsync']>;
    serializeAsync: NonNullable<(typeof adapter)['serializeAsync']>;
  };
}

// ---- Format registry ----

describe('format registry — JSON-LD', () => {
  it('resolves .jsonld extension', () => {
    const adapter = getAdapterForExtension('.jsonld');
    expect(adapter).toBeDefined();
    expect(adapter?.mimeType).toBe('application/ld+json');
  });

  it('resolves full file path with .jsonld', () => {
    const adapter = getAdapterForFilePath('/x/ontology.jsonld');
    expect(adapter?.mimeType).toBe('application/ld+json');
  });

  it('has parseAsync method', () => {
    const adapter = getAdapterForExtension('.jsonld');
    expect(adapter?.parseAsync).toBeDefined();
  });

  it('has serializeAsync method', () => {
    const adapter = getAdapterForExtension('.jsonld');
    expect(adapter?.serializeAsync).toBeDefined();
  });
});

// ---- Parse path ----

describe('JSON-LD parse', () => {
  it('returns error warning for invalid JSON', async () => {
    const adapter = getJsonLdAdapter();
    const result = await adapter.parseAsync('not valid json');
    expect(result.warnings.some((w) => w.severity === 'error')).toBe(true);
  });

  it('parses a minimal JSON-LD document', async () => {
    const adapter = getJsonLdAdapter();
    const doc = {
      '@context': {
        owl: 'http://www.w3.org/2002/07/owl#',
        rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
        rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
      },
      '@graph': [
        {
          '@id': 'http://example.org/test#Widget',
          '@type': 'owl:Class',
          'rdfs:label': 'Widget',
        },
      ],
    };
    const result = await adapter.parseAsync(JSON.stringify(doc));
    const errors = result.warnings.filter((w) => w.severity === 'error');
    expect(errors).toEqual([]);
    expect(result.ontology.classes.has('http://example.org/test#Widget')).toBe(true);
    expect(result.ontology.classes.get('http://example.org/test#Widget')?.label).toBe('Widget');
  });
});

// ---- Serialize path ----

describe('JSON-LD serialize', () => {
  it('serializeAsync returns valid JSON string', async () => {
    const adapter = getJsonLdAdapter();
    const ontology = parseTurtle(readFileSync(FIXTURE, 'utf-8'));
    const serialized = await adapter.serializeAsync(ontology);
    expect(() => JSON.parse(serialized)).not.toThrow();
  });

  it('serialized output contains @context', async () => {
    const adapter = getJsonLdAdapter();
    const ontology = parseTurtle(readFileSync(FIXTURE, 'utf-8'));
    const serialized = await adapter.serializeAsync(ontology);
    const doc = JSON.parse(serialized);
    expect(doc['@context']).toBeDefined();
  });
});

// ---- Round-trip fidelity ----

describe('JSON-LD round-trip — jsonld-roundtrip.ttl', () => {
  const turtleContent = readFileSync(FIXTURE, 'utf-8');

  async function roundTripOntology() {
    const adapter = getJsonLdAdapter();
    const original = parseTurtle(turtleContent);
    const serialized = await adapter.serializeAsync(original);
    const reparsed = await adapter.parseAsync(serialized);
    return { original, reparsed: reparsed.ontology, warnings: reparsed.warnings };
  }

  it('round-trip has no parse errors', async () => {
    const { warnings } = await roundTripOntology();
    const errors = warnings.filter((w) => w.severity === 'error');
    expect(errors).toEqual([]);
  });

  it('round-trip preserves class count', async () => {
    const { original, reparsed } = await roundTripOntology();
    expect(reparsed.classes.size).toBe(original.classes.size);
  });

  it('round-trip preserves class URIs', async () => {
    const { original, reparsed } = await roundTripOntology();
    for (const uri of original.classes.keys()) {
      expect(reparsed.classes.has(uri)).toBe(true);
    }
  });

  it('round-trip preserves class labels', async () => {
    const { original, reparsed } = await roundTripOntology();
    for (const [uri, cls] of original.classes) {
      if (cls.label) {
        expect(reparsed.classes.get(uri)?.label).toBe(cls.label);
      }
    }
  });

  it('round-trip preserves subClassOf', async () => {
    const { reparsed } = await roundTripOntology();
    const employee = reparsed.classes.get(`${EX}Employee`);
    expect(employee?.subClassOf).toContain(`${EX}Person`);
  });

  it('round-trip preserves disjointWith', async () => {
    const { reparsed } = await roundTripOntology();
    const contractor = reparsed.classes.get(`${EX}Contractor`);
    expect(contractor?.disjointWith).toContain(`${EX}Employee`);
  });

  it('round-trip preserves object property count', async () => {
    const { original, reparsed } = await roundTripOntology();
    expect(reparsed.objectProperties.size).toBe(original.objectProperties.size);
  });

  it('round-trip preserves object property domain/range', async () => {
    const { reparsed } = await roundTripOntology();
    const worksWith = reparsed.objectProperties.get(`${EX}worksWith`);
    expect(worksWith?.domain).toContain(`${EX}Person`);
    expect(worksWith?.range).toContain(`${EX}Person`);
  });

  it('round-trip preserves datatype property count', async () => {
    const { original, reparsed } = await roundTripOntology();
    expect(reparsed.datatypeProperties.size).toBe(original.datatypeProperties.size);
  });

  it('round-trip preserves individual count', async () => {
    const { original, reparsed } = await roundTripOntology();
    expect(reparsed.individuals.size).toBe(original.individuals.size);
  });

  it('round-trip preserves individual type assertions', async () => {
    const { reparsed } = await roundTripOntology();
    const alice = reparsed.individuals.get(`${EX}Alice`);
    expect(alice?.types).toContain(`${EX}Employee`);
  });

  it('round-trip preserves individual data property assertions', async () => {
    const { reparsed } = await roundTripOntology();
    const alice = reparsed.individuals.get(`${EX}Alice`);
    const idAssertion = alice?.dataPropertyAssertions.find((a) => a.property === `${EX}employeeId`);
    expect(idAssertion?.value).toBe('E-001');
  });
});
