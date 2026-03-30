import { Parser } from 'n3';
import { type ParseWarning, walkQuads } from './quads';
import type { Ontology } from './types';
import { createEmptyOntology } from './types';

export type { ParseWarning } from './quads';

export interface ParseResult {
  ontology: Ontology;
  warnings: ParseWarning[];
}

export function parseTurtle(turtle: string): Ontology {
  return parseTurtleWithWarnings(turtle).ontology;
}

export function parseTurtleWithWarnings(turtle: string): ParseResult {
  const warnings: ParseWarning[] = [];

  let quads: import('n3').Quad[];
  let prefixes: Record<string, string> | undefined;

  try {
    const parser = new Parser();
    quads = parser.parse(turtle);
    prefixes = (parser as unknown as { _prefixes: Record<string, string> })._prefixes;
  } catch (err: unknown) {
    warnings.push({
      severity: 'error',
      message: `Turtle parse error: ${(err as Error).message}`,
    });
    return { ontology: createEmptyOntology(), warnings };
  }

  const prefixMap = new Map<string, string>();
  if (prefixes) {
    for (const [prefix, iri] of Object.entries(prefixes)) {
      if (prefix) prefixMap.set(prefix, iri);
    }
  }

  const result = walkQuads(quads, prefixMap);
  result.warnings.unshift(...warnings);
  return result;
}
