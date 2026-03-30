import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseTurtle } from '@renderer/model/parse';
import { serializeToTurtle } from '@renderer/model/serialize';
import type {
  DatatypeProperty,
  Individual,
  ObjectProperty,
  OntologyClass,
} from '@renderer/model/types';
import { createEmptyOntology } from '@renderer/model/types';
import { describe, expect, it } from 'vitest';

const EX = 'http://example.org/ontology#';
const _XSD = 'http://www.w3.org/2001/XMLSchema#';

const peopleTurtle = readFileSync(
  resolve(__dirname, '../../resources/sample-ontologies/people.ttl'),
  'utf-8',
);

const individualsTurtle = readFileSync(
  resolve(__dirname, '../../resources/sample-ontologies/individuals.ttl'),
  'utf-8',
);

describe('serializeToTurtle', () => {
  it('round-trips: parse then serialize preserves classes', () => {
    const original = parseTurtle(peopleTurtle);
    const serialized = serializeToTurtle(original);
    const reparsed = parseTurtle(serialized);

    expect(reparsed.classes.size).toBe(original.classes.size);
    for (const [uri, cls] of original.classes) {
      const reparsedCls = reparsed.classes.get(uri) as OntologyClass;
      expect(reparsedCls).toBeDefined();
      expect(reparsedCls.label).toBe(cls.label);
      expect(reparsedCls.comment).toBe(cls.comment);
      expect(reparsedCls.subClassOf.sort()).toEqual(cls.subClassOf.sort());
    }
  });

  it('round-trips: preserves object properties', () => {
    const original = parseTurtle(peopleTurtle);
    const serialized = serializeToTurtle(original);
    const reparsed = parseTurtle(serialized);

    expect(reparsed.objectProperties.size).toBe(original.objectProperties.size);
    for (const [uri, prop] of original.objectProperties) {
      const reparsedProp = reparsed.objectProperties.get(uri) as ObjectProperty;
      expect(reparsedProp).toBeDefined();
      expect(reparsedProp.label).toBe(prop.label);
      expect(reparsedProp.domain.sort()).toEqual(prop.domain.sort());
      expect(reparsedProp.range.sort()).toEqual(prop.range.sort());
      expect(reparsedProp.inverseOf).toBe(prop.inverseOf);
    }
  });

  it('round-trips: preserves datatype properties', () => {
    const original = parseTurtle(peopleTurtle);
    const serialized = serializeToTurtle(original);
    const reparsed = parseTurtle(serialized);

    expect(reparsed.datatypeProperties.size).toBe(original.datatypeProperties.size);
    for (const [uri, prop] of original.datatypeProperties) {
      const reparsedProp = reparsed.datatypeProperties.get(uri) as DatatypeProperty;
      expect(reparsedProp).toBeDefined();
      expect(reparsedProp.label).toBe(prop.label);
      expect(reparsedProp.domain.sort()).toEqual(prop.domain.sort());
      expect(reparsedProp.range).toBe(prop.range);
    }
  });

  it('round-trips: preserves prefixes', () => {
    const original = parseTurtle(peopleTurtle);
    const serialized = serializeToTurtle(original);
    const reparsed = parseTurtle(serialized);

    expect(reparsed.prefixes.get('ex')).toBe(EX);
  });

  it('serializes empty ontology', () => {
    const empty = createEmptyOntology();
    const serialized = serializeToTurtle(empty);
    expect(typeof serialized).toBe('string');
    // Should at least have prefix declarations
    const reparsed = parseTurtle(serialized);
    expect(reparsed.classes.size).toBe(0);
  });
});

