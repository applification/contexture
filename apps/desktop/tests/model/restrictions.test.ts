import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseTurtle, parseTurtleWithWarnings } from '@renderer/model/parse';
import type { OntologyClass } from '@renderer/model/types';
import { describe, expect, it } from 'vitest';

const EX = 'http://example.org/restrictions#';

const restrictionsTurtle = readFileSync(
  resolve(__dirname, '../../resources/sample-ontologies/restrictions.ttl'),
  'utf-8',
);

describe('parseTurtle — owl:Restriction support', () => {
  it('parses without errors', () => {
    const { warnings } = parseTurtleWithWarnings(restrictionsTurtle);
    const errors = warnings.filter((w) => w.severity === 'error');
    expect(errors).toEqual([]);
  });

  it('does not emit "Unsupported" warning for owl:Restriction', () => {
    const { warnings } = parseTurtleWithWarnings(restrictionsTurtle);
    const unsupported = warnings.find(
      (w) => w.message.includes('Unsupported') && w.message.includes('Restriction'),
    );
    expect(unsupported).toBeUndefined();
  });

  it('does not create blank node restrictions as standalone classes', () => {
    const ontology = parseTurtle(restrictionsTurtle);
    const blankNodeClasses = [...ontology.classes.keys()].filter(
      (k) => k.startsWith('_:') || k.startsWith('n3-'),
    );
    expect(blankNodeClasses).toEqual([]);
  });

  describe('someValuesFrom', () => {
    it('Person has someValuesFrom restriction on worksFor -> Organization', () => {
      const ontology = parseTurtle(restrictionsTurtle);
      const person = ontology.classes.get(`${EX}Person`) as OntologyClass;
      expect(person.restrictions).toBeDefined();
      const svf = person.restrictions?.find(
        (r) => r.type === 'someValuesFrom' && r.onProperty === `${EX}worksFor`,
      );
      expect(svf).toBeDefined();
      expect(svf?.value).toBe(`${EX}Organization`);
    });
  });

  describe('allValuesFrom', () => {
    it('Person has allValuesFrom restriction on memberOf -> Department', () => {
      const ontology = parseTurtle(restrictionsTurtle);
      const person = ontology.classes.get(`${EX}Person`) as OntologyClass;
      const avf = person.restrictions?.find(
        (r) => r.type === 'allValuesFrom' && r.onProperty === `${EX}memberOf`,
      );
      expect(avf).toBeDefined();
      expect(avf?.value).toBe(`${EX}Department`);
    });
  });

  describe('hasValue', () => {
    it('Employee has hasValue restriction on worksFor -> AcmeCorp', () => {
      const ontology = parseTurtle(restrictionsTurtle);
      const employee = ontology.classes.get(`${EX}Employee`) as OntologyClass;
      expect(employee.restrictions).toBeDefined();
      const hv = employee.restrictions?.find(
        (r) => r.type === 'hasValue' && r.onProperty === `${EX}worksFor`,
      );
      expect(hv).toBeDefined();
      expect(hv?.value).toBe(`${EX}AcmeCorp`);
    });

    it('Employee also has regular subClassOf Person', () => {
      const ontology = parseTurtle(restrictionsTurtle);
      const employee = ontology.classes.get(`${EX}Employee`) as OntologyClass;
      expect(employee.subClassOf).toContain(`${EX}Person`);
    });
  });

  describe('minCardinality', () => {
    it('Person has minCardinality 1 on hasEmail', () => {
      const ontology = parseTurtle(restrictionsTurtle);
      const person = ontology.classes.get(`${EX}Person`) as OntologyClass;
      const mc = person.restrictions?.find(
        (r) => r.type === 'minCardinality' && r.onProperty === `${EX}hasEmail`,
      );
      expect(mc).toBeDefined();
      expect(mc?.value).toBe('1');
    });
  });

  describe('maxCardinality', () => {
    it('Person has maxCardinality 5 on manages', () => {
      const ontology = parseTurtle(restrictionsTurtle);
      const person = ontology.classes.get(`${EX}Person`) as OntologyClass;
      const mc = person.restrictions?.find(
        (r) => r.type === 'maxCardinality' && r.onProperty === `${EX}manages`,
      );
      expect(mc).toBeDefined();
      expect(mc?.value).toBe('5');
    });
  });

  describe('exactCardinality', () => {
    it('Department has exactCardinality 1 on manages', () => {
      const ontology = parseTurtle(restrictionsTurtle);
      const dept = ontology.classes.get(`${EX}Department`) as OntologyClass;
      expect(dept.restrictions).toBeDefined();
      const ec = dept.restrictions?.find(
        (r) => r.type === 'exactCardinality' && r.onProperty === `${EX}manages`,
      );
      expect(ec).toBeDefined();
      expect(ec?.value).toBe('1');
    });
  });

  describe('multiple restrictions on one class', () => {
    it('Person has exactly 4 restrictions', () => {
      const ontology = parseTurtle(restrictionsTurtle);
      const person = ontology.classes.get(`${EX}Person`) as OntologyClass;
      expect(person.restrictions).toBeDefined();
      expect(person.restrictions?.length).toBe(4);
    });

    it('Person restrictions cover 4 different types', () => {
      const ontology = parseTurtle(restrictionsTurtle);
      const person = ontology.classes.get(`${EX}Person`) as OntologyClass;
      const types = new Set(person.restrictions?.map((r) => r.type));
      expect(types).toContain('someValuesFrom');
      expect(types).toContain('allValuesFrom');
      expect(types).toContain('minCardinality');
      expect(types).toContain('maxCardinality');
    });
  });

  describe('edge cases', () => {
    it('restriction with undeclared property parses with warning', () => {
      const { ontology } = parseTurtleWithWarnings(restrictionsTurtle);
      const contractor = ontology.classes.get(`${EX}Contractor`) as OntologyClass;
      expect(contractor.restrictions).toBeDefined();
      expect(contractor.restrictions?.length).toBe(1);
      expect(contractor.restrictions?.[0].onProperty).toBe(`${EX}undeclaredProp`);
    });

    it('restriction without onProperty emits warning and is skipped', () => {
      const { ontology, warnings } = parseTurtleWithWarnings(restrictionsTurtle);
      const bad = ontology.classes.get(`${EX}BadRestriction`) as OntologyClass;
      expect(bad.restrictions ?? []).toEqual([]);
      const warning = warnings.find((w) => w.message.includes('onProperty'));
      expect(warning).toBeDefined();
    });
  });
});
