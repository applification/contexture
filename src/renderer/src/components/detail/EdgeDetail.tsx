import { useState } from 'react'
import type { ObjectProperty } from '@renderer/model/types'
import { useOntologyStore } from '@renderer/store/ontology'

interface Props {
  property: ObjectProperty
  type: 'objectProperty'
}

function localName(uri: string): string {
  const idx = Math.max(uri.lastIndexOf('#'), uri.lastIndexOf('/'))
  return idx >= 0 ? uri.substring(idx + 1) : uri
}

export function EdgeDetail({ property }: Props): React.JSX.Element {
  const updateObjectProperty = useOntologyStore((s) => s.updateObjectProperty)
  const ontology = useOntologyStore((s) => s.ontology)
  const [editingLabel, setEditingLabel] = useState(false)
  const [labelValue, setLabelValue] = useState(property.label || '')

  return (
    <div className="p-3 space-y-3 text-sm">
      <div>
        <div className="text-xs text-muted-foreground mb-0.5">Object Property</div>
        <div className="font-medium">{localName(property.uri)}</div>
        <div className="text-xs text-muted-foreground break-all mt-0.5">{property.uri}</div>
      </div>

      {/* Label */}
      <div>
        <div className="text-xs text-muted-foreground mb-0.5">Label</div>
        {editingLabel ? (
          <input
            autoFocus
            value={labelValue}
            onChange={(e) => setLabelValue(e.target.value)}
            onBlur={() => {
              updateObjectProperty(property.uri, { label: labelValue || undefined })
              setEditingLabel(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                updateObjectProperty(property.uri, { label: labelValue || undefined })
                setEditingLabel(false)
              }
              if (e.key === 'Escape') {
                setLabelValue(property.label || '')
                setEditingLabel(false)
              }
            }}
            className="w-full bg-secondary rounded px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        ) : (
          <div
            onClick={() => {
              setLabelValue(property.label || '')
              setEditingLabel(true)
            }}
            className="cursor-pointer hover:bg-secondary rounded px-2 py-1 -mx-2"
          >
            {property.label || <span className="text-muted-foreground italic">No label</span>}
          </div>
        )}
      </div>

      {/* Domain */}
      {property.domain.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground mb-1">Domain</div>
          <div className="space-y-0.5">
            {property.domain.map((uri) => (
              <div key={uri} className="text-xs bg-secondary rounded px-2 py-1">
                {ontology.classes.get(uri)?.label || localName(uri)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Range */}
      {property.range.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground mb-1">Range</div>
          <div className="space-y-0.5">
            {property.range.map((uri) => (
              <div key={uri} className="text-xs bg-secondary rounded px-2 py-1">
                {ontology.classes.get(uri)?.label || localName(uri)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Inverse */}
      {property.inverseOf && (
        <div>
          <div className="text-xs text-muted-foreground mb-0.5">Inverse of</div>
          <div className="text-xs bg-secondary rounded px-2 py-1">
            {ontology.objectProperties.get(property.inverseOf)?.label || localName(property.inverseOf)}
          </div>
        </div>
      )}
    </div>
  )
}
