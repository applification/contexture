import { Writer, DataFactory } from 'n3';
import type { Ontology } from './types';

const { namedNode, literal } = DataFactory;

const OWL = 'http://www.w3.org/2002/07/owl#';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';

export function serializeToTurtle(ontology: Ontology): string {
  const prefixes: Record<string, string> = {};
  for (const [prefix, iri] of ontology.prefixes) {
    prefixes[prefix] = iri;
  }

  const writer = new Writer({ prefixes });

  // Write classes
  for (const cls of ontology.classes.values()) {
    const subject = namedNode(cls.uri);

    writer.addQuad(subject, namedNode(`${RDF}type`), namedNode(`${OWL}Class`));

    if (cls.label) {
      writer.addQuad(subject, namedNode(`${RDFS}label`), literal(cls.label));
    }
    if (cls.comment) {
      writer.addQuad(subject, namedNode(`${RDFS}comment`), literal(cls.comment));
    }
    for (const parent of cls.subClassOf) {
      writer.addQuad(subject, namedNode(`${RDFS}subClassOf`), namedNode(parent));
    }
    for (const disjoint of cls.disjointWith) {
      writer.addQuad(subject, namedNode(`${OWL}disjointWith`), namedNode(disjoint));
    }
  }

  // Write object properties
  for (const prop of ontology.objectProperties.values()) {
    const subject = namedNode(prop.uri);

    writer.addQuad(subject, namedNode(`${RDF}type`), namedNode(`${OWL}ObjectProperty`));

    if (prop.label) {
      writer.addQuad(subject, namedNode(`${RDFS}label`), literal(prop.label));
    }
    if (prop.comment) {
      writer.addQuad(subject, namedNode(`${RDFS}comment`), literal(prop.comment));
    }
    for (const d of prop.domain) {
      writer.addQuad(subject, namedNode(`${RDFS}domain`), namedNode(d));
    }
    for (const r of prop.range) {
      writer.addQuad(subject, namedNode(`${RDFS}range`), namedNode(r));
    }
    if (prop.inverseOf) {
      writer.addQuad(subject, namedNode(`${OWL}inverseOf`), namedNode(prop.inverseOf));
    }
  }

  // Write datatype properties
  for (const prop of ontology.datatypeProperties.values()) {
    const subject = namedNode(prop.uri);

    writer.addQuad(subject, namedNode(`${RDF}type`), namedNode(`${OWL}DatatypeProperty`));

    if (prop.label) {
      writer.addQuad(subject, namedNode(`${RDFS}label`), literal(prop.label));
    }
    if (prop.comment) {
      writer.addQuad(subject, namedNode(`${RDFS}comment`), literal(prop.comment));
    }
    for (const d of prop.domain) {
      writer.addQuad(subject, namedNode(`${RDFS}domain`), namedNode(d));
    }
    writer.addQuad(subject, namedNode(`${RDFS}range`), namedNode(prop.range));
  }

  let result = '';
  writer.end((_error, output) => {
    result = output;
  });
  return result;
}
