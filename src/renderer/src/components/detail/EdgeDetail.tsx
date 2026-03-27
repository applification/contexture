import type { ObjectProperty } from '@renderer/model/types'
import { useOntologyStore } from '@renderer/store/ontology'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

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

  return (
    <div className="p-3 space-y-4 text-sm">
      <div>
        <div className="text-xs text-muted-foreground mb-0.5">Object Property</div>
        <div className="font-medium">{localName(property.uri)}</div>
        <div className="text-xs text-muted-foreground break-all mt-0.5">{property.uri}</div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="prop-label">Label</Label>
        <Input
          id="prop-label"
          defaultValue={property.label || ''}
          onBlur={(e) => updateObjectProperty(property.uri, { label: e.target.value || undefined })}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        />
      </div>

      {property.domain.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground mb-1">Domain</div>
          <div className="flex flex-wrap gap-1">
            {property.domain.map((uri) => (
              <Badge key={uri} variant="secondary" className="text-xs font-normal">
                {ontology.classes.get(uri)?.label || localName(uri)}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {property.range.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground mb-1">Range</div>
          <div className="flex flex-wrap gap-1">
            {property.range.map((uri) => (
              <Badge key={uri} variant="secondary" className="text-xs font-normal">
                {ontology.classes.get(uri)?.label || localName(uri)}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <div className="text-xs text-muted-foreground">Cardinality</div>
        <div className="flex items-center gap-2">
          <div className="flex-1 space-y-1">
            <Label htmlFor="prop-min-card" className="text-xs">Min</Label>
            <Input
              id="prop-min-card"
              type="number"
              min={0}
              placeholder="—"
              defaultValue={property.minCardinality ?? ''}
              onBlur={(e) => {
                const val = e.target.value.trim()
                updateObjectProperty(property.uri, {
                  minCardinality: val === '' ? undefined : Math.max(0, parseInt(val, 10))
                })
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              className="h-8 text-xs"
            />
          </div>
          <div className="flex-1 space-y-1">
            <Label htmlFor="prop-max-card" className="text-xs">Max</Label>
            <Input
              id="prop-max-card"
              type="number"
              min={0}
              placeholder="∞"
              defaultValue={property.maxCardinality ?? ''}
              onBlur={(e) => {
                const val = e.target.value.trim()
                updateObjectProperty(property.uri, {
                  maxCardinality: val === '' ? undefined : Math.max(0, parseInt(val, 10))
                })
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              className="h-8 text-xs"
            />
          </div>
        </div>
      </div>

      {property.inverseOf && (
        <div>
          <div className="text-xs text-muted-foreground mb-0.5">Inverse of</div>
          <Badge variant="secondary" className="text-xs font-normal">
            {ontology.objectProperties.get(property.inverseOf)?.label || localName(property.inverseOf)}
          </Badge>
        </div>
      )}
    </div>
  )
}
