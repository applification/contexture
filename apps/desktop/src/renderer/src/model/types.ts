export interface AnnotationProperty {
  uri: string;
  label?: string;
  comment?: string;
  subPropertyOf: string[];
}

export interface OntologyMetadata {
  iri: string;
  versionIRI?: string;
  imports: string[];
  annotations: { property: string; value: string; datatype?: string }[];
}

export interface Ontology {
  prefixes: Map<string, string>;
  classes: Map<string, OntologyClass>;
  objectProperties: Map<string, ObjectProperty>;
  datatypeProperties: Map<string, DatatypeProperty>;
  individuals: Map<string, Individual>;
  annotationProperties: Map<string, AnnotationProperty>;
  ontologyMetadata?: OntologyMetadata;
}

export type RestrictionType =
  | 'someValuesFrom'
  | 'allValuesFrom'
  | 'hasValue'
  | 'minCardinality'
  | 'maxCardinality'
  | 'exactCardinality';

export interface Restriction {
  onProperty: string;
  type: RestrictionType;
  value: string;
}

export interface OntologyClass {
  uri: string;
  label?: string;
  comment?: string;
  subClassOf: string[];
  disjointWith: string[];
  restrictions?: Restriction[];
}

export type OWLCharacteristic =
  | 'transitive'
  | 'symmetric'
  | 'reflexive'
  | 'functional'
  | 'inverseFunctional';

export interface ObjectProperty {
  uri: string;
  label?: string;
  comment?: string;
  domain: string[];
  range: string[];
  minCardinality?: number;
  maxCardinality?: number;
  inverseOf?: string;
  characteristics: OWLCharacteristic[];
}

export interface DatatypeProperty {
  uri: string;
  label?: string;
  comment?: string;
  domain: string[];
  range: string;
  minCardinality?: number;
  maxCardinality?: number;
}

export interface Individual {
  uri: string;
  label?: string;
  comment?: string;
  types: string[];
  objectPropertyAssertions: { property: string; target: string }[];
  dataPropertyAssertions: { property: string; value: string; datatype?: string }[];
}

export function createEmptyOntology(): Ontology {
  return {
    prefixes: new Map([
      ['owl', 'http://www.w3.org/2002/07/owl#'],
      ['rdf', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'],
      ['rdfs', 'http://www.w3.org/2000/01/rdf-schema#'],
      ['xsd', 'http://www.w3.org/2001/XMLSchema#'],
    ]),
    classes: new Map(),
    objectProperties: new Map(),
    datatypeProperties: new Map(),
    individuals: new Map(),
    annotationProperties: new Map(),
  };
}