describe('serializeToTurtle — determinism', () => {
  it('produces identical output on repeated serialization', () => {
    const ont = parseTurtle(peopleTurtle);
    const first = serializeToTurtle(ont);
    const second = serializeToTurtle(ont);
    expect(first).toBe(second);
  });

  it('produces identical output regardless of insertion order', () => {
    const ont1 = createEmptyOntology();
    const ont2 = createEmptyOntology();

    // Insert classes in opposite order
    const classA = { uri: `${EX}Alpha`, subClassOf: [], disjointWith: [] };
    const classB = { uri: `${EX}Beta`, label: 'Beta', subClassOf: [], disjointWith: [] };
    const classC = { uri: `${EX}Charlie`, subClassOf: [`${EX}Alpha`, `${EX}Beta`], disjointWith: [] };

    ont1.classes.set(classA.uri, classA);
    ont1.classes.set(classB.uri, classB);
    ont1.classes.set(classC.uri, classC);

    ont2.classes.set(classC.uri, classC);
    ont2.classes.set(classA.uri, classA);
    ont2.classes.set(classB.uri, classB);

    expect(serializeToTurtle(ont1)).toBe(serializeToTurtle(ont2));
  });

  it('sorts prefixes alphabetically', () => {
    const ont = createEmptyOntology();
    ont.prefixes.set('z', 'http://z.example.org/');
    ont.prefixes.set('a', 'http://a.example.org/');

    const output = serializeToTurtle(ont);
    const prefixLines = output.split('\n').filter((l) => l.startsWith('@prefix'));
    const prefixNames = prefixLines.map((l) => l.match(/@prefix (\S+):/)?.[1]).filter(Boolean);
    const sorted = [...prefixNames].sort();
    expect(prefixNames).toEqual(sorted);
  });

  it('produces identical output for individuals regardless of insertion order', () => {
    const ont1 = parseTurtle(individualsTurtle);
    const ont2 = createEmptyOntology();

    // Copy everything but reverse individual insertion order
    for (const [k, v] of ont1.prefixes) ont2.prefixes.set(k, v);
    for (const [k, v] of ont1.classes) ont2.classes.set(k, v);
    for (const [k, v] of ont1.objectProperties) ont2.objectProperties.set(k, v);
    for (const [k, v] of ont1.datatypeProperties) ont2.datatypeProperties.set(k, v);

    const indEntries = [...ont1.individuals.entries()].reverse();
    for (const [k, v] of indEntries) ont2.individuals.set(k, v);

    expect(serializeToTurtle(ont1)).toBe(serializeToTurtle(ont2));
  });
});

describe('serializeToTurtle — individuals', () => {
  it('round-trips: preserves individuals', () => {
    const original = parseTurtle(individualsTurtle);
    const serialized = serializeToTurtle(original);
    const reparsed = parseTurtle(serialized);

    expect(reparsed.individuals.size).toBe(original.individuals.size);
    for (const [uri, ind] of original.individuals) {
      const reparsedInd = reparsed.individuals.get(uri) as Individual;
      expect(reparsedInd).toBeDefined();
      expect(reparsedInd.label).toBe(ind.label);
      expect(reparsedInd.comment).toBe(ind.comment);
      expect(reparsedInd.types.sort()).toEqual(ind.types.sort());
    }
  });

  it('round-trips: preserves individual type assertions', () => {
    const original = parseTurtle(individualsTurtle);
    const serialized = serializeToTurtle(original);
    const reparsed = parseTurtle(serialized);

    const john = reparsed.individuals.get(`${EX}john`) as Individual;
    expect(john.types).toContain(`${EX}Employee`);

    const bob = reparsed.individuals.get(`${EX}bob`) as Individual;
    expect(bob.types).toContain(`${EX}Person`);
    expect(bob.types).toContain(`${EX}Employee`);
  });

  it('round-trips: preserves object property assertions', () => {
    const original = parseTurtle(individualsTurtle);
    const serialized = serializeToTurtle(original);
    const reparsed = parseTurtle(serialized);

    const john = reparsed.individuals.get(`${EX}john`) as Individual;
    const worksFor = john.objectPropertyAssertions.find((a) => a.property === `${EX}worksFor`);
    expect(worksFor).toBeDefined();
    expect(worksFor?.target).toBe(`${EX}acmeCorp`);
  });

  it('round-trips: preserves data property assertions', () => {
    const original = parseTurtle(individualsTurtle);
    const serialized = serializeToTurtle(original);
    const reparsed = parseTurtle(serialized);

    const john = reparsed.individuals.get(`${EX}john`) as Individual;
    const name = john.dataPropertyAssertions.find((a) => a.property === `${EX}name`);
    expect(name).toBeDefined();
    expect(name?.value).toBe('John Smith');
  });

  it('round-trips: preserves classes alongside individuals', () => {
    const original = parseTurtle(individualsTurtle);
    const serialized = serializeToTurtle(original);
    const reparsed = parseTurtle(serialized);

    expect(reparsed.classes.size).toBe(original.classes.size);
    expect(reparsed.individuals.size).toBe(original.individuals.size);
  });

  it('serializes individual with no assertions', () => {
    const ont = createEmptyOntology();
    ont.individuals.set('http://ex/empty', {
      uri: 'http://ex/empty',
      types: [],
      objectPropertyAssertions: [],
      dataPropertyAssertions: [],
    });
    const serialized = serializeToTurtle(ont);
    const reparsed = parseTurtle(serialized);
    expect(reparsed.individuals.has('http://ex/empty')).toBe(true);
  });
});
