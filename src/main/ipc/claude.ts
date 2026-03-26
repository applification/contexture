import { ipcMain, BrowserWindow } from 'electron'
import { query, tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod/v4'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

interface AuthConfig {
  mode: 'api-key' | 'max'
  key?: string
  binaryPath?: string
}

let detectedClaudePath: string | null = null

export function getDetectedClaudePath(): string | null {
  return detectedClaudePath
}

async function detectClaudeCli(): Promise<{ installed: boolean; path: string | null }> {
  try {
    const { stdout } = await execFileAsync(process.platform === 'win32' ? 'where' : 'which', [
      'claude'
    ])
    const path = stdout.trim().split('\n')[0]
    return { installed: true, path }
  } catch {
    return { installed: false, path: null }
  }
}

interface OntologyState {
  turtle: string
}

let currentAbort: AbortController | null = null

function getMainWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null
}

function sendToRenderer(channel: string, ...args: unknown[]): void {
  const win = getMainWindow()
  if (win) win.webContents.send(channel, ...args)
}

// Define ontology manipulation tools
const getCurrentOntology = tool(
  'get_current_ontology',
  'Get the current ontology as Turtle (.ttl) format. Call this before making modifications to understand the current state.',
  {},
  async () => {
    return new Promise((resolve) => {
      const win = getMainWindow()
      if (!win) {
        resolve({ content: [{ type: 'text' as const, text: 'No window available' }], isError: true })
        return
      }
      ipcMain.handleOnce('claude:ontology-response', (_event, state: OntologyState) => {
        resolve({ content: [{ type: 'text' as const, text: state.turtle }] })
      })
      win.webContents.send('claude:get-ontology')
    })
  }
)

const generateOntology = tool(
  'generate_ontology',
  'Replace the entire ontology with new Turtle content. Use this for initial generation or wholesale replacement. The Turtle must be valid and include all necessary prefix declarations.',
  { turtle: z.string().describe('Complete ontology in Turtle (.ttl) format') },
  async (args) => {
    sendToRenderer('claude:load-ontology', args.turtle)
    return { content: [{ type: 'text' as const, text: 'Ontology loaded successfully' }] }
  }
)

const addClass = tool(
  'add_class',
  'Add a new OWL class to the ontology',
  {
    uri: z.string().describe('Full URI for the class (e.g. http://example.org/ontology#Person)'),
    label: z.string().optional().describe('Human-readable label'),
    comment: z.string().optional().describe('Description of the class'),
    subClassOf: z.array(z.string()).optional().describe('URIs of parent classes')
  },
  async (args) => {
    sendToRenderer('claude:add-class', args)
    return { content: [{ type: 'text' as const, text: `Class ${args.uri} added` }] }
  }
)

const addObjectProperty = tool(
  'add_object_property',
  'Add a new OWL object property (relationship between classes)',
  {
    uri: z.string().describe('Full URI for the property'),
    label: z.string().optional().describe('Human-readable label'),
    comment: z.string().optional().describe('Description'),
    domain: z.array(z.string()).describe('URIs of domain classes'),
    range: z.array(z.string()).describe('URIs of range classes')
  },
  async (args) => {
    sendToRenderer('claude:add-object-property', args)
    return { content: [{ type: 'text' as const, text: `Object property ${args.uri} added` }] }
  }
)

const addDatatypeProperty = tool(
  'add_datatype_property',
  'Add a new OWL datatype property (attribute of a class)',
  {
    uri: z.string().describe('Full URI for the property'),
    label: z.string().optional().describe('Human-readable label'),
    domain: z.array(z.string()).describe('URIs of domain classes'),
    range: z.string().describe('XSD datatype URI (e.g. http://www.w3.org/2001/XMLSchema#string)')
  },
  async (args) => {
    sendToRenderer('claude:add-datatype-property', args)
    return { content: [{ type: 'text' as const, text: `Datatype property ${args.uri} added` }] }
  }
)

const modifyClass = tool(
  'modify_class',
  'Modify an existing class (update label, comment, or subClassOf)',
  {
    uri: z.string().describe('URI of the class to modify'),
    label: z.string().optional().describe('New label'),
    comment: z.string().optional().describe('New comment'),
    subClassOf: z.array(z.string()).optional().describe('Replace subClassOf list')
  },
  async (args) => {
    const { uri, ...changes } = args
    sendToRenderer('claude:modify-class', uri, changes)
    return { content: [{ type: 'text' as const, text: `Class ${uri} modified` }] }
  }
)

const removeElement = tool(
  'remove_element',
  'Remove a class or property from the ontology by URI',
  {
    uri: z.string().describe('URI of the element to remove'),
    type: z.enum(['class', 'objectProperty', 'datatypeProperty']).describe('Type of element')
  },
  async (args) => {
    sendToRenderer('claude:remove-element', args.uri, args.type)
    return { content: [{ type: 'text' as const, text: `${args.type} ${args.uri} removed` }] }
  }
)

