import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ChatThread } from './useChatHistory'

function formatDate(ts: number): string {
  const date = new Date(ts)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

interface ChatThreadListProps {
  threads: ChatThread[]
  activeThreadId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}

export function ChatThreadList({ threads, activeThreadId, onSelect, onDelete }: ChatThreadListProps): React.JSX.Element {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  if (threads.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <p className="text-xs text-muted-foreground text-center">
          No chat history yet. Start a conversation below.
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {threads.map((thread) => {
        const messageCount = thread.messages.filter((m) => m.role !== 'tool').length
        const isActive = thread.id === activeThreadId

        return (
          <div
            key={thread.id}
            className={cn(
              'group relative px-3 py-2.5 cursor-pointer border-b border-border/50',
              'hover:bg-secondary/60 transition-colors',
              isActive && 'bg-secondary/40'
            )}
            onClick={() => onSelect(thread.id)}
          >
            <div className="flex items-start gap-2">
              {isActive && (
                <span className="mt-1.5 size-1.5 rounded-full bg-primary shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{thread.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatDate(thread.updatedAt)} · {messageCount} message{messageCount !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                {confirmDeleteId === thread.id ? (
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDelete(thread.id)
                        setConfirmDeleteId(null)
                      }}
                      title="Confirm delete"
                    >
                      <Trash2 className="size-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      onClick={(e) => {
                        e.stopPropagation()
                        setConfirmDeleteId(null)
                      }}
                      title="Cancel"
                    >
                      ×
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation()
                      setConfirmDeleteId(thread.id)
                    }}
                    title="Delete chat"
                  >
                    <Trash2 className="size-3" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
