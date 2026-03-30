import type { ClassNode, IndividualNode } from '@renderer/model/reactflow';
import { ontologyToReactFlowElements } from '@renderer/model/reactflow';
import type { Ontology } from '@renderer/model/types';
import { createEmptyOntology } from '@renderer/model/types';
import { describe, expect, it } from 'vitest';

function buildOntology(): Ontology {
  const ont = createEmptyOntology();
  ont.classes.set('http://ex/Person', {
    uri: 'http://ex/Person',
    label: 'Person',
    subClassOf: [],
    disjointWith: [],
  });
  ont.classes.set('http://ex/Employee', {
    uri: 'http://ex/Employee',
    label: 'Employee',
    subClassOf: ['http://ex/Person'],
    disjointWith: ['http://ex/Robot'],
  });
  ont.classes.set('http://ex/Robot', {
    uri: 'http://ex/Robot',
    subClassOf: [],
    disjointWith: [],
  });
  ont.objectProperties.set('http://ex/worksAt', {
    uri: 'http://ex/worksAt',
    label: 'works at',
    domain: ['http://ex/Employee'],
    range: ['http://ex/Person'],
  });
  ont.datatypeProperties.set('http://ex/name', {
    uri: 'http://ex/name',
    label: 'name',
    domain: ['http://ex/Person'],
    range: 'http://www.w3.org/2001/XMLSchema#string',
  });
  return ont;
}

