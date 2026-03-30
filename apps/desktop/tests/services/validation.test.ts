import type { Ontology } from '@renderer/model/types';
import { createEmptyOntology } from '@renderer/model/types';
import { validateOntology } from '@renderer/services/validation';
import { describe, expect, it } from 'vitest';

const EX = 'http://example.org/';
const XSD = 'http://www.w3.org/2001/XMLSchema#';

function makeOntology(fn: (o: Ontology) => void): Ontology {
  const o = createEmptyOntology();
  fn(o);
  return o;
}

describe('validateOntology', () => {
  it('returns no errors for empty ontology', () => {
    expect(validateOntology(createEmptyOntology())).toEqual([]);
  });

  it('returns no errors for valid ontology', () => {
    const o = makeOntology((o) => {
      o.classes.set(`${EX}Person`, {
        uri: `${EX}Person`,
        label: 'Person',
        subClassOf: [],
        disjointWith: [],
      });
      o.datatypeProperties.set(`${EX}name`, {
        uri: `${EX}name`,
        label: 'name',
        domain: [`${EX}Person`],
        range: `${XSD}string`,
      });
    });
    const errors = validateOntology(o);
    expect(errors.filter((e) => e.severity === 'error')).toEqual([]);
  });

  it('detects missing subClassOf target', () => {
    const o = makeOntology((o) => {
      o.classes.set(`${EX}Employee`, {
        uri: `${EX}Employee`,
        label: 'Employee',
        subClassOf: [`${EX}NonExistent`],
        disjointWith: [],
      });
    });
    const errors = validateOntology(o);
    expect(errors.some((e) => e.severity === 'error' && e.message.includes('does not exist'))).toBe(
      true,
    );
  });

  it('detects circular inheritance', () => {
    const o = makeOntology((o) => {
      o.classes.set(`${EX}A`, {
        uri: `${EX}A`,
        label: 'A',
        subClassOf: [`${EX}B`],
        disjointWith: [],
      });
      o.classes.set(`${EX}B`, {
        uri: `${EX}B`,
        label: 'B',
        subClassOf: [`${EX}A`],
        disjointWith: [],
      });
    });
    const errors = validateOntology(o);
    expect(errors.some((e) => e.message === 'Circular inheritance detected')).toBe(true);
  });

  it('detects missing domain class on object property', () => {
    const o = makeOntology((o) => {
      o.classes.set(`${EX}Person`, {
        uri: `${EX}Person`,
        label: 'Person',
        subClassOf: [],
        disjointWith: [],
      });
      o.objectProperties.set(`${EX}worksFor`, {
        uri: `${EX}worksFor`,
        label: 'works for',
        domain: [`${EX}NonExistent`],
        range: [`${EX}Person`],
      });
    });
    const errors = validateOntology(o);
    expect(errors.some((e) => e.severity === 'error' && e.message.includes('Domain class'))).toBe(
      true,
    );
  });

  it('detects missing range class on object property', () => {
    const o = makeOntology((o) => {
      o.classes.set(`${EX}Person`, {
        uri: `${EX}Person`,
        label: 'Person',
        subClassOf: [],
        disjointWith: [],
      });
      o.objectProperties.set(`${EX}worksFor`, {
        uri: `${EX}worksFor`,
        label: 'works for',
        domain: [`${EX}Person`],
        range: [`${EX}NonExistent`],
      });
    });
    const errors = validateOntology(o);
    expect(errors.some((e) => e.severity === 'error' && e.message.includes('Range class'))).toBe(
      true,
    );
  });

  it('warns on class with no label', () => {
    const o = makeOntology((o) => {
      o.classes.set(`${EX}Thing`, {
        uri: `${EX}Thing`,
        subClassOf: [],
        disjointWith: [],
      });
    });
    const errors = validateOntology(o);
    expect(errors.some((e) => e.severity === 'warning' && e.message.includes('no label'))).toBe(
      true,
    );
  });

  it('warns on property with no domain', () => {
    const o = makeOntology((o) => {
      o.classes.set(`${EX}Person`, {
        uri: `${EX}Person`,
        label: 'Person',
        subClassOf: [],
        disjointWith: [],
      });
      o.objectProperties.set(`${EX}knows`, {
        uri: `${EX}knows`,
        label: 'knows',
        domain: [],
        range: [`${EX}Person`],
      });
    });
    const errors = validateOntology(o);
    expect(errors.some((e) => e.severity === 'warning' && e.message.includes('no domain'))).toBe(
      true,
    );
  });

  it('detects missing inverse property', () => {
    const o = makeOntology((o) => {
      o.classes.set(`${EX}A`, {
        uri: `${EX}A`,
        label: 'A',
        subClassOf: [],
        disjointWith: [],
      });
      o.objectProperties.set(`${EX}rel`, {
        uri: `${EX}rel`,
        label: 'rel',
        domain: [`${EX}A`],
        range: [`${EX}A`],
        inverseOf: `${EX}nonExistentProp`,
      });
    });
    const errors = validateOntology(o);
    expect(
      errors.some((e) => e.severity === 'error' && e.message.includes('Inverse property')),
    ).toBe(true);
  });
});

describe('validateOntology — individuals', () => {
  it('returns no errors for valid individual', () => {
    const o = makeOntology((o) => {
      o.classes.set(`${EX}Person`, {
        uri: `${EX}Person`,
        label: 'Person',
        subClassOf: [],
        disjointWith: [],
      });
      o.individuals.set(`${EX}john`, {
        uri: `${EX}john`,
        label: 'John',
        types: [`${EX}Person`],
        objectPropertyAssertions: [],
        dataPropertyAssertions: [],
      });
    });
    const errors = validateOntology(o).filter((e) => e.elementType === 'individual');
    expect(errors).toEqual([]);
  });

  it('warns on individual with no type assertion', () => {
    const o = makeOntology((o) => {
      o.individuals.set(`${EX}orphan`, {
        uri: `${EX}orphan`,
        label: 'Orphan',
        types: [],
        objectPropertyAssertions: [],
        dataPropertyAssertions: [],
      });
    });
    const errors = validateOntology(o);
    expect(
      errors.some(
        (e) =>
          e.elementType === 'individual' &&
          e.severity === 'warning' &&
          e.message.includes('no type assertion'),
      ),
    ).toBe(true);
  });

  it('warns on individual with dangling type reference', () => {
    const o = makeOntology((o) => {
      o.individuals.set(`${EX}thing`, {
        uri: `${EX}thing`,
        label: 'Thing',
        types: [`${EX}NonExistentClass`],
        objectPropertyAssertions: [],
        dataPropertyAssertions: [],
      });
    });
    const errors = validateOntology(o);
    expect(
      errors.some(
        (e) =>
          e.elementType === 'individual' &&
          e.severity === 'warning' &&
          e.message.includes('does not exist'),
      ),
    ).toBe(true);
  });

  it('warns on individual with no label', () => {
    const o = makeOntology((o) => {
      o.classes.set(`${EX}Person`, {
        uri: `${EX}Person`,
        label: 'Person',
        subClassOf: [],
        disjointWith: [],
      });
      o.individuals.set(`${EX}noLabel`, {
        uri: `${EX}noLabel`,
        types: [`${EX}Person`],
        objectPropertyAssertions: [],
        dataPropertyAssertions: [],
      });
    });
    const errors = validateOntology(o);
    expect(
      errors.some(
        (e) =>
          e.elementType === 'individual' &&
          e.severity === 'warning' &&
          e.message.includes('no label'),
      ),
    ).toBe(true);
  });
});
