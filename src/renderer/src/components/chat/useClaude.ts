import { useState, useEffect, useCallback } from 'react'
import { useOntologyStore } from '@renderer/store/ontology'
import { serializeToTurtle } from '@renderer/model/serialize'
import { validateOntology } from '@renderer/services/validation'

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool'
  content: string
  toolName?: string
  cost?: number
}

interface UseClaudeReturn {
  messages: ChatMessage[]
  isLoading: boolean
  apiKey: string
  setApiKey: (key: string) => void
  sendMessage: (message: string) => void
  resetSession: () => void
}

const API_KEY_STORAGE = 'ontograph-api-key'

export function useClaude(): UseClaudeReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [apiKey, setApiKeyState] = useState(() => localStorage.getItem(API_KEY_STORAGE) || '')

  const store = useOntologyStore

  const setApiKey = useCallback((key: string) => {
    setApiKeyState(key)
    if (key) {
      localStorage.setItem(API_KEY_STORAGE, key)
    } else {
      localStorage.removeItem(API_KEY_STORAGE)
    }
  }, [])

  // Register tool callback listeners
  useEffect(() => {
    const cleanups = [
      // Main process requesting ontology state
      window.api.onClaudeGetOntology(() => {
        const turtle = serializeToTurtle(store.getState().ontology)
        window.api.respondOntology(turtle)
      }),

      // Main process sending ontology to load
      window.api.onClaudeLoadOntology((turtle: string) => {
        store.getState().loadFromTurtle(turtle)
      }),

      // Add class
      window.api.onClaudeAddClass((args) => {
        store.getState().addClass(args.uri, {
          label: args.label,
          comment: args.comment,
          subClassOf: args.subClassOf || []
        })
      }),

      // Add object property
      window.api.onClaudeAddObjectProperty((args) => {
        store.getState().addObjectProperty(args.uri, {
          label: args.label,
          comment: args.comment,
          domain: args.domain,
          range: args.range
        })
      }),

      // Add datatype property
      window.api.onClaudeAddDatatypeProperty((args) => {
        store.getState().addDatatypeProperty(args.uri, {
          label: args.label,
          domain: args.domain,
          range: args.range
        })
      }),

      // Modify class
      window.api.onClaudeModifyClass((uri: string, changes: Record<string, unknown>) => {
        store.getState().updateClass(uri, changes as Parameters<typeof store.getState['updateClass']>[1])
      }),

      // Remove element
      window.api.onClaudeRemoveElement((uri: string, type: string) => {
        if (type === 'class') store.getState().removeClass(uri)
        else if (type === 'objectProperty') store.getState().removeObjectProperty(uri)
        else if (type === 'datatypeProperty') store.getState().removeDatatypeProperty(uri)
      }),

      // Validate
      window.api.onClaudeValidate(() => {
        const errors = validateOntology(store.getState().ontology)
        window.api.respondValidation(JSON.stringify(errors, null, 2))
      }),

      // Assistant responses
      window.api.onClaudeAssistantText((text: string) => {
        setMessages((prev) => {
          // Append to last assistant message if exists, otherwise create new
          const last = prev[prev.length - 1]
          if (last && last.role === 'assistant') {
            return [...prev.slice(0, -1), { ...last, content: text }]
          }
          return [...prev, { role: 'assistant', content: text }]
        })
      }),

      // Tool use indicator
      window.api.onClaudeToolUse((toolName: string) => {
        const shortName = toolName.replace('mcp__ontograph__', '')
        setMessages((prev) => [...prev, { role: 'tool', content: shortName, toolName: shortName }])
      }),

      // Final result
      window.api.onClaudeResult((_result: string, cost: number) => {
        setIsLoading(false)
        // Attach cost to last assistant message
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (last && last.role === 'assistant') {
            return [...prev.slice(0, -1), { ...last, cost }]
          }
          return prev
        })
      }),

      // Error
      window.api.onClaudeError((error: string) => {
        setIsLoading(false)
        setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${error}` }])
      })
    ]

    return () => cleanups.forEach((fn) => fn())
  }, [store])

  const sendMessage = useCallback(
    (message: string) => {
      setMessages((prev) => [...prev, { role: 'user', content: message }])
      setIsLoading(true)
      window.api.sendMessage(message, apiKey)
    },
    [apiKey]
  )

  const resetSession = useCallback(() => {
    setMessages([])
    window.api.resetSession()
  }, [])

  return { messages, isLoading, apiKey, setApiKey, sendMessage, resetSession }
}