describe('ontologyToReactFlowElements', () => {
  it('returns empty elements for empty ontology', () => {
    const result = ontologyToReactFlowElements(createEmptyOntology());
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  it('creates nodes for each class', () => {
    const result = ontologyToReactFlowElements(buildOntology());
    expect(result.nodes).toHaveLength(3);
    expect(result.nodes.every((n) => n.type === 'class')).toBe(true);
  });

  it('sets node data correctly', () => {
    const result = ontologyToReactFlowElements(buildOntology());
    const personNode = result.nodes.find((n) => n.id === 'http://ex/Person') as ClassNode;
    expect(personNode.data.label).toBe('Person');
    expect(personNode.data.uri).toBe('http://ex/Person');
  });

  it('attaches datatype properties to class nodes', () => {
    const result = ontologyToReactFlowElements(buildOntology());
    const personNode = result.nodes.find((n) => n.id === 'http://ex/Person') as ClassNode;
    expect(personNode.data.datatypeProperties).toHaveLength(1);
    expect(personNode.data.datatypeProperties[0].label).toBe('name');
  });

  it('uses localName when label missing', () => {
    const result = ontologyToReactFlowElements(buildOntology());
    const robotNode = result.nodes.find((n) => n.id === 'http://ex/Robot') as ClassNode;
    expect(robotNode.data.label).toBe('Robot');
  });

  it('creates subClassOf edges', () => {
    const result = ontologyToReactFlowElements(buildOntology());
    const subclassEdges = result.edges.filter((e) => e.type === 'subClassOf');
    expect(subclassEdges).toHaveLength(1);
    expect(subclassEdges[0].source).toBe('http://ex/Employee');
    expect(subclassEdges[0].target).toBe('http://ex/Person');
  });

  it('creates disjointWith edges', () => {
    const result = ontologyToReactFlowElements(buildOntology());
    const disjointEdges = result.edges.filter((e) => e.type === 'disjointWith');
    expect(disjointEdges).toHaveLength(1);
  });

  it('creates object property edges', () => {
    const result = ontologyToReactFlowElements(buildOntology());
    const objEdges = result.edges.filter((e) => e.type === 'objectProperty');
    expect(objEdges).toHaveLength(1);
    expect(objEdges[0].source).toBe('http://ex/Employee');
    expect(objEdges[0].target).toBe('http://ex/Person');
    expect((objEdges[0].data as Record<string, unknown>).label).toBe('works at');
  });

  it('creates multiple edges for multi-domain/range properties', () => {
    const ont = createEmptyOntology();
    ont.classes.set('http://ex/A', { uri: 'http://ex/A', subClassOf: [], disjointWith: [] });
    ont.classes.set('http://ex/B', { uri: 'http://ex/B', subClassOf: [], disjointWith: [] });
    ont.classes.set('http://ex/C', { uri: 'http://ex/C', subClassOf: [], disjointWith: [] });
    ont.objectProperties.set('http://ex/rel', {
      uri: 'http://ex/rel',
      domain: ['http://ex/A', 'http://ex/B'],
      range: ['http://ex/C'],
    });
    const result = ontologyToReactFlowElements(ont);
    const objEdges = result.edges.filter((e) => e.type === 'objectProperty');
    expect(objEdges).toHaveLength(2);
  });

  it('positions nodes in a grid layout', () => {
    const result = ontologyToReactFlowElements(buildOntology());
    const positions = result.nodes.map((n) => n.position);
    // All positions should be defined
    expect(positions.every((p) => typeof p.x === 'number' && typeof p.y === 'number')).toBe(true);
  });
});

function buildOntologyWithIndividuals(): Ontology {
  const ont = buildOntology();
  ont.individuals.set('http://ex/john', {
    uri: 'http://ex/john',
    label: 'John',
    types: ['http://ex/Person'],
    objectPropertyAssertions: [{ property: 'http://ex/worksAt', target: 'http://ex/acme' }],
    dataPropertyAssertions: [{ property: 'http://ex/name', value: 'John Smith' }],
  });
  ont.individuals.set('http://ex/acme', {
    uri: 'http://ex/acme',
    types: [],
    objectPropertyAssertions: [],
    dataPropertyAssertions: [],
  });
  return ont;
}

describe('ontologyToReactFlowElements — individuals', () => {
  it('creates individual nodes', () => {
    const result = ontologyToReactFlowElements(buildOntologyWithIndividuals());
    const indNodes = result.nodes.filter((n) => n.type === 'individual');
    expect(indNodes).toHaveLength(2);
  });

  it('sets individual node data correctly', () => {
    const result = ontologyToReactFlowElements(buildOntologyWithIndividuals());
    const johnNode = result.nodes.find((n) => n.id === 'http://ex/john') as IndividualNode;
    expect(johnNode).toBeDefined();
    expect(johnNode.type).toBe('individual');
    expect(johnNode.data.label).toBe('John');
    expect(johnNode.data.uri).toBe('http://ex/john');
    expect(johnNode.data.types).toContain('http://ex/Person');
    expect(johnNode.data.typeLabels).toContain('Person');
  });

  it('creates typeOf edges from individuals to classes', () => {
    const result = ontologyToReactFlowElements(buildOntologyWithIndividuals());
    const typeOfEdges = result.edges.filter((e) => e.type === 'typeOf');
    expect(typeOfEdges).toHaveLength(1);
    expect(typeOfEdges[0].source).toBe('http://ex/john');
    expect(typeOfEdges[0].target).toBe('http://ex/Person');
  });

  it('does not create typeOf edges for untyped individuals', () => {
    const result = ontologyToReactFlowElements(buildOntologyWithIndividuals());
    const acmeTypeOfEdges = result.edges.filter(
      (e) => e.type === 'typeOf' && e.source === 'http://ex/acme',
    );
    expect(acmeTypeOfEdges).toHaveLength(0);
  });

  it('uses localName when individual has no label', () => {
    const result = ontologyToReactFlowElements(buildOntologyWithIndividuals());
    const acmeNode = result.nodes.find((n) => n.id === 'http://ex/acme') as IndividualNode;
    expect(acmeNode.data.label).toBe('acme');
  });

  it('includes both class and individual nodes', () => {
    const result = ontologyToReactFlowElements(buildOntologyWithIndividuals());
    const classNodes = result.nodes.filter((n) => n.type === 'class');
    const indNodes = result.nodes.filter((n) => n.type === 'individual');
    expect(classNodes.length).toBe(3);
    expect(indNodes.length).toBe(2);
  });

  it('positions individual nodes', () => {
    const result = ontologyToReactFlowElements(buildOntologyWithIndividuals());
    const indNodes = result.nodes.filter((n) => n.type === 'individual');
    expect(indNodes.every((n) => typeof n.position.x === 'number')).toBe(true);
  });
});
