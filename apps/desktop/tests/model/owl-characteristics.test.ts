import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseTurtle, parseTurtleWithWarnings } from '@renderer/model/parse';
import type { ObjectProperty } from '@renderer/model/types';
import { describe, expect, it } from 'vitest';

const EX = 'http://example.org/characteristics#';

const characteristicsTurtle = readFileSync(
  resolve(__dirname, '../../resources/sample-ontologies/owl-characteristics.ttl'),
  'utf-8',
);

describe('OWL property characteristics parsing', () => {
  it('parses without errors', () => {
    const { warnings } = parseTurtleWithWarnings(characteristicsTurtle);
    const errors = warnings.filter((w) => w.severity === 'error');
    expect(errors).toEqual([]);
  });

  describe('single characteristics', () => {
    it('detects owl:TransitiveProperty', () => {
      const ontology = parseTurtle(characteristicsTurtle);
      const prop = ontology.objectProperties.get(`${EX}hasAncestor`) as ObjectProperty;
      expect(prop).toBeDefined();
      expect(prop.characteristics).toContain('transitive');
      expect(prop.characteristics).toHaveLength(1);
    });

    it('detects owl:SymmetricProperty', () => {
      const ontology = parseTurtle(characteristicsTurtle);
      const prop = ontology.objectProperties.get(`${EX}hasSibling`) as ObjectProperty;
      expect(prop).toBeDefined();
      expect(prop.characteristics).toContain('symmetric');
      expect(prop.characteristics).toHaveLength(1);
    });

    it('detects owl:ReflexiveProperty', () => {
      const ontology = parseTurtle(characteristicsTurtle);
      const prop = ontology.objectProperties.get(`${EX}knows`) as ObjectProperty;
      expect(prop).toBeDefined();
      expect(prop.characteristics).toContain('reflexive');
      expect(prop.characteristics).toHaveLength(1);
    });

    it('detects owl:FunctionalProperty', () => {
      const ontology = parseTurtle(characteristicsTurtle);
      const prop = ontology.objectProperties.get(`${EX}hasBiologicalMother`) as ObjectProperty;
      expect(prop).toBeDefined();
      expect(prop.characteristics).toContain('functional');
      expect(prop.characteristics).toHaveLength(1);
    });

    it('detects owl:InverseFunctionalProperty', () => {
      const ontology = parseTurtle(characteristicsTurtle);
      const prop = ontology.objectProperties.get(`${EX}hasSSN`) as ObjectProperty;
      expect(prop).toBeDefined();
      expect(prop.characteristics).toContain('inverseFunctional');
      expect(prop.characteristics).toHaveLength(1);
    });
  });

  describe('multiple characteristics', () => {
    it('detects two characteristics on one property', () => {
      const ontology = parseTurtle(characteristicsTurtle);
      const prop = ontology.objectProperties.get(`${EX}hasUniqueAncestor`) as ObjectProperty;
      expect(prop).toBeDefined();
      expect(prop.characteristics).toHaveLength(2);
      expect(prop.characteristics).toContain('transitive');
      expect(prop.characteristics).toContain('functional');
    });

    it('detects all five characteristics on one property', () => {
      const ontology = parseTurtle(characteristicsTurtle);
      const prop = ontology.objectProperties.get(`${EX}hasAll`) as ObjectProperty;
      expect(prop).toBeDefined();
      expect(prop.characteristics).toHaveLength(5);
      expect(prop.characteristics).toContain('transitive');
      expect(prop.characteristics).toContain('symmetric');
      expect(prop.characteristics).toContain('reflexive');
      expect(prop.characteristics).toContain('functional');
      expect(prop.characteristics).toContain('inverseFunctional');
    });
  });

  describe('no characteristics', () => {
    it('returns empty characteristics array for plain property', () => {
      const ontology = parseTurtle(characteristicsTurtle);
      const prop = ontology.objectProperties.get(`${EX}worksFor`) as ObjectProperty;
      expect(prop).toBeDefined();
      expect(prop.characteristics).toEqual([]);
    });
  });

  describe('existing ontology compatibility', () => {
    it('properties parsed from people.ttl have empty characteristics array', () => {
      const peopleTurtle = readFileSync(
        resolve(__dirname, '../../resources/sample-ontologies/people.ttl'),
        'utf-8',
      );
      const ontology = parseTurtle(peopleTurtle);
      for (const prop of ontology.objectProperties.values()) {
        expect(prop.characteristics).toBeDefined();
        expect(Array.isArray(prop.characteristics)).toBe(true);
        expect(prop.characteristics).toEqual([]);
      }
    });
  });

  describe('inline TTL snippets', () => {
    it('handles property declared as ObjectProperty and characteristic in separate triples', () => {
      const ttl = `
        @prefix owl: <http://www.w3.org/2002/07/owl#> .
        @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
        @prefix ex: <http://ex.org/> .
        ex:p rdf:type owl:ObjectProperty .
        ex:p rdf:type owl:SymmetricProperty .
      `;
      const ontology = parseTurtle(ttl);
      const prop = ontology.objectProperties.get('http://ex.org/p') as ObjectProperty;
      expect(prop).toBeDefined();
      expect(prop.characteristics).toContain('symmetric');
    });

    it('handles characteristic declared before ObjectProperty type triple', () => {
      const ttl = `
        @prefix owl: <http://www.w3.org/2002/07/owl#> .
        @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
        @prefix ex: <http://ex.org/> .
        ex:p rdf:type owl:TransitiveProperty .
        ex:p rdf:type owl:ObjectProperty .
      `;
      const ontology = parseTurtle(ttl);
      const prop = ontology.objectProperties.get('http://ex.org/p') as ObjectProperty;
      expect(prop).toBeDefined();
      expect(prop.characteristics).toContain('transitive');
    });

    it('does not add characteristic tokens to non-object-properties', () => {
      const ttl = `
        @prefix owl: <http://www.w3.org/2002/07/owl#> .
        @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
        @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
        @prefix ex: <http://ex.org/> .
        ex:dp rdf:type owl:DatatypeProperty ;
          rdfs:range xsd:string .
      `;
      const ontology = parseTurtle(ttl);
      // Should not appear as an object property
      expect(ontology.objectProperties.has('http://ex.org/dp')).toBe(false);
    });

    it('does not emit unsupported warning for characteristic type triples', () => {
      const ttl = `
        @prefix owl: <http://www.w3.org/2002/07/owl#> .
        @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
        @prefix ex: <http://ex.org/> .
        ex:p rdf:type owl:ObjectProperty ;
          rdf:type owl:TransitiveProperty ;
          rdf:type owl:SymmetricProperty .
      `;
      const { warnings } = parseTurtleWithWarnings(ttl);
      const unsupportedForP = warnings.filter(
        (w) => w.message.includes('ex.org/p') && w.message.toLowerCase().includes('unsupported'),
      );
      expect(unsupportedForP).toEqual([]);
    });
  });
});
