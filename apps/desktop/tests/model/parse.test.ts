import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseTurtle, parseTurtleWithWarnings } from '@renderer/model/parse';
import type {
  AnnotationProperty,
  DatatypeProperty,
  Individual,
  ObjectProperty,
  OntologyClass,
  OntologyMetadata,
} from '@renderer/model/types';
import { describe, expect, it } from 'vitest';

const EX = 'http://example.org/ontology#';
const XSD = 'http://www.w3.org/2001/XMLSchema#';

const peopleTurtle = readFileSync(
  resolve(__dirname, '../../resources/sample-ontologies/people.ttl'),
  'utf-8',
);

const individualsTurtle = readFileSync(
  resolve(__dirname, '../../resources/sample-ontologies/individuals.ttl'),
  'utf-8',
);

const annotationsTurtle = readFileSync(
  resolve(__dirname, '../../resources/sample-ontologies/annotations.ttl'),
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

describe('parseTurtle — individuals', () => {
  it('parses individuals from fixture', () => {
    const ontology = parseTurtle(individualsTurtle);
    expect(ontology.individuals.size).toBe(4);
    expect(ontology.individuals.has(`${EX}john`)).toBe(true);
    expect(ontology.individuals.has(`${EX}jane`)).toBe(true);
    expect(ontology.individuals.has(`${EX}acmeCorp`)).toBe(true);
    expect(ontology.individuals.has(`${EX}bob`)).toBe(true);
  });

  it('parses individual labels and comments', () => {
    const ontology = parseTurtle(individualsTurtle);
    const john = ontology.individuals.get(`${EX}john`) as Individual;
    expect(john.label).toBe('John Smith');
    expect(john.comment).toBe('An example employee');
  });

  it('parses type assertions', () => {
    const ontology = parseTurtle(individualsTurtle);
    const john = ontology.individuals.get(`${EX}john`) as Individual;
    expect(john.types).toContain(`${EX}Employee`);
  });

  it('parses multiple type assertions', () => {
    const ontology = parseTurtle(individualsTurtle);
    const bob = ontology.individuals.get(`${EX}bob`) as Individual;
    expect(bob.types).toContain(`${EX}Person`);
    expect(bob.types).toContain(`${EX}Employee`);
  });

  it('parses data property assertions', () => {
    const ontology = parseTurtle(individualsTurtle);
    const john = ontology.individuals.get(`${EX}john`) as Individual;
    const nameAssertion = john.dataPropertyAssertions.find((a) => a.property === `${EX}name`);
    expect(nameAssertion).toBeDefined();
    expect(nameAssertion?.value).toBe('John Smith');
  });

  it('parses object property assertions', () => {
    const ontology = parseTurtle(individualsTurtle);
    const john = ontology.individuals.get(`${EX}john`) as Individual;
    const worksFor = john.objectPropertyAssertions.find((a) => a.property === `${EX}worksFor`);
    expect(worksFor).toBeDefined();
    expect(worksFor?.target).toBe(`${EX}acmeCorp`);
  });

  it('parses classes alongside individuals', () => {
    const ontology = parseTurtle(individualsTurtle);
    expect(ontology.classes.size).toBe(3);
    expect(ontology.individuals.size).toBe(4);
  });

  it('does not add NamedIndividual to unsupported warnings', () => {
    const { warnings } = parseTurtleWithWarnings(individualsTurtle);
    const unsupportedWarning = warnings.find(
      (w) => w.message.includes('Unsupported') && w.message.includes('NamedIndividual'),
    );
    expect(unsupportedWarning).toBeUndefined();
  });

  it('handles OWL 2 punning — same URI as class and individual', () => {
    const turtle = `
      @prefix owl: <http://www.w3.org/2002/07/owl#> .
      @prefix ex: <http://example.org/> .
      ex:Foo a owl:Class .
      ex:Foo a owl:NamedIndividual .
    `;
    const ontology = parseTurtle(turtle);
    expect(ontology.classes.has('http://example.org/Foo')).toBe(true);
    expect(ontology.individuals.has('http://example.org/Foo')).toBe(true);
  });

  it('skips blank node individuals with warning', () => {
    const turtle = `
      @prefix owl: <http://www.w3.org/2002/07/owl#> .
      _:b0 a owl:NamedIndividual .
    `;
    const { ontology, warnings } = parseTurtleWithWarnings(turtle);
    expect(ontology.individuals.size).toBe(0);
    expect(warnings.some((w) => w.message.includes('Blank node individual'))).toBe(true);
  });

  it('handles individual with no type assertion', () => {
    const turtle = `
      @prefix owl: <http://www.w3.org/2002/07/owl#> .
      @prefix ex: <http://example.org/> .
      ex:orphan a owl:NamedIndividual .
    `;
    const ontology = parseTurtle(turtle);
    const orphan = ontology.individuals.get('http://example.org/orphan') as Individual;
    expect(orphan).toBeDefined();
    expect(orphan.types).toEqual([]);
  });

  it('handles individual referencing undeclared class', () => {
    const turtle = `
      @prefix owl: <http://www.w3.org/2002/07/owl#> .
      @prefix ex: <http://example.org/> .
      ex:thing a owl:NamedIndividual, ex:UndeclaredClass .
    `;
    const ontology = parseTurtle(turtle);
    const thing = ontology.individuals.get('http://example.org/thing') as Individual;
    expect(thing.types).toContain('http://example.org/UndeclaredClass');
  });
});

// ---- owl:AnnotationProperty ----

describe('parseTurtle — annotation properties', () => {
  it('parses annotation property declarations from fixture', () => {
    const ontology = parseTurtle(annotationsTurtle);
    expect(ontology.annotationProperties.size).toBeGreaterThanOrEqual(5);
    expect(ontology.annotationProperties.has(`${EX}authorName`)).toBe(true);
    expect(ontology.annotationProperties.has(`${EX}reviewStatus`)).toBe(true);
    expect(ontology.annotationProperties.has(`${EX}deprecated`)).toBe(true);
    expect(ontology.annotationProperties.has(`${EX}seeAlso`)).toBe(true);
    expect(ontology.annotationProperties.has(`${EX}editorialNote`)).toBe(true);
  });

  it('parses annotation property labels and comments', () => {
    const ontology = parseTurtle(annotationsTurtle);
    const authorName = ontology.annotationProperties.get(`${EX}authorName`) as AnnotationProperty;
    expect(authorName.label).toBe('author name');
    expect(authorName.comment).toBe('The name of the author of this entity');
  });

  it('parses annotation property with no comment', () => {
    const ontology = parseTurtle(annotationsTurtle);
    const reviewStatus = ontology.annotationProperties.get(
      `${EX}reviewStatus`,
    ) as AnnotationProperty;
    expect(reviewStatus.label).toBe('review status');
    expect(reviewStatus.comment).toBeUndefined();
  });

  it('parses subPropertyOf on annotation properties', () => {
    const ontology = parseTurtle(annotationsTurtle);
    const techNote = ontology.annotationProperties.get(`${EX}technicalNote`) as AnnotationProperty;
    expect(techNote).toBeDefined();
    expect(techNote.subPropertyOf).toContain(`${EX}editorialNote`);
  });

  it('handles re-declared standard annotation properties (rdfs:label, rdfs:comment)', () => {
    const ontology = parseTurtle(annotationsTurtle);
    const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
    expect(ontology.annotationProperties.has(`${RDFS}label`)).toBe(true);
    expect(ontology.annotationProperties.has(`${RDFS}comment`)).toBe(true);
  });

  it('handles Dublin Core terms declared as annotation properties', () => {
    const ontology = parseTurtle(annotationsTurtle);
    const DC = 'http://purl.org/dc/elements/1.1/';
    expect(ontology.annotationProperties.has(`${DC}creator`)).toBe(true);
    expect(ontology.annotationProperties.has(`${DC}title`)).toBe(true);
  });

  it('does not add AnnotationProperty to unsupported warnings', () => {
    const { warnings } = parseTurtleWithWarnings(annotationsTurtle);
    const unsupportedWarning = warnings.find(
      (w) => w.message.includes('Unsupported') && w.message.includes('AnnotationProperty'),
    );
    expect(unsupportedWarning).toBeUndefined();
  });

  it('still parses classes and properties alongside annotation properties', () => {
    const ontology = parseTurtle(annotationsTurtle);
    expect(ontology.classes.size).toBe(3);
    expect(ontology.objectProperties.size).toBe(1);
    expect(ontology.datatypeProperties.size).toBe(1);
  });

  it('handles minimal annotation property declaration', () => {
    const turtle = `
      @prefix owl: <http://www.w3.org/2002/07/owl#> .
      @prefix ex: <http://example.org/> .
      ex:myAnnotation a owl:AnnotationProperty .
    `;
    const ontology = parseTurtle(turtle);
    expect(ontology.annotationProperties.size).toBe(1);
    const prop = ontology.annotationProperties.get(
      'http://example.org/myAnnotation',
    ) as AnnotationProperty;
    expect(prop.uri).toBe('http://example.org/myAnnotation');
    expect(prop.label).toBeUndefined();
  });

  it('skips blank node annotation properties with warning', () => {
    const turtle = `
      @prefix owl: <http://www.w3.org/2002/07/owl#> .
      _:b0 a owl:AnnotationProperty .
    `;
    const { ontology, warnings } = parseTurtleWithWarnings(turtle);
    expect(ontology.annotationProperties.size).toBe(0);
    expect(warnings.some((w) => w.message.includes('Blank node annotation property'))).toBe(true);
  });
});

// ---- owl:Ontology metadata ----

describe('parseTurtle — ontology metadata', () => {
  it('parses ontology IRI', () => {
    const ontology = parseTurtle(annotationsTurtle);
    expect(ontology.ontologyMetadata).toBeDefined();
    expect(ontology.ontologyMetadata?.iri).toBe('http://example.org/ontology');
  });

  it('parses versionIRI', () => {
    const ontology = parseTurtle(annotationsTurtle);
    expect(ontology.ontologyMetadata?.versionIRI).toBe('http://example.org/ontology/1.0');
  });

  it('parses owl:imports', () => {
    const ontology = parseTurtle(annotationsTurtle);
    expect(ontology.ontologyMetadata?.imports).toContain('http://purl.org/dc/elements/1.1/');
  });

  it('parses Dublin Core metadata (dc:title, dc:creator, dc:description)', () => {
    const ontology = parseTurtle(annotationsTurtle);
    const meta = ontology.ontologyMetadata as OntologyMetadata;
    expect(meta.annotations).toBeDefined();

    const DC = 'http://purl.org/dc/elements/1.1/';
    const title = meta.annotations.find((a) => a.property === `${DC}title`);
    expect(title?.value).toBe('Example Annotation Ontology');

    const creator = meta.annotations.find((a) => a.property === `${DC}creator`);
    expect(creator?.value).toBe('QA Engineer');

    const description = meta.annotations.find((a) => a.property === `${DC}description`);
    expect(description?.value).toBe(
      'A test ontology exercising owl:AnnotationProperty and owl:Ontology metadata',
    );
  });

  it('parses rdfs:comment on ontology', () => {
    const ontology = parseTurtle(annotationsTurtle);
    const meta = ontology.ontologyMetadata as OntologyMetadata;
    const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
    const comment = meta.annotations.find((a) => a.property === `${RDFS}comment`);
    expect(comment?.value).toBe('Top-level ontology comment');
  });

  it('parses typed literal annotations (dcterms:created as xsd:date)', () => {
    const ontology = parseTurtle(annotationsTurtle);
    const meta = ontology.ontologyMetadata as OntologyMetadata;
    const DCTERMS = 'http://purl.org/dc/terms/';
    const created = meta.annotations.find((a) => a.property === `${DCTERMS}created`);
    expect(created?.value).toBe('2026-03-30');
    expect(created?.datatype).toBe(`${XSD}date`);
  });

  it('does not add Ontology to unsupported warnings', () => {
    const { warnings } = parseTurtleWithWarnings(annotationsTurtle);
    const unsupportedWarning = warnings.find(
      (w) => w.message.includes('Unsupported') && w.message.includes('Ontology'),
    );
    expect(unsupportedWarning).toBeUndefined();
  });

  it('handles ontology with no metadata', () => {
    const turtle = `
      @prefix owl: <http://www.w3.org/2002/07/owl#> .
      @prefix ex: <http://example.org/> .
      ex:MyOntology a owl:Ontology .
    `;
    const ontology = parseTurtle(turtle);
    expect(ontology.ontologyMetadata).toBeDefined();
    expect(ontology.ontologyMetadata?.iri).toBe('http://example.org/MyOntology');
    expect(ontology.ontologyMetadata?.versionIRI).toBeUndefined();
    expect(ontology.ontologyMetadata?.imports).toEqual([]);
    expect(ontology.ontologyMetadata?.annotations).toEqual([]);
  });

  it('handles multiple owl:imports', () => {
    const turtle = `
      @prefix owl: <http://www.w3.org/2002/07/owl#> .
      <http://example.org/ont> a owl:Ontology ;
          owl:imports <http://example.org/base> ;
          owl:imports <http://example.org/ext> .
    `;
    const ontology = parseTurtle(turtle);
    expect(ontology.ontologyMetadata?.imports).toHaveLength(2);
    expect(ontology.ontologyMetadata?.imports).toContain('http://example.org/base');
    expect(ontology.ontologyMetadata?.imports).toContain('http://example.org/ext');
  });

  it('returns undefined ontologyMetadata when no owl:Ontology declaration exists', () => {
    const turtle = `
      @prefix owl: <http://www.w3.org/2002/07/owl#> .
      @prefix ex: <http://example.org/> .
      ex:Foo a owl:Class .
    `;
    const ontology = parseTurtle(turtle);
    expect(ontology.ontologyMetadata).toBeUndefined();
  });
});
