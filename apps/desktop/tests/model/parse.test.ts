import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseTurtle } from '@renderer/model/parse';
import type { DatatypeProperty, ObjectProperty, OntologyClass } from '@renderer/model/types';
import { describe, expect, it } from 'vitest';

const EX = 'http://example.org/ontology#';
const XSD = 'http://www.w3.org/2001/XMLSchema#';

const peopleTurtle = readFileSync(
  resolve(__dirname, '../../resources/sample-ontologies/people.ttl'),
  'utf-8',
);

describe('parseTurtle', () => {
  it('parses classes', () => {
    const ontology = parseTurtle(peopleTurtle);
    expect(ontology.classes.size).toBe(4);
    expect(ontology.classes.has(`${EX}Person`)).toBe(true);
    expect(ontology.classes.has(`${EX}Organisation`)).toBe(true);
    expect(ontology.classes.has(`${EX}Employee`)).toBe(true);
    expect(ontology.classes.has(`${EX}Manager`)).toBe(true);
  });

  it('parses class labels and comments', () => {
    const ontology = parseTurtle(peopleTurtle);
    const person = ontology.classes.get(`${EX}Person`) as OntologyClass;
    expect(person.label).toBe('Person');
    expect(person.comment).toBe('A human being');
  });

  it('parses subClassOf relationships', () => {
    const ontology = parseTurtle(peopleTurtle);
    const employee = ontology.classes.get(`${EX}Employee`) as OntologyClass;
    expect(employee.subClassOf).toEqual([`${EX}Person`]);

    const manager = ontology.classes.get(`${EX}Manager`) as OntologyClass;
    expect(manager.subClassOf).toEqual([`${EX}Employee`]);
  });

  it('parses object properties with domain and range', () => {
    const ontology = parseTurtle(peopleTurtle);
    expect(ontology.objectProperties.size).toBe(3);

    const worksFor = ontology.objectProperties.get(`${EX}worksFor`) as ObjectProperty;
    expect(worksFor.label).toBe('works for');
    expect(worksFor.domain).toEqual([`${EX}Employee`]);
    expect(worksFor.range).toEqual([`${EX}Organisation`]);
  });

  it('parses inverseOf', () => {
    const ontology = parseTurtle(peopleTurtle);
    const manages = ontology.objectProperties.get(`${EX}manages`) as ObjectProperty;
    expect(manages.inverseOf).toBe(`${EX}managedBy`);
  });

  it('parses datatype properties', () => {
    const ontology = parseTurtle(peopleTurtle);
    expect(ontology.datatypeProperties.size).toBe(4);

    const name = ontology.datatypeProperties.get(`${EX}name`) as DatatypeProperty;
    expect(name.label).toBe('name');
    expect(name.domain).toEqual([`${EX}Person`]);
    expect(name.range).toBe(`${XSD}string`);

    const age = ontology.datatypeProperties.get(`${EX}age`) as DatatypeProperty;
    expect(age.range).toBe(`${XSD}integer`);
  });

  it('parses prefixes', () => {
    const ontology = parseTurtle(peopleTurtle);
    expect(ontology.prefixes.get('ex')).toBe(EX);
    expect(ontology.prefixes.get('owl')).toBe('http://www.w3.org/2002/07/owl#');
  });

  it('handles empty input', () => {
    const ontology = parseTurtle('');
    expect(ontology.classes.size).toBe(0);
    expect(ontology.objectProperties.size).toBe(0);
    expect(ontology.datatypeProperties.size).toBe(0);
  });

  it('handles minimal class declaration', () => {
    const turtle = `
      @prefix owl: <http://www.w3.org/2002/07/owl#> .
      @prefix ex: <http://example.org/> .
      ex:Thing a owl:Class .
    `;
    const ontology = parseTurtle(turtle);
    expect(ontology.classes.size).toBe(1);
    const thing = ontology.classes.get('http://example.org/Thing') as OntologyClass;
    expect(thing.uri).toBe('http://example.org/Thing');
    expect(thing.label).toBeUndefined();
    expect(thing.subClassOf).toEqual([]);
  });
});
