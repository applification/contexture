import { DataFactory, Writer } from 'n3';
import type { Ontology } from './types';

const { namedNode, literal } = DataFactory;

const OWL = 'http://www.w3.org/2002/07/owl#';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';

/** Sort map values by URI for deterministic output. */
function sortedByUri<T extends { uri: string }>(map: Map<string, T>): T[] {
  return [...map.values()].sort((a, b) => a.uri.localeCompare(b.uri));
}

export function serializeToTurtle(ontology: Ontology): string {
  // Sort prefixes alphabetically by prefix name
  const prefixes: Record<string, string> = {};
  for (const key of [...ontology.prefixes.keys()].sort()) {
    prefixes[key] = ontology.prefixes.get(key)!;
  }

  const writer = new Writer({ prefixes });

  // Write ontology metadata
  if (ontology.ontologyMetadata) {
    const subject = namedNode(ontology.ontologyMetadata.iri);
    writer.addQuad(subject, namedNode(`${RDF}type`), namedNode(`${OWL}Ontology`));
    if (ontology.ontologyMetadata.versionIRI) {
      writer.addQuad(
        subject,
        namedNode(`${OWL}versionIRI`),
        namedNode(ontology.ontologyMetadata.versionIRI),
      );
    }
    for (const imp of [...ontology.ontologyMetadata.imports].sort()) {
      writer.addQuad(subject, namedNode(`${OWL}imports`), namedNode(imp));
    }
    for (const ann of [...ontology.ontologyMetadata.annotations].sort((a, b) =>
      a.property.localeCompare(b.property) || a.value.localeCompare(b.value),
    )) {
      if (ann.datatype) {
        writer.addQuad(
          subject,
          namedNode(ann.property),
          literal(ann.value, namedNode(ann.datatype)),
        );
      } else {
        writer.addQuad(subject, namedNode(ann.property), literal(ann.value));
      }
    }
  }

  // Write classes (sorted by URI)
  for (const cls of sortedByUri(ontology.classes)) {
    const subject = namedNode(cls.uri);

    writer.addQuad(subject, namedNode(`${RDF}type`), namedNode(`${OWL}Class`));

    if (cls.label) {
      writer.addQuad(subject, namedNode(`${RDFS}label`), literal(cls.label));
    }
    if (cls.comment) {
      writer.addQuad(subject, namedNode(`${RDFS}comment`), literal(cls.comment));
    }
    for (const parent of [...cls.subClassOf].sort()) {
      writer.addQuad(subject, namedNode(`${RDFS}subClassOf`), namedNode(parent));
    }
    for (const disjoint of [...cls.disjointWith].sort()) {
      writer.addQuad(subject, namedNode(`${OWL}disjointWith`), namedNode(disjoint));
    }
  }

  // Write object properties (sorted by URI)
  for (const prop of sortedByUri(ontology.objectProperties)) {
    const subject = namedNode(prop.uri);

    writer.addQuad(subject, namedNode(`${RDF}type`), namedNode(`${OWL}ObjectProperty`));

    if (prop.label) {
      writer.addQuad(subject, namedNode(`${RDFS}label`), literal(prop.label));
    }
    if (prop.comment) {
      writer.addQuad(subject, namedNode(`${RDFS}comment`), literal(prop.comment));
    }
    for (const d of [...prop.domain].sort()) {
      writer.addQuad(subject, namedNode(`${RDFS}domain`), namedNode(d));
    }
    for (const r of [...prop.range].sort()) {
      writer.addQuad(subject, namedNode(`${RDFS}range`), namedNode(r));
    }
    if (prop.inverseOf) {
      writer.addQuad(subject, namedNode(`${OWL}inverseOf`), namedNode(prop.inverseOf));
    }
  }

  // Write datatype properties (sorted by URI)
  for (const prop of sortedByUri(ontology.datatypeProperties)) {
    const subject = namedNode(prop.uri);

    writer.addQuad(subject, namedNode(`${RDF}type`), namedNode(`${OWL}DatatypeProperty`));

    if (prop.label) {
      writer.addQuad(subject, namedNode(`${RDFS}label`), literal(prop.label));
    }
    if (prop.comment) {
      writer.addQuad(subject, namedNode(`${RDFS}comment`), literal(prop.comment));
    }
    for (const d of [...prop.domain].sort()) {
      writer.addQuad(subject, namedNode(`${RDFS}domain`), namedNode(d));
    }
    writer.addQuad(subject, namedNode(`${RDFS}range`), namedNode(prop.range));
  }

  // Write annotation properties (sorted by URI)
  for (const prop of sortedByUri(ontology.annotationProperties ?? new Map())) {
    const subject = namedNode(prop.uri);
    writer.addQuad(subject, namedNode(`${RDF}type`), namedNode(`${OWL}AnnotationProperty`));
    if (prop.label) {
      writer.addQuad(subject, namedNode(`${RDFS}label`), literal(prop.label));
    }
    if (prop.comment) {
      writer.addQuad(subject, namedNode(`${RDFS}comment`), literal(prop.comment));
    }
    for (const parent of [...prop.subPropertyOf].sort()) {
      writer.addQuad(subject, namedNode(`${RDFS}subPropertyOf`), namedNode(parent));
    }
  }

  // Write individuals (sorted by URI)
  for (const ind of sortedByUri(ontology.individuals)) {
    const subject = namedNode(ind.uri);

    writer.addQuad(subject, namedNode(`${RDF}type`), namedNode(`${OWL}NamedIndividual`));

    for (const typeUri of [...ind.types].sort()) {
      writer.addQuad(subject, namedNode(`${RDF}type`), namedNode(typeUri));
    }
    if (ind.label) {
      writer.addQuad(subject, namedNode(`${RDFS}label`), literal(ind.label));
    }
    if (ind.comment) {
      writer.addQuad(subject, namedNode(`${RDFS}comment`), literal(ind.comment));
    }
    for (const assertion of [...ind.objectPropertyAssertions].sort((a, b) =>
      a.property.localeCompare(b.property) || a.target.localeCompare(b.target),
    )) {
      writer.addQuad(subject, namedNode(assertion.property), namedNode(assertion.target));
    }
    for (const assertion of [...ind.dataPropertyAssertions].sort((a, b) =>
      a.property.localeCompare(b.property) || a.value.localeCompare(b.value),
    )) {
      if (assertion.datatype) {
        writer.addQuad(
          subject,
          namedNode(assertion.property),
          literal(assertion.value, namedNode(assertion.datatype)),
        );
      } else {
        writer.addQuad(subject, namedNode(assertion.property), literal(assertion.value));
      }
    }
  }

  let result = '';
  writer.end((_error, output) => {
    result = output;
  });
  return result;
}
