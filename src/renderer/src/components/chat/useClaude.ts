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

export type AuthMode = 'max' | 'api-key'
export type ModelId = 'claude-haiku-4-5-20251001' | 'claude-sonnet-4-6' | 'claude-opus-4-6'
export type ThinkingBudget = 'auto' | 'low' | 'med' | 'high'

const THINKING_TOKENS: Record<ThinkingBudget, number | undefined> = {
  auto: undefined,
  low: 2048,
  med: 8192,
  high: 16000
}

interface UseClaudeReturn {
  messages: ChatMessage[]
  isLoading: boolean
  authMode: AuthMode
  setAuthMode: (mode: AuthMode) => void
  apiKey: string
  setApiKey: (key: string) => void
  model: ModelId
  setModel: (model: ModelId) => void
  thinkingBudget: ThinkingBudget
  setThinkingBudget: (budget: ThinkingBudget) => void
  cliDetected: boolean
  isReady: boolean
  sendMessage: (message: string, context?: string) => void
  resetSession: () => void
}

const API_KEY_STORAGE = 'ontograph-api-key'
const AUTH_MODE_STORAGE = 'ontograph-auth-mode'
const MODEL_STORAGE = 'ontograph-model'
const THINKING_STORAGE = 'ontograph-thinking-budget'

export function useClaude(): UseClaudeReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [apiKey, setApiKeyState] = useState(() => localStorage.getItem(API_KEY_STORAGE) || '')
  const [authMode, setAuthModeState] = useState<AuthMode>(
    () => (localStorage.getItem(AUTH_MODE_STORAGE) as AuthMode) || 'max'
  )
  const [model, setModelState] = useState<ModelId>(
    () => (localStorage.getItem(MODEL_STORAGE) as ModelId) || 'claude-sonnet-4-6'
  )
  const [thinkingBudget, setThinkingBudgetState] = useState<ThinkingBudget>(
    () => (localStorage.getItem(THINKING_STORAGE) as ThinkingBudget) || 'auto'
  )
  const [cliDetected, setCliDetected] = useState(false)

  const store = useOntologyStore

  // Detect Claude CLI on mount and auto-select auth mode
  useEffect(() => {
    window.api.detectClaudeCli().then((result) => {
      setCliDetected(result.installed)
      // Auto-default to Max if CLI found and no stored preference
      if (result.installed && !localStorage.getItem(AUTH_MODE_STORAGE)) {
        setAuthModeState('max')
      } else if (!result.installed && !localStorage.getItem(AUTH_MODE_STORAGE)) {
        setAuthModeState('api-key')
      }
    })
  }, [])

  const isReady = authMode === 'max' ? cliDetected : !!apiKey

  const setAuthMode = useCallback((mode: AuthMode) => {
    setAuthModeState(mode)
    localStorage.setItem(AUTH_MODE_STORAGE, mode)
  }, [])

  const setApiKey = useCallback((key: string) => {
    setApiKeyState(key)
    if (key) {
      localStorage.setItem(API_KEY_STORAGE, key)
    } else {
      localStorage.removeItem(API_KEY_STORAGE)
    }
  }, [])

  const setModel = useCallback((m: ModelId) => {
    setModelState(m)
    localStorage.setItem(MODEL_STORAGE, m)
  }, [])

  const setThinkingBudget = useCallback((b: ThinkingBudget) => {
    setThinkingBudgetState(b)
    localStorage.setItem(THINKING_STORAGE, b)
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
    (message: string, context?: string) => {
      setMessages((prev) => [...prev, { role: 'user', content: message }])
      setIsLoading(true)
      const auth =
        authMode === 'api-key' ? { mode: 'api-key' as const, key: apiKey } : { mode: 'max' as const }
      const prompt = context ? `${context}\n\n${message}` : message
      const modelOptions = { model, thinkingBudgetTokens: THINKING_TOKENS[thinkingBudget] }
      window.api.sendMessage(prompt, auth, modelOptions)
    },
    [apiKey, authMode, model, thinkingBudget]
  )

  const resetSession = useCallback(() => {
    setMessages([])
    window.api.resetSession()
  }, [])

  return { messages, isLoading, authMode, setAuthMode, apiKey, setApiKey, model, setModel, thinkingBudget, setThinkingBudget, cliDetected, isReady, sendMessage, resetSession }
}
