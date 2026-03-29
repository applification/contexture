import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { parseTurtle, parseTurtleWithWarnings } from '@renderer/model/parse';
import { serializeToTurtle } from '@renderer/model/serialize';

const FIXTURES_DIR = resolve(__dirname, '../../resources/sample-ontologies');

const HEALTH = 'http://example.org/healthcare#';
const ECOM = 'http://example.org/ecommerce#';
const EDGE = 'http://example.org/edge-cases#';
const UNI = 'http://example.org/university#';

function loadFixture(name: string): string {
  return readFileSync(resolve(FIXTURES_DIR, name), 'utf-8');
}

// ---- Generic: every .ttl fixture should parse and round-trip ----

describe('all fixtures: parse and round-trip', () => {
  const files = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.ttl'));

  for (const file of files) {
    describe(file, () => {
      const turtle = loadFixture(file);

      it('parses without errors', () => {
        const { warnings } = parseTurtleWithWarnings(turtle);
        const errors = warnings.filter((w) => w.severity === 'error');
        expect(errors).toEqual([]);
      });

      it('round-trips: class count preserved', () => {
        const original = parseTurtle(turtle);
        const serialized = serializeToTurtle(original);
        const reparsed = parseTurtle(serialized);
        expect(reparsed.classes.size).toBe(original.classes.size);
      });

      it('round-trips: object property count preserved', () => {
        const original = parseTurtle(turtle);
        const serialized = serializeToTurtle(original);
        const reparsed = parseTurtle(serialized);
        expect(reparsed.objectProperties.size).toBe(original.objectProperties.size);
      });

      it('round-trips: datatype property count preserved', () => {
        const original = parseTurtle(turtle);
        const serialized = serializeToTurtle(original);
        const reparsed = parseTurtle(serialized);
        expect(reparsed.datatypeProperties.size).toBe(original.datatypeProperties.size);
      });
    });
  }
});

// ---- Healthcare fixture ----

describe('healthcare.ttl', () => {
  const turtle = loadFixture('healthcare.ttl');

  it('parses 16 named classes (plus blank nodes from restrictions)', () => {
    const o = parseTurtle(turtle);
    const namedClasses = [...o.classes.keys()].filter((k) => k.startsWith('http'));
    expect(namedClasses.length).toBe(16);
  });

  it('has deep hierarchy: Surgeon -> Physician -> HealthcareProvider -> Person -> LivingEntity', () => {
    const o = parseTurtle(turtle);
    expect(o.classes.get(`${HEALTH}Surgeon`)!.subClassOf).toContain(`${HEALTH}Physician`);
    expect(o.classes.get(`${HEALTH}Physician`)!.subClassOf).toEqual([
      `${HEALTH}HealthcareProvider`,
    ]);
    expect(o.classes.get(`${HEALTH}HealthcareProvider`)!.subClassOf).toEqual([`${HEALTH}Person`]);
    expect(o.classes.get(`${HEALTH}Person`)!.subClassOf).toEqual([`${HEALTH}LivingEntity`]);
  });

  it('parses disjointWith between Person and Animal', () => {
    const animal = o().classes.get(`${HEALTH}Animal`)!;
    expect(animal.disjointWith).toContain(`${HEALTH}Person`);
  });

  it('parses inverse properties treats/treatedBy', () => {
    const treats = o().objectProperties.get(`${HEALTH}treats`)!;
    expect(treats.inverseOf).toBe(`${HEALTH}treatedBy`);
  });

  it('parses varied XSD datatypes', () => {
    const o2 = parseTurtle(turtle);
    expect(o2.datatypeProperties.get(`${HEALTH}dosageMg`)!.range).toBe(
      'http://www.w3.org/2001/XMLSchema#float',
    );
    expect(o2.datatypeProperties.get(`${HEALTH}isActive`)!.range).toBe(
      'http://www.w3.org/2001/XMLSchema#boolean',
    );
    expect(o2.datatypeProperties.get(`${HEALTH}bedCount`)!.range).toBe(
      'http://www.w3.org/2001/XMLSchema#nonNegativeInteger',
    );
  });

  function o() {
    return parseTurtle(turtle);
  }
});

// ---- E-commerce fixture ----

describe('ecommerce.ttl', () => {
  const turtle = loadFixture('ecommerce.ttl');

  it('parses 14 classes', () => {
    const o = parseTurtle(turtle);
    expect(o.classes.size).toBe(14);
  });

  it('parses 11 object properties', () => {
    const o = parseTurtle(turtle);
    expect(o.objectProperties.size).toBe(11);
  });

  it('parses 12 datatype properties', () => {
    const o = parseTurtle(turtle);
    expect(o.datatypeProperties.size).toBe(12);
  });

  it('has Product hierarchy with disjoint physical/digital', () => {
    const o = parseTurtle(turtle);
    const digital = o.classes.get(`${ECOM}DigitalProduct`)!;
    expect(digital.subClassOf).toContain(`${ECOM}Product`);
    expect(digital.disjointWith).toContain(`${ECOM}PhysicalProduct`);
  });

  it('parses Subscription as subclass of DigitalProduct', () => {
    const o = parseTurtle(turtle);
    expect(o.classes.get(`${ECOM}Subscription`)!.subClassOf).toContain(`${ECOM}DigitalProduct`);
  });

  it('parses decimal, double, anyURI, positiveInteger XSD types', () => {
    const o = parseTurtle(turtle);
    const XSD = 'http://www.w3.org/2001/XMLSchema#';
    expect(o.datatypeProperties.get(`${ECOM}price`)!.range).toBe(`${XSD}decimal`);
    expect(o.datatypeProperties.get(`${ECOM}weight`)!.range).toBe(`${XSD}double`);
    expect(o.datatypeProperties.get(`${ECOM}downloadUrl`)!.range).toBe(`${XSD}anyURI`);
    expect(o.datatypeProperties.get(`${ECOM}quantity`)!.range).toBe(`${XSD}positiveInteger`);
  });
});

