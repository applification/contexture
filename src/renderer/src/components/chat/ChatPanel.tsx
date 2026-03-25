import { useState, useRef, useEffect } from 'react'
import { useClaude, type ChatMessage } from './useClaude'

export function ChatPanel(): React.JSX.Element {
  const {
    messages, isLoading, authMode, setAuthMode, apiKey, setApiKey, cliDetected, isReady,
    sendMessage, resetSession
  } = useClaude()
  const [input, setInput] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    if (!input.trim() || isLoading) return
    if (!isReady) {
      setShowSettings(true)
      return
    }
    sendMessage(input.trim())
    setInput('')
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Claude
        </h2>
        <div className="flex gap-1">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors px-1"
            title="Auth settings"
          >
            {isReady ? '●' : '○'}
          </button>
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
      </div>

      {/* Auth Settings */}
      {showSettings && (
        <div className="px-3 py-2 border-b border-border bg-secondary/50 space-y-2">
          <div className="flex gap-1">
            <button
              onClick={() => setAuthMode('max')}
              className={`text-[10px] px-2 py-0.5 rounded ${authMode === 'max' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}
            >
              Claude Max
            </button>
            <button
              onClick={() => setAuthMode('api-key')}
              className={`text-[10px] px-2 py-0.5 rounded ${authMode === 'api-key' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}
            >
              API Key
            </button>
          </div>

          {authMode === 'max' && (
            <p className="text-[10px] text-muted-foreground">
              {cliDetected
                ? 'Claude CLI detected. Using your Max subscription.'
                : 'Claude CLI not found. Install Claude Code and log in, or switch to API Key mode.'}
            </p>
          )}

          {authMode === 'api-key' && (
            <>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-ant-..."
                className="w-full bg-secondary text-xs rounded px-2 py-1 outline-none focus:ring-1 focus:ring-ring font-mono"
              />
              <p className="text-[10px] text-muted-foreground">
                Stored locally. Used to call the Claude API directly.
              </p>
            </>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center mt-4">
            {isReady
              ? 'Describe the ontology you want to create...'
              : authMode === 'max'
                ? 'Claude CLI not detected. Check settings.'
                : 'Set your API key to start chatting with Claude'}
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

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-border">
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
      {message.content}
      {message.cost !== undefined && (
        <span className="text-[10px] text-muted-foreground ml-2">
          ${message.cost.toFixed(4)}
        </span>
      )}
    </div>
  )
}
