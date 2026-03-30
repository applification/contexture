import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseRdfXmlWithWarnings } from '@renderer/model/formats/rdfxml';
import { parseTurtleWithWarnings } from '@renderer/model/parse';
import type { DatatypeProperty, ObjectProperty, OntologyClass } from '@renderer/model/types';
import { describe, expect, it } from 'vitest';

const EX = 'http://example.org/ontology#';
const XSD = 'http://www.w3.org/2001/XMLSchema#';

const peopleRdf = readFileSync(
  resolve(__dirname, '../../resources/sample-ontologies/people.rdf'),
  'utf-8',
);

describe('parseRdfXml', () => {
  it('parses classes', () => {
    const { ontology } = parseRdfXmlWithWarnings(peopleRdf);
    expect(ontology.classes.size).toBe(4);
    expect(ontology.classes.has(`${EX}Person`)).toBe(true);
    expect(ontology.classes.has(`${EX}Organisation`)).toBe(true);
    expect(ontology.classes.has(`${EX}Employee`)).toBe(true);
    expect(ontology.classes.has(`${EX}Manager`)).toBe(true);
  });

  it('parses class labels and comments', () => {
    const { ontology } = parseRdfXmlWithWarnings(peopleRdf);
    const person = ontology.classes.get(`${EX}Person`) as OntologyClass;
    expect(person.label).toBe('Person');
    expect(person.comment).toBe('A human being');
  });

  it('parses subClassOf relationships', () => {
    const { ontology } = parseRdfXmlWithWarnings(peopleRdf);
    const employee = ontology.classes.get(`${EX}Employee`) as OntologyClass;
    expect(employee.subClassOf).toEqual([`${EX}Person`]);

    const manager = ontology.classes.get(`${EX}Manager`) as OntologyClass;
    expect(manager.subClassOf).toEqual([`${EX}Employee`]);
  });

  it('parses object properties with domain and range', () => {
    const { ontology } = parseRdfXmlWithWarnings(peopleRdf);
    expect(ontology.objectProperties.size).toBe(3);

    const worksFor = ontology.objectProperties.get(`${EX}worksFor`) as ObjectProperty;
    expect(worksFor.label).toBe('works for');
    expect(worksFor.domain).toEqual([`${EX}Employee`]);
    expect(worksFor.range).toEqual([`${EX}Organisation`]);
  });

  it('parses inverseOf', () => {
    const { ontology } = parseRdfXmlWithWarnings(peopleRdf);
    const manages = ontology.objectProperties.get(`${EX}manages`) as ObjectProperty;
    expect(manages.inverseOf).toBe(`${EX}managedBy`);
  });

  it('parses datatype properties', () => {
    const { ontology } = parseRdfXmlWithWarnings(peopleRdf);
    expect(ontology.datatypeProperties.size).toBe(4);

    const name = ontology.datatypeProperties.get(`${EX}name`) as DatatypeProperty;
    expect(name.label).toBe('name');
    expect(name.domain).toEqual([`${EX}Person`]);
    expect(name.range).toBe(`${XSD}string`);

    const age = ontology.datatypeProperties.get(`${EX}age`) as DatatypeProperty;
    expect(age.range).toBe(`${XSD}integer`);
  });

  it('produces no errors for valid RDF/XML', () => {
    const { warnings } = parseRdfXmlWithWarnings(peopleRdf);
    const errors = warnings.filter((w) => w.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('returns error for invalid XML', () => {
    const { warnings } = parseRdfXmlWithWarnings('<not valid xml');
    expect(warnings.some((w) => w.severity === 'error')).toBe(true);
  });

  it('produces same ontology structure as Turtle parser', () => {
    const { ontology: rdfOnt } = parseRdfXmlWithWarnings(peopleRdf);

    const peopleTtl = readFileSync(
      resolve(__dirname, '../../resources/sample-ontologies/people.ttl'),
      'utf-8',
    );
    const { ontology: ttlOnt } = parseTurtleWithWarnings(peopleTtl);

    // Same classes
    expect([...rdfOnt.classes.keys()].sort()).toEqual([...ttlOnt.classes.keys()].sort());

    // Same object properties
    expect([...rdfOnt.objectProperties.keys()].sort()).toEqual(
      [...ttlOnt.objectProperties.keys()].sort(),
    );

    // Same datatype properties
    expect([...rdfOnt.datatypeProperties.keys()].sort()).toEqual(
      [...ttlOnt.datatypeProperties.keys()].sort(),
    );
  });
});
