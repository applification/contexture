import { useOntologyStore } from '@renderer/store/ontology';
import { beforeEach, describe, expect, it } from 'vitest';

const SAMPLE_TURTLE = `
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix : <http://example.org/> .

:Person a owl:Class ;
    rdfs:label "Person" ;
    rdfs:comment "A human being" .

:Employee a owl:Class ;
    rdfs:subClassOf :Person ;
    rdfs:label "Employee" .

:worksAt a owl:ObjectProperty ;
    rdfs:domain :Employee ;
    rdfs:range :Company .

:Company a owl:Class ;
    rdfs:label "Company" .

:name a owl:DatatypeProperty ;
    rdfs:domain :Person ;
    rdfs:range <http://www.w3.org/2001/XMLSchema#string> ;
    rdfs:label "name" .
`;

function resetStore() {
  useOntologyStore.getState().reset();
}

describe('useOntologyStore', () => {
  beforeEach(resetStore);

  describe('loadFromTurtle', () => {
    it('loads classes from turtle', () => {
      useOntologyStore.getState().loadFromTurtle(SAMPLE_TURTLE, '/test.ttl');
      const { ontology, filePath, isDirty } = useOntologyStore.getState();
      expect(ontology.classes.size).toBeGreaterThanOrEqual(3);
      expect(ontology.classes.has('http://example.org/Person')).toBe(true);
      expect(filePath).toBe('/test.ttl');
      expect(isDirty).toBe(false);
    });

    it('loads without filePath', () => {
      useOntologyStore.getState().loadFromTurtle(SAMPLE_TURTLE);
      expect(useOntologyStore.getState().filePath).toBeNull();
    });
  });

  describe('exportToTurtle', () => {
    it('round-trips turtle content', () => {
      useOntologyStore.getState().loadFromTurtle(SAMPLE_TURTLE);
      const exported = useOntologyStore.getState().exportToTurtle();
      expect(exported).toContain('Person');
      expect(exported).toContain('Employee');
    });
  });

  describe('reset', () => {
    it('clears all state', () => {
      useOntologyStore.getState().loadFromTurtle(SAMPLE_TURTLE, '/test.ttl');
      useOntologyStore.getState().reset();
      const { ontology, filePath, isDirty } = useOntologyStore.getState();
      expect(ontology.classes.size).toBe(0);
      expect(filePath).toBeNull();
      expect(isDirty).toBe(false);
    });
  });

  describe('setFilePath', () => {
    it('updates file path', () => {
      useOntologyStore.getState().setFilePath('/new.ttl');
      expect(useOntologyStore.getState().filePath).toBe('/new.ttl');
    });
  });

  describe('markClean', () => {
    it('clears dirty flag', () => {
      useOntologyStore.getState().addClass('http://example.org/Test');
      expect(useOntologyStore.getState().isDirty).toBe(true);
      useOntologyStore.getState().markClean();
      expect(useOntologyStore.getState().isDirty).toBe(false);
    });
  });

  describe('addClass', () => {
    it('adds a class with defaults', () => {
      useOntologyStore.getState().addClass('http://example.org/Foo');
      const cls = useOntologyStore.getState().ontology.classes.get('http://example.org/Foo');
      expect(cls).toBeDefined();
      expect(cls?.uri).toBe('http://example.org/Foo');
      expect(cls?.subClassOf).toEqual([]);
      expect(cls?.disjointWith).toEqual([]);
      expect(useOntologyStore.getState().isDirty).toBe(true);
    });

    it('adds a class with partial data', () => {
      useOntologyStore.getState().addClass('http://example.org/Foo', {
        label: 'Foo',
        comment: 'A foo class',
      });
      const cls = useOntologyStore.getState().ontology.classes.get('http://example.org/Foo');
      expect(cls?.label).toBe('Foo');
      expect(cls?.comment).toBe('A foo class');
    });
  });

  describe('updateClass', () => {
    it('updates existing class', () => {
      useOntologyStore.getState().addClass('http://example.org/Foo', { label: 'Foo' });
      useOntologyStore.getState().updateClass('http://example.org/Foo', { label: 'Bar' });
      expect(
        useOntologyStore.getState().ontology.classes.get('http://example.org/Foo')?.label,
      ).toBe('Bar');
    });

    it('does nothing for non-existent class', () => {
      const before = useOntologyStore.getState().ontology;
      useOntologyStore.getState().updateClass('http://example.org/Missing', { label: 'X' });
      expect(useOntologyStore.getState().ontology).toBe(before);
    });
  });

  describe('removeClass', () => {
    it('removes a class and cleans up references', () => {
      useOntologyStore.getState().loadFromTurtle(SAMPLE_TURTLE);
      const store = useOntologyStore.getState();
      const hadEmployee = store.ontology.classes.has('http://example.org/Employee');
      expect(hadEmployee).toBe(true);

      useOntologyStore.getState().removeClass('http://example.org/Person');
      const after = useOntologyStore.getState().ontology;
      expect(after.classes.has('http://example.org/Person')).toBe(false);
      // Employee's subClassOf should no longer reference Person
      const emp = after.classes.get('http://example.org/Employee');
      if (emp) {
        expect(emp.subClassOf).not.toContain('http://example.org/Person');
      }
    });

    it('removes orphaned properties when domain/range cleared', () => {
      useOntologyStore.getState().addClass('http://ex/A');
      useOntologyStore.getState().addDatatypeProperty('http://ex/dp', {
        domain: ['http://ex/A'],
        range: 'http://www.w3.org/2001/XMLSchema#string',
      });
      expect(useOntologyStore.getState().ontology.datatypeProperties.size).toBe(1);
      useOntologyStore.getState().removeClass('http://ex/A');
      expect(useOntologyStore.getState().ontology.datatypeProperties.size).toBe(0);
    });
  });

  describe('object property operations', () => {
    it('adds an object property', () => {
      useOntologyStore.getState().addObjectProperty('http://ex/rel', {
        domain: ['http://ex/A'],
        range: ['http://ex/B'],
      });
      const prop = useOntologyStore.getState().ontology.objectProperties.get('http://ex/rel');
      expect(prop).toBeDefined();
      expect(prop?.domain).toEqual(['http://ex/A']);
      expect(prop?.range).toEqual(['http://ex/B']);
    });

    it('updates an object property', () => {
      useOntologyStore.getState().addObjectProperty('http://ex/rel');
      useOntologyStore.getState().updateObjectProperty('http://ex/rel', { label: 'Relates' });
      expect(
        useOntologyStore.getState().ontology.objectProperties.get('http://ex/rel')?.label,
      ).toBe('Relates');
    });

    it('does nothing for non-existent property', () => {
      const before = useOntologyStore.getState().ontology;
      useOntologyStore.getState().updateObjectProperty('http://ex/nope', { label: 'X' });
      expect(useOntologyStore.getState().ontology).toBe(before);
    });

    it('removes an object property', () => {
      useOntologyStore.getState().addObjectProperty('http://ex/rel');
      useOntologyStore.getState().removeObjectProperty('http://ex/rel');
      expect(useOntologyStore.getState().ontology.objectProperties.has('http://ex/rel')).toBe(
        false,
      );
    });
  });

  describe('datatype property operations', () => {
    it('adds with default range', () => {
      useOntologyStore.getState().addDatatypeProperty('http://ex/dp');
      const prop = useOntologyStore.getState().ontology.datatypeProperties.get('http://ex/dp');
      expect(prop?.range).toBe('http://www.w3.org/2001/XMLSchema#string');
    });

    it('updates a datatype property', () => {
      useOntologyStore.getState().addDatatypeProperty('http://ex/dp');
      useOntologyStore.getState().updateDatatypeProperty('http://ex/dp', { label: 'Data' });
      expect(
        useOntologyStore.getState().ontology.datatypeProperties.get('http://ex/dp')?.label,
      ).toBe('Data');
    });

    it('does nothing for non-existent property', () => {
      const before = useOntologyStore.getState().ontology;
      useOntologyStore.getState().updateDatatypeProperty('http://ex/nope', { label: 'X' });
      expect(useOntologyStore.getState().ontology).toBe(before);
    });

    it('removes a datatype property', () => {
      useOntologyStore.getState().addDatatypeProperty('http://ex/dp');
      useOntologyStore.getState().removeDatatypeProperty('http://ex/dp');
      expect(useOntologyStore.getState().ontology.datatypeProperties.has('http://ex/dp')).toBe(
        false,
      );
    });
  });

  describe('restoreOntology', () => {
    it('restores from snapshot', () => {
      useOntologyStore.getState().addClass('http://ex/A', { label: 'A' });
      const snapshot = useOntologyStore.getState().ontology;
      useOntologyStore.getState().reset();
      useOntologyStore.getState().restoreOntology(snapshot);
      expect(useOntologyStore.getState().ontology.classes.has('http://ex/A')).toBe(true);
      expect(useOntologyStore.getState().isDirty).toBe(true);
    });
  });

  describe('individual operations', () => {
    it('adds an individual with defaults', () => {
      useOntologyStore.getState().addIndividual('http://ex/john');
      const ind = useOntologyStore.getState().ontology.individuals.get('http://ex/john');
      expect(ind).toBeDefined();
      expect(ind?.uri).toBe('http://ex/john');
      expect(ind?.types).toEqual([]);
      expect(ind?.objectPropertyAssertions).toEqual([]);
      expect(ind?.dataPropertyAssertions).toEqual([]);
      expect(useOntologyStore.getState().isDirty).toBe(true);
    });

    it('adds an individual with partial data', () => {
      useOntologyStore.getState().addIndividual('http://ex/john', {
        label: 'John',
        types: ['http://ex/Person'],
      });
      const ind = useOntologyStore.getState().ontology.individuals.get('http://ex/john');
      expect(ind?.label).toBe('John');
      expect(ind?.types).toEqual(['http://ex/Person']);
    });

    it('updates an existing individual', () => {
      useOntologyStore.getState().addIndividual('http://ex/john', { label: 'John' });
      useOntologyStore.getState().updateIndividual('http://ex/john', { label: 'John Smith' });
      expect(useOntologyStore.getState().ontology.individuals.get('http://ex/john')?.label).toBe(
        'John Smith',
      );
    });

    it('does nothing for non-existent individual', () => {
      const before = useOntologyStore.getState().ontology;
      useOntologyStore.getState().updateIndividual('http://ex/nope', { label: 'X' });
      expect(useOntologyStore.getState().ontology).toBe(before);
    });

    it('removes an individual', () => {
      useOntologyStore.getState().addIndividual('http://ex/john');
      useOntologyStore.getState().removeIndividual('http://ex/john');
      expect(useOntologyStore.getState().ontology.individuals.has('http://ex/john')).toBe(false);
    });

    it('loads individuals from turtle', () => {
      const turtle = `
        @prefix owl: <http://www.w3.org/2002/07/owl#> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
        @prefix : <http://example.org/> .

        :Person a owl:Class ; rdfs:label "Person" .
        :john a owl:NamedIndividual, :Person ;
            rdfs:label "John" .
      `;
      useOntologyStore.getState().loadFromTurtle(turtle);
      const { ontology } = useOntologyStore.getState();
      expect(ontology.individuals.size).toBe(1);
      expect(ontology.individuals.has('http://example.org/john')).toBe(true);
      expect(ontology.individuals.get('http://example.org/john')?.label).toBe('John');
    });

    it('exports individuals in turtle round-trip', () => {
      useOntologyStore.getState().addIndividual('http://ex/john', {
        label: 'John',
        types: ['http://ex/Person'],
      });
      const exported = useOntologyStore.getState().exportToTurtle();
      expect(exported).toContain('John');
      expect(exported).toContain('NamedIndividual');
    });
  });
});
