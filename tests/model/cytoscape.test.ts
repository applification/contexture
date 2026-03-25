import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { parseTurtle } from '@renderer/model/parse'
import { ontologyToCytoscapeElements } from '@renderer/model/cytoscape'
import { createEmptyOntology } from '@renderer/model/types'

const peopleTurtle = readFileSync(
  resolve(__dirname, '../../resources/sample-ontologies/people.ttl'),
  'utf-8'
)

describe('ontologyToCytoscapeElements', () => {
  it('creates nodes for all classes', () => {
    const ontology = parseTurtle(peopleTurtle)
    const elements = ontologyToCytoscapeElements(ontology)
    const nodes = elements.filter((e) => 'type' in e.data && e.data.type === 'class')

    expect(nodes.length).toBe(4)
    const labels = nodes.map((n) => n.data.label).sort()
    expect(labels).toEqual(['Employee', 'Manager', 'Organisation', 'Person'])
  })

  it('attaches datatype properties to class nodes', () => {
    const ontology = parseTurtle(peopleTurtle)
    const elements = ontologyToCytoscapeElements(ontology)
    const personNode = elements.find(
      (e) => 'type' in e.data && e.data.type === 'class' && e.data.label === 'Person'
    )!

    const dtProps = (personNode.data as { datatypeProperties: { label: string }[] })
      .datatypeProperties
    expect(dtProps.length).toBe(3)
    const labels = dtProps.map((p) => p.label).sort()
    expect(labels).toEqual(['age', 'email', 'name'])
  })

  it('creates edges for object properties', () => {
    const ontology = parseTurtle(peopleTurtle)
    const elements = ontologyToCytoscapeElements(ontology)
    const objPropEdges = elements.filter(
      (e) => 'type' in e.data && e.data.type === 'objectProperty'
    )

    // worksFor, manages, managedBy
    expect(objPropEdges.length).toBe(3)
  })

  it('creates edges for subClassOf', () => {
    const ontology = parseTurtle(peopleTurtle)
    const elements = ontologyToCytoscapeElements(ontology)
    const subClassEdges = elements.filter(
      (e) => 'type' in e.data && e.data.type === 'subClassOf'
    )

    // Employee -> Person, Manager -> Employee
    expect(subClassEdges.length).toBe(2)
  })

  it('returns empty array for empty ontology', () => {
    const elements = ontologyToCytoscapeElements(createEmptyOntology())
    expect(elements).toEqual([])
  })
})
