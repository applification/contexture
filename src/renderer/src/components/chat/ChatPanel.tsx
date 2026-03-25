import { useState, useRef, useEffect, useMemo } from 'react'
import { Streamdown } from 'streamdown'
import { code } from '@streamdown/code'
import { useClaude, type ChatMessage, type ModelId, type ThinkingBudget } from './useClaude'
import { useUIStore } from '@renderer/store/ui'
import { useOntologyStore } from '@renderer/store/ontology'

export function ChatPanel(): React.JSX.Element {
  const {
    messages, isLoading, authMode, isReady,
    model, setModel, thinkingBudget, setThinkingBudget,
    sendMessage, resetSession
  } = useClaude()
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const selectedNodeId = useUIStore((s) => s.selectedNodeId)
  const selectedEdgeId = useUIStore((s) => s.selectedEdgeId)
  const setSelectedNode = useUIStore((s) => s.setSelectedNode)
  const setSelectedEdge = useUIStore((s) => s.setSelectedEdge)
  const ontology = useOntologyStore((s) => s.ontology)

  const selectionContext = useMemo(() => {
    if (selectedNodeId) {
      const cls = ontology.classes.get(selectedNodeId)
      if (!cls) return null
      const parts = [`Currently selected class "${cls.label || cls.uri}" (${cls.uri})`]
      if (cls.comment) parts.push(`comment: "${cls.comment}"`)
      if (cls.subClassOf.length) parts.push(`subClassOf: ${cls.subClassOf.join(', ')}`)
      return { type: 'class' as const, label: cls.label || cls.uri, contextString: `[Context: ${parts.join(' - ')}]` }
    }
    if (selectedEdgeId) {
      const prop = ontology.objectProperties.get(selectedEdgeId)
      if (!prop) return null
      const parts = [`Currently selected property "${prop.label || prop.uri}" (${prop.uri})`]
      if (prop.comment) parts.push(`comment: "${prop.comment}"`)
      if (prop.domain.length) parts.push(`domain: ${prop.domain.join(', ')}`)
      if (prop.range.length) parts.push(`range: ${prop.range.join(', ')}`)
      return { type: 'property' as const, label: prop.label || prop.uri, contextString: `[Context: ${parts.join(' - ')}]` }
    }
    return null
  }, [selectedNodeId, selectedEdgeId, ontology])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    if (!input.trim() || isLoading) return
    if (!isReady) return
    sendMessage(input.trim(), selectionContext?.contextString)
    setInput('')
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Claude
        </h2>
        {messages.length > 0 && (
          <button
            onClick={resetSession}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors px-1"
            title="New conversation"
          >
            ↺
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center mt-4">
            {isReady
              ? 'Describe the ontology you want to create...'
              : authMode === 'max'
                ? 'Claude CLI not detected. Configure in toolbar.'
                : 'Set your API key in the toolbar to start chatting'}
          </p>
        )}
        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}
        {isLoading && (
          <div className="flex gap-1 items-center text-xs text-muted-foreground">
            <span className="animate-pulse">●</span>
            <span>Claude is thinking...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Selection Context Badge */}
      {selectionContext && (
        <div className="px-3 pt-2">
          <div className="inline-flex items-center gap-1.5 bg-secondary text-xs rounded-full px-2.5 py-1 max-w-full">
            <span className="text-muted-foreground">{selectionContext.type === 'class' ? '◆' : '→'}</span>
            <span className="truncate text-foreground">{selectionContext.label}</span>
            <button
              onClick={() => selectionContext.type === 'class' ? setSelectedNode(null) : setSelectedEdge(null)}
              className="text-muted-foreground hover:text-foreground ml-0.5 shrink-0"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-border space-y-1.5">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isReady ? 'Describe your ontology...' : 'Configure auth first...'}
            disabled={!isReady || isLoading}
            className="flex-1 bg-secondary text-sm rounded-md px-3 py-1.5 outline-none placeholder:text-muted-foreground disabled:opacity-50 focus:ring-1 focus:ring-ring"
          />
          {isLoading && (
            <button
              type="button"
              onClick={() => window.api.abortClaude()}
              className="text-xs text-destructive-foreground hover:opacity-80 px-2"
            >
              Stop
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={model}
            onChange={(e) => setModel(e.target.value as ModelId)}
            className="text-[11px] bg-secondary text-muted-foreground rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-ring cursor-pointer hover:text-foreground transition-colors"
          >
            <option value="claude-haiku-4-5-20251001">Haiku</option>
            <option value="claude-sonnet-4-6">Sonnet</option>
            <option value="claude-opus-4-6">Opus</option>
          </select>
          <div className="flex gap-0.5">
            {(['auto', 'low', 'med', 'high'] as ThinkingBudget[]).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setThinkingBudget(level)}
                className={`text-[11px] px-1.5 py-0.5 rounded transition-colors ${
                  thinkingBudget === level
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>
      </form>
    </div>
  )
}

function MessageBubble({ message }: { message: ChatMessage }): React.JSX.Element {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="bg-primary text-primary-foreground text-sm rounded-lg px-3 py-1.5 max-w-[85%]">
          {message.content}
        </div>
      </div>
    )
  }

  if (message.role === 'tool') {
    return (
      <div className="text-[10px] text-muted-foreground bg-secondary/50 rounded px-2 py-1 font-mono">
        ⚡ {message.toolName}
      </div>
    )
  }

  return (
    <div className="text-sm text-foreground max-w-[95%] leading-relaxed">
      <Streamdown plugins={{ code }}>{message.content}</Streamdown>
      {message.cost !== undefined && (
        <span className="text-[10px] text-muted-foreground ml-2">
          ${message.cost.toFixed(4)}
        </span>
      )}
    </div>
  )
}
