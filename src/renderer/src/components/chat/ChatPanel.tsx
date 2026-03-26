import { useState, useRef, useEffect, useMemo } from 'react'
import { RotateCcw, BotMessageSquare } from 'lucide-react'
import { Streamdown } from 'streamdown'
import { code } from '@streamdown/code'
import { useClaude, type ChatMessage, type ModelId, type ThinkingBudget } from './useClaude'
import { useUIStore } from '@renderer/store/ui'
import { useOntologyStore } from '@renderer/store/ontology'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { cn } from '@/lib/utils'

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
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={resetSession}
            title="New conversation"
          >
            <RotateCcw className="size-3.5" />
          </Button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <Empty className="border-0 p-4">
            <EmptyHeader>
              {isReady && (
                <EmptyMedia variant="icon">
                  <BotMessageSquare />
                </EmptyMedia>
              )}
              <EmptyTitle className="text-sm font-medium">
                {isReady ? 'Start a conversation' : 'Not connected'}
              </EmptyTitle>
              <EmptyDescription className="text-xs">
                {isReady
                  ? 'Describe the ontology you want to create or select a node to get context-aware suggestions.'
                  : authMode === 'max'
                    ? 'Claude CLI not detected. Configure in toolbar.'
                    : 'Set your API key in the toolbar to start chatting.'}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
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
          <Badge className="inline-flex gap-1.5 px-2.5 py-1 rounded-full max-w-full text-xs font-normal h-auto bg-primary-display/10 text-primary-display border border-primary-display hover:bg-primary-display/10">
            <span className="opacity-60">{selectionContext.type === 'class' ? '◆' : '→'}</span>
            <span className="truncate">{selectionContext.label}</span>
            <button
              onClick={() => selectionContext.type === 'class' ? setSelectedNode(null) : setSelectedEdge(null)}
              className="text-muted-foreground hover:text-foreground ml-0.5 shrink-0"
            >
              ×
            </button>
          </Badge>
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-border space-y-1.5">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isReady ? 'Describe your ontology...' : 'Configure auth first...'}
            disabled={!isReady || isLoading}
            className="flex-1 text-sm"
          />
          {isLoading && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => window.api.abortClaude()}
              className="text-destructive hover:text-destructive/80 px-2 h-8"
            >
              Stop
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Select value={model} onValueChange={(v) => setModel(v as ModelId)}>
            <SelectTrigger className="w-28 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="claude-haiku-4-5-20251001">Haiku</SelectItem>
              <SelectItem value="claude-sonnet-4-6">Sonnet</SelectItem>
              <SelectItem value="claude-opus-4-6">Opus</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex gap-0.5">
            {(['auto', 'low', 'med', 'high'] as ThinkingBudget[]).map((level) => (
              <Button
                key={level}
                type="button"
                variant="ghost"
                onClick={() => setThinkingBudget(level)}
                className={cn(
                  'text-[11px] px-1.5 h-6 rounded',
                  thinkingBudget === level
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {level}
              </Button>
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
