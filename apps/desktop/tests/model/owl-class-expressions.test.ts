import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseTurtleWithWarnings } from '@renderer/model/parse';
import type { OntologyClass } from '@renderer/model/types';
import { describe, expect, it } from 'vitest';

const EX = 'http://example.org/expr#';

const classExpressionTurtle = readFileSync(
  resolve(__dirname, '../../resources/sample-ontologies/owl-class-expressions.ttl'),
  'utf-8',
);

function getClassExpressions(cls: OntologyClass): unknown[] {
  return ((cls as unknown as { classExpressions?: unknown[] }).classExpressions ?? []) as unknown[];
}

describe('parseTurtle — OWL class expressions (ONT-83)', () => {
  it('does not create anonymous class-expression blank nodes as standalone classes', () => {
    const { ontology } = parseTurtleWithWarnings(classExpressionTurtle);
    const blankNodeClasses = [...ontology.classes.keys()].filter(
      (k) => k.startsWith('_:') || k.startsWith('n3-'),
    );

    expect(blankNodeClasses).toEqual([]);
  });

  it('extracts equivalentClass expressions for named and anonymous targets', () => {
    const { ontology } = parseTurtleWithWarnings(classExpressionTurtle);
    const named = ontology.classes.get(`${EX}A`) as OntologyClass;
    const anonymous = ontology.classes.get(`${EX}EqAnd`) as OntologyClass;

    expect(getClassExpressions(named).length).toBeGreaterThan(0);
    expect(getClassExpressions(anonymous).length).toBeGreaterThan(0);
  });

  it('extracts unionOf/intersectionOf/complementOf with nesting', () => {
    const { ontology } = parseTurtleWithWarnings(classExpressionTurtle);
    const subOr = ontology.classes.get(`${EX}SubOr`) as OntologyClass;
    const subNot = ontology.classes.get(`${EX}SubNot`) as OntologyClass;
    const nested = ontology.classes.get(`${EX}Nested`) as OntologyClass;

    expect(getClassExpressions(subOr).length).toBeGreaterThan(0);
    expect(getClassExpressions(subNot).length).toBeGreaterThan(0);
    expect(getClassExpressions(nested).length).toBeGreaterThan(0);
  });

  it('emits warning for malformed RDF list/cycle in class expressions without crashing', () => {
    const { ontology, warnings } = parseTurtleWithWarnings(classExpressionTurtle);
    const broken = ontology.classes.get(`${EX}Broken`) as OntologyClass;

    expect(broken).toBeDefined();
    expect(warnings.some((w) => /class expression|rdf list|cycle|malformed/i.test(w.message))).toBe(
      true,
    );
  });
});