const validateOntology = tool(
  'validate_ontology',
  'Run validation on the current ontology and return any errors or warnings',
  {},
  async () => {
    return new Promise((resolve) => {
      const win = getMainWindow()
      if (!win) {
        resolve({ content: [{ type: 'text' as const, text: 'No window available' }], isError: true })
        return
      }
      ipcMain.handleOnce('claude:validation-response', (_event, errors: string) => {
        resolve({ content: [{ type: 'text' as const, text: errors }] })
      })
      win.webContents.send('claude:validate')
    })
  }
)

const ontographServer = createSdkMcpServer({
  name: 'ontograph',
  version: '0.1.0',
  tools: [
    getCurrentOntology,
    generateOntology,
    addClass,
    addObjectProperty,
    addDatatypeProperty,
    modifyClass,
    removeElement,
    validateOntology
  ]
})

const SYSTEM_PROMPT = `You are an ontology engineering assistant integrated into Ontograph, a visual OWL ontology editor. You help users create, modify, and refine OWL ontologies.

Key guidelines:
- When creating ontologies, use a consistent namespace prefix (e.g. http://example.org/ontology#)
- Always include rdfs:label for all classes and properties
- Add rdfs:comment to describe the purpose of each element
- Use standard XSD datatypes for datatype properties (xsd:string, xsd:integer, xsd:boolean, xsd:date, xsd:dateTime, xsd:float, xsd:decimal, xsd:anyURI)
- Create meaningful object properties to connect classes
- Consider subclass hierarchies to organize classes
- Keep ontologies focused and practical for knowledge graph extraction

When the user asks you to create an ontology:
1. First call get_current_ontology to see what exists
2. Use generate_ontology for initial creation (provide complete valid Turtle)
3. Use granular tools (add_class, add_object_property, etc.) for modifications

Always include necessary prefix declarations in generated Turtle:
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .`

const ALL_TOOLS = [
  'mcp__ontograph__get_current_ontology',
  'mcp__ontograph__generate_ontology',
  'mcp__ontograph__add_class',
  'mcp__ontograph__add_object_property',
  'mcp__ontograph__add_datatype_property',
  'mcp__ontograph__modify_class',
  'mcp__ontograph__remove_element',
  'mcp__ontograph__validate_ontology'
]

export function registerClaudeIPC(): void {
  let sessionId: string | undefined

  // Detect Claude CLI on startup and expose result to renderer
  detectClaudeCli().then((result) => {
    detectedClaudePath = result.path
  })

  ipcMain.handle('claude:detect-cli', async () => {
    if (detectedClaudePath) return { installed: true, path: detectedClaudePath }
    const result = await detectClaudeCli()
    detectedClaudePath = result.path
    return result
  })

  ipcMain.handle('claude:send-message', async (_event, message: string, auth: AuthConfig, modelOptions?: { model?: string; thinkingBudgetTokens?: number }) => {
    // Abort any previous query
    if (currentAbort) {
      currentAbort.abort()
    }
    currentAbort = new AbortController()

    try {
      const authOptions =
        auth.mode === 'api-key' && auth.key
          ? { env: { ...process.env, ANTHROPIC_API_KEY: auth.key } }
          : {
              pathToClaudeCodeExecutable: auth.binaryPath || detectedClaudePath || 'claude',
              env: process.env
            }

      const options: Record<string, unknown> = {
        mcpServers: { ontograph: ontographServer },
        allowedTools: ALL_TOOLS,
        disallowedTools: [
          'Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep',
          'Agent', 'NotebookEdit', 'WebFetch', 'WebSearch'
        ],
        systemPrompt: SYSTEM_PROMPT,
        maxTurns: 20,
        abortController: currentAbort,
        persistSession: true,
        ...(sessionId ? { resume: sessionId } : {}),
        ...(modelOptions?.model ? { model: modelOptions.model } : {}),
        ...(modelOptions?.thinkingBudgetTokens ? { thinkingBudgetTokens: modelOptions.thinkingBudgetTokens } : {}),
        ...authOptions
      }

      for await (const msg of query({ prompt: message, options: options as never })) {
        if (msg.type === 'system' && msg.subtype === 'init') {
          sessionId = msg.session_id
        }

        if (msg.type === 'assistant') {
          // Extract text content
          const textBlocks = msg.message.content.filter(
            (b: { type: string }) => b.type === 'text'
          )
          const text = textBlocks.map((b: { text: string }) => b.text).join('')
          if (text) {
            sendToRenderer('claude:assistant-text', text)
          }

          // Extract tool use
          const toolBlocks = msg.message.content.filter(
            (b: { type: string }) => b.type === 'tool_use'
          )
          for (const tb of toolBlocks) {
            sendToRenderer('claude:tool-use', (tb as { name: string }).name, (tb as { input: unknown }).input)
          }
        }

        if (msg.type === 'result') {
          if (msg.subtype === 'success') {
            sendToRenderer('claude:result', msg.result, msg.total_cost_usd)
          } else {
            sendToRenderer('claude:error', msg.errors?.join(', ') || 'Unknown error')
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name !== 'AbortError') {
        sendToRenderer('claude:error', (err as Error).message || 'Failed to communicate with Claude')
      }
    } finally {
      currentAbort = null
    }
  })

  ipcMain.handle('claude:abort', () => {
    if (currentAbort) {
      currentAbort.abort()
      currentAbort = null
    }
  })

  ipcMain.handle('claude:reset-session', () => {
    sessionId = undefined
  })
}
