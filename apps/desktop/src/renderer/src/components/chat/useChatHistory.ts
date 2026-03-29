import { useState, useCallback, useEffect } from 'react'
import type { ChatMessage, ModelId } from './useClaude'

export interface ChatThread {
  id: string
  title: string
  messages: ChatMessage[]
  model: ModelId
  createdAt: number
  updatedAt: number
}

const STORAGE_KEY = 'ontograph-chat-threads'
const ACTIVE_THREAD_KEY = 'ontograph-active-thread'
const MAX_THREADS = 50

function generateId(): string {
  return crypto.randomUUID()
}

function loadThreads(): ChatThread[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveThreads(threads: ChatThread[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(threads))
  } catch {
    // Quota exceeded — prune oldest half and retry once
    try {
      const pruned = threads.slice(0, Math.ceil(threads.length / 2))
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned))
    } catch {
      // Storage completely full — silently skip
    }
  }
}

function titleFromMessage(message: string): string {
  return message.length > 50 ? message.slice(0, 50) + '…' : message
}

export interface UseChatHistoryReturn {
  threads: ChatThread[]
  activeThreadId: string | null
  showThreadList: boolean
  setShowThreadList: (show: boolean) => void
  createThread: (model: ModelId) => string
  switchThread: (id: string) => ChatThread | undefined
  deleteThread: (id: string) => void
  updateThreadMessages: (id: string, messages: ChatMessage[]) => void
  updateThreadTitle: (id: string, title: string) => void
  getActiveThread: () => ChatThread | undefined
  setActiveThreadId: (id: string | null) => void
}

export function useChatHistory(): UseChatHistoryReturn {
  const [threads, setThreads] = useState<ChatThread[]>(loadThreads)
  const [activeThreadId, setActiveThreadIdState] = useState<string | null>(
    () => localStorage.getItem(ACTIVE_THREAD_KEY)
  )
  const [showThreadList, setShowThreadList] = useState(false)

  // Persist threads on change
  useEffect(() => {
    saveThreads(threads)
  }, [threads])

  // Persist active thread id
  const setActiveThreadId = useCallback((id: string | null) => {
    setActiveThreadIdState(id)
    if (id) {
      localStorage.setItem(ACTIVE_THREAD_KEY, id)
    } else {
      localStorage.removeItem(ACTIVE_THREAD_KEY)
    }
  }, [])

  const createThread = useCallback((model: ModelId): string => {
    const id = generateId()
    const thread: ChatThread = {
      id,
      title: 'New chat',
      messages: [],
      model,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    setThreads((prev) => {
      const updated = [thread, ...prev]
      // Prune oldest beyond limit
      return updated.slice(0, MAX_THREADS)
    })
    setActiveThreadId(id)
    return id
  }, [setActiveThreadId])

  const switchThread = useCallback((id: string): ChatThread | undefined => {
    setActiveThreadId(id)
    setShowThreadList(false)
    return threads.find((t) => t.id === id)
  }, [threads, setActiveThreadId])

  const deleteThread = useCallback((id: string) => {
    setThreads((prev) => {
      const remaining = prev.filter((t) => t.id !== id)
      if (activeThreadId === id) {
        setActiveThreadId(remaining.length > 0 ? remaining[0].id : null)
      }
      return remaining
    })
  }, [activeThreadId, setActiveThreadId])

  const updateThreadMessages = useCallback((id: string, messages: ChatMessage[]) => {
    setThreads((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t
        const title =
          t.title === 'New chat' && messages.length > 0
            ? titleFromMessage(messages.find((m) => m.role === 'user')?.content || 'New chat')
            : t.title
        return { ...t, messages, title, updatedAt: Date.now() }
      })
    )
  }, [])

  const updateThreadTitle = useCallback((id: string, title: string) => {
    setThreads((prev) =>
      prev.map((t) => (t.id === id ? { ...t, title, updatedAt: Date.now() } : t))
    )
  }, [])

  const getActiveThread = useCallback((): ChatThread | undefined => {
    return threads.find((t) => t.id === activeThreadId)
  }, [threads, activeThreadId])

  return {
    threads,
    activeThreadId,
    showThreadList,
    setShowThreadList,
    createThread,
    switchThread,
    deleteThread,
    updateThreadMessages,
    updateThreadTitle,
    getActiveThread,
    setActiveThreadId
  }
}
