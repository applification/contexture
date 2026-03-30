import type { Quad } from 'n3';
import { RdfXmlParser } from 'rdfxml-streaming-parser';
import { type ParseWarning, walkQuads } from '../quads';
import { createEmptyOntology } from '../types';
import type { FormatAdapter, ParseResult } from './index';

function parseRdfXmlSync(content: string): { quads: Quad[]; prefixes: Map<string, string> } {
  const quads: Quad[] = [];
  const prefixes = new Map<string, string>();

  const parser = new RdfXmlParser();

  let error: Error | null = null;

  parser.on('data', (quad: Quad) => {
    quads.push(quad);
  });

  parser.on('prefix', (prefix: string, iri: { value: string }) => {
    if (prefix) prefixes.set(prefix, iri.value);
  });

  parser.on('error', (err: Error) => {
    error = err;
  });

  parser.write(content);
  parser.end();

  if (error) throw error;

  return { quads, prefixes };
}

export function parseRdfXmlWithWarnings(content: string): ParseResult {
  const warnings: ParseWarning[] = [];

  let quads: Quad[];
  let prefixes: Map<string, string>;

  try {
    const result = parseRdfXmlSync(content);
    quads = result.quads;
    prefixes = result.prefixes;
  } catch (err: unknown) {
    warnings.push({
      severity: 'error',
      message: `RDF/XML parse error: ${(err as Error).message}`,
    });
    return { ontology: createEmptyOntology(), warnings };
  }

  const walkResult = walkQuads(quads, prefixes);
  walkResult.warnings.unshift(...warnings);
  return walkResult;
}

export const rdfXmlAdapter: FormatAdapter = {
  extensions: ['.rdf', '.owl'],
  mimeType: 'application/rdf+xml',
  parse: (content) => parseRdfXmlWithWarnings(content),
};