// ---- Edge cases fixture ----

describe('edge-cases.ttl', () => {
  const turtle = loadFixture('edge-cases.ttl');

  it('parses class with no label', () => {
    const o = parseTurtle(turtle);
    const cls = o.classes.get(`${EDGE}UnlabeledClass`)!;
    expect(cls).toBeDefined();
    expect(cls.label).toBeUndefined();
  });

  it('parses unicode label', () => {
    const o = parseTurtle(turtle);
    const cls = o.classes.get(`${EDGE}UnicodeClass`)!;
    expect(cls.label).toContain('accents');
  });

  it('parses very long label', () => {
    const o = parseTurtle(turtle);
    const cls = o.classes.get(`${EDGE}VerboseClass`)!;
    expect(cls.label!.length).toBeGreaterThan(50);
  });

  it('parses 6-level deep hierarchy', () => {
    const o = parseTurtle(turtle);
    expect(o.classes.get(`${EDGE}Level5`)!.subClassOf).toEqual([`${EDGE}Level4`]);
    expect(o.classes.get(`${EDGE}Level4`)!.subClassOf).toEqual([`${EDGE}Level3`]);
    expect(o.classes.get(`${EDGE}Level3`)!.subClassOf).toEqual([`${EDGE}Level2`]);
  });

  it('parses diamond multiple inheritance', () => {
    const o = parseTurtle(turtle);
    const bottom = o.classes.get(`${EDGE}DiamondBottom`)!;
    expect(bottom.subClassOf).toContain(`${EDGE}DiamondLeft`);
    expect(bottom.subClassOf).toContain(`${EDGE}DiamondRight`);
    expect(bottom.subClassOf.length).toBe(2);
  });

  it('parses self-referencing property', () => {
    const o = parseTurtle(turtle);
    const prop = o.objectProperties.get(`${EDGE}relatesTo`)!;
    expect(prop.domain).toEqual([`${EDGE}SelfRefClass`]);
    expect(prop.range).toEqual([`${EDGE}SelfRefClass`]);
  });

  it('parses property with multiple domains', () => {
    const o = parseTurtle(turtle);
    const prop = o.objectProperties.get(`${EDGE}multiDomainProp`)!;
    expect(prop.domain).toContain(`${EDGE}DomainA`);
    expect(prop.domain).toContain(`${EDGE}DomainB`);
    expect(prop.domain.length).toBe(2);
  });

  it('parses mutual disjointness', () => {
    const o = parseTurtle(turtle);
    const a = o.classes.get(`${EDGE}DisjointA`)!;
    expect(a.disjointWith).toContain(`${EDGE}DisjointB`);
    expect(a.disjointWith).toContain(`${EDGE}DisjointC`);
  });

  it('parses less common XSD types (byte, short, long, time)', () => {
    const o = parseTurtle(turtle);
    const XSD = 'http://www.w3.org/2001/XMLSchema#';
    expect(o.datatypeProperties.get(`${EDGE}byteVal`)!.range).toBe(`${XSD}byte`);
    expect(o.datatypeProperties.get(`${EDGE}shortVal`)!.range).toBe(`${XSD}short`);
    expect(o.datatypeProperties.get(`${EDGE}longVal`)!.range).toBe(`${XSD}long`);
    expect(o.datatypeProperties.get(`${EDGE}durationVal`)!.range).toBe(`${XSD}time`);
  });
});

// ---- Minimal fixture ----

describe('minimal.ttl', () => {
  it('parses exactly 1 class, 0 properties', () => {
    const o = parseTurtle(loadFixture('minimal.ttl'));
    expect(o.classes.size).toBe(1);
    expect(o.objectProperties.size).toBe(0);
    expect(o.datatypeProperties.size).toBe(0);
  });

  it('has correct label and comment', () => {
    const o = parseTurtle(loadFixture('minimal.ttl'));
    const cls = o.classes.get('http://example.org/minimal#Thing')!;
    expect(cls.label).toBe('Thing');
    expect(cls.comment).toBe('The only class in this minimal ontology');
  });
});

// ---- University fixture (performance) ----

describe('university.ttl', () => {
  const turtle = loadFixture('university.ttl');

  it('parses 50+ classes', () => {
    const o = parseTurtle(turtle);
    expect(o.classes.size).toBeGreaterThanOrEqual(50);
  });

  it('parses 16 object properties', () => {
    const o = parseTurtle(turtle);
    expect(o.objectProperties.size).toBe(16);
  });

  it('parses 16 datatype properties', () => {
    const o = parseTurtle(turtle);
    expect(o.datatypeProperties.size).toBe(16);
  });

  it('round-trips all labels', () => {
    const original = parseTurtle(turtle);
    const serialized = serializeToTurtle(original);
    const reparsed = parseTurtle(serialized);

    for (const [uri, cls] of original.classes) {
      expect(reparsed.classes.get(uri)!.label).toBe(cls.label);
    }
  });

  it('parses and round-trips within 500ms', () => {
    const start = performance.now();
    const original = parseTurtle(turtle);
    serializeToTurtle(original);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(500);
  });
});
