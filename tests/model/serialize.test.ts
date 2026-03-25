import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { parseTurtle } from '@renderer/model/parse'
import { serializeToTurtle } from '@renderer/model/serialize'
import { createEmptyOntology } from '@renderer/model/types'

const EX = 'http://example.org/ontology#'
const XSD = 'http://www.w3.org/2001/XMLSchema#'

const peopleTurtle = readFileSync(
  resolve(__dirname, '../../resources/sample-ontologies/people.ttl'),
  'utf-8'
)

describe('serializeToTurtle', () => {
  it('round-trips: parse then serialize preserves classes', () => {
    const original = parseTurtle(peopleTurtle)
    const serialized = serializeToTurtle(original)
    const reparsed = parseTurtle(serialized)

    expect(reparsed.classes.size).toBe(original.classes.size)
    for (const [uri, cls] of original.classes) {
      const reparsedCls = reparsed.classes.get(uri)!
      expect(reparsedCls).toBeDefined()
      expect(reparsedCls.label).toBe(cls.label)
      expect(reparsedCls.comment).toBe(cls.comment)
      expect(reparsedCls.subClassOf.sort()).toEqual(cls.subClassOf.sort())
    }
  })

  it('round-trips: preserves object properties', () => {
    const original = parseTurtle(peopleTurtle)
    const serialized = serializeToTurtle(original)
    const reparsed = parseTurtle(serialized)

    expect(reparsed.objectProperties.size).toBe(original.objectProperties.size)
    for (const [uri, prop] of original.objectProperties) {
      const reparsedProp = reparsed.objectProperties.get(uri)!
      expect(reparsedProp).toBeDefined()
      expect(reparsedProp.label).toBe(prop.label)
      expect(reparsedProp.domain.sort()).toEqual(prop.domain.sort())
      expect(reparsedProp.range.sort()).toEqual(prop.range.sort())
      expect(reparsedProp.inverseOf).toBe(prop.inverseOf)
    }
  })

  it('round-trips: preserves datatype properties', () => {
    const original = parseTurtle(peopleTurtle)
    const serialized = serializeToTurtle(original)
    const reparsed = parseTurtle(serialized)

    expect(reparsed.datatypeProperties.size).toBe(original.datatypeProperties.size)
    for (const [uri, prop] of original.datatypeProperties) {
      const reparsedProp = reparsed.datatypeProperties.get(uri)!
      expect(reparsedProp).toBeDefined()
      expect(reparsedProp.label).toBe(prop.label)
      expect(reparsedProp.domain.sort()).toEqual(prop.domain.sort())
      expect(reparsedProp.range).toBe(prop.range)
    }
  })

  it('round-trips: preserves prefixes', () => {
    const original = parseTurtle(peopleTurtle)
    const serialized = serializeToTurtle(original)
    const reparsed = parseTurtle(serialized)

    expect(reparsed.prefixes.get('ex')).toBe(EX)
  })

  it('serializes empty ontology', () => {
    const empty = createEmptyOntology()
    const serialized = serializeToTurtle(empty)
    expect(typeof serialized).toBe('string')
    // Should at least have prefix declarations
    const reparsed = parseTurtle(serialized)
    expect(reparsed.classes.size).toBe(0)
  })
})
