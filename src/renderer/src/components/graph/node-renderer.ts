interface DatatypePropertyData {
  label: string
  range: string
}

export function renderNodeHtml(data: Record<string, unknown>): string {
  const label = data.label as string
  const dtProps = (data.datatypeProperties || []) as DatatypePropertyData[]

  const propsHtml = dtProps
    .map(
      (p) => `
      <div class="node-prop">
        <span class="node-prop-name">${escapeHtml(p.label)}</span>
        <span class="node-prop-type">${escapeHtml(p.range)}</span>
      </div>`
    )
    .join('')

  return `
    <div class="ontograph-node">
      <div class="node-header">${escapeHtml(label)}</div>
      ${propsHtml ? `<div class="node-body">${propsHtml}</div>` : ''}
    </div>
  `
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
