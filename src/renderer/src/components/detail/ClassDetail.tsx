import { useState } from 'react'
import type { OntologyClass } from '@renderer/model/types'
import { useOntologyStore } from '@renderer/store/ontology'

interface Props {
  cls: OntologyClass
}

function localName(uri: string): string {
  const idx = Math.max(uri.lastIndexOf('#'), uri.lastIndexOf('/'))
  return idx >= 0 ? uri.substring(idx + 1) : uri
}

export function ClassDetail({ cls }: Props): React.JSX.Element {
  const updateClass = useOntologyStore((s) => s.updateClass)
  const ontology = useOntologyStore((s) => s.ontology)
  const [editingLabel, setEditingLabel] = useState(false)
  const [editingComment, setEditingComment] = useState(false)
  const [labelValue, setLabelValue] = useState(cls.label || '')
  const [commentValue, setCommentValue] = useState(cls.comment || '')

  const dtProps = Array.from(ontology.datatypeProperties.values()).filter((p) =>
    p.domain.includes(cls.uri)
  )

  const objProps = Array.from(ontology.objectProperties.values()).filter(
    (p) => p.domain.includes(cls.uri) || p.range.includes(cls.uri)
  )

  return (
    <div className="p-3 space-y-3 text-sm">
      <div>
        <div className="text-xs text-muted-foreground mb-0.5">Class</div>
        <div className="font-medium">{localName(cls.uri)}</div>
        <div className="text-xs text-muted-foreground break-all mt-0.5">{cls.uri}</div>
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
              updateClass(cls.uri, { label: labelValue || undefined })
              setEditingLabel(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                updateClass(cls.uri, { label: labelValue || undefined })
                setEditingLabel(false)
              }
              if (e.key === 'Escape') {
                setLabelValue(cls.label || '')
                setEditingLabel(false)
              }
            }}
            className="w-full bg-secondary rounded px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        ) : (
          <div
            onClick={() => {
              setLabelValue(cls.label || '')
              setEditingLabel(true)
            }}
            className="cursor-pointer hover:bg-secondary rounded px-2 py-1 -mx-2"
          >
            {cls.label || <span className="text-muted-foreground italic">No label</span>}
          </div>
        )}
      </div>

      {/* Comment */}
      <div>
        <div className="text-xs text-muted-foreground mb-0.5">Comment</div>
        {editingComment ? (
          <textarea
            autoFocus
            value={commentValue}
            onChange={(e) => setCommentValue(e.target.value)}
            onBlur={() => {
              updateClass(cls.uri, { comment: commentValue || undefined })
              setEditingComment(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setCommentValue(cls.comment || '')
                setEditingComment(false)
              }
            }}
            rows={3}
            className="w-full bg-secondary rounded px-2 py-1 text-sm outline-none resize-none focus:ring-1 focus:ring-ring"
          />
        ) : (
          <div
            onClick={() => {
              setCommentValue(cls.comment || '')
              setEditingComment(true)
            }}
            className="cursor-pointer hover:bg-secondary rounded px-2 py-1 -mx-2 text-xs"
          >
            {cls.comment || <span className="text-muted-foreground italic">No comment</span>}
          </div>
        )}
      </div>

      {/* SubClassOf */}
      {cls.subClassOf.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground mb-1">Inherits from</div>
          <div className="space-y-0.5">
            {cls.subClassOf.map((uri) => (
              <div key={uri} className="text-xs bg-secondary rounded px-2 py-1">
                {ontology.classes.get(uri)?.label || localName(uri)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Datatype Properties */}
      {dtProps.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground mb-1">Datatype Properties</div>
          <div className="space-y-0.5">
            {dtProps.map((p) => (
              <div key={p.uri} className="flex justify-between text-xs bg-secondary rounded px-2 py-1">
                <span>{p.label || localName(p.uri)}</span>
                <span className="text-muted-foreground font-mono">{localName(p.range)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Object Properties */}
      {objProps.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground mb-1">Relationships</div>
          <div className="space-y-0.5">
            {objProps.map((p) => (
              <div key={p.uri} className="text-xs bg-secondary rounded px-2 py-1">
                <span className="font-medium">{p.label || localName(p.uri)}</span>
                {p.domain.includes(cls.uri) && p.range.length > 0 && (
                  <span className="text-muted-foreground">
                    {' → '}
                    {p.range.map((r) => ontology.classes.get(r)?.label || localName(r)).join(', ')}
                  </span>
                )}
                {p.range.includes(cls.uri) && p.domain.length > 0 && (
                  <span className="text-muted-foreground">
                    {' ← '}
                    {p.domain.map((d) => ontology.classes.get(d)?.label || localName(d)).join(', ')}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
