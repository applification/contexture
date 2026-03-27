import { ElectronAPI } from '@electron-toolkit/preload'

export interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error'
  version?: string
  progress?: number
  error?: string
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      // File operations
      openFile: () => Promise<{ filePath: string; content: string } | null>
      saveFile: (filePath: string, content: string) => Promise<boolean>
      saveFileAs: (content: string) => Promise<string | null>
      readFileSilent: (filePath: string) => Promise<string | null>
      getRecentFiles: () => Promise<string[]>
      openRecentFile: (filePath: string) => Promise<{ filePath: string; content: string } | null>

      // Menu events
      onMenuFileOpen: (callback: () => void) => () => void
      onMenuFileSave: (callback: () => void) => () => void
      onMenuFileSaveAs: (callback: () => void) => () => void

      // Claude operations
      detectClaudeCli: () => Promise<{ installed: boolean; path: string | null }>
      sendMessage: (
        message: string,
        auth: { mode: 'api-key'; key: string } | { mode: 'max'; binaryPath?: string },
        modelOptions?: { model?: string; thinkingBudgetTokens?: number }
      ) => Promise<void>
      abortClaude: () => Promise<void>
      resetSession: () => Promise<void>

      // Claude events
      onClaudeAssistantText: (callback: (text: string) => void) => () => void
      onClaudeToolUse: (callback: (toolName: string, input: unknown) => void) => () => void
      onClaudeResult: (callback: (result: string, cost: number) => void) => () => void
      onClaudeError: (callback: (error: string) => void) => () => void

      // Claude tool callbacks
      onClaudeGetOntology: (callback: () => void) => () => void
      onClaudeLoadOntology: (callback: (turtle: string) => void) => () => void
      onClaudeAddClass: (callback: (args: { uri: string; label?: string; comment?: string; subClassOf?: string[] }) => void) => () => void
      onClaudeAddObjectProperty: (callback: (args: { uri: string; label?: string; comment?: string; domain: string[]; range: string[] }) => void) => () => void
      onClaudeAddDatatypeProperty: (callback: (args: { uri: string; label?: string; domain: string[]; range: string }) => void) => () => void
      onClaudeModifyClass: (callback: (uri: string, changes: Record<string, unknown>) => void) => () => void
      onClaudeRemoveElement: (callback: (uri: string, type: string) => void) => () => void
      onClaudeValidate: (callback: () => void) => () => void

      // Respond to main process
      respondOntology: (turtle: string) => void
      respondValidation: (errors: string) => void

      // Update operations
      checkForUpdate: () => Promise<void>
      downloadUpdate: () => Promise<void>
      installUpdate: () => void
      openReleasesPage: () => void
      getUpdateState: () => Promise<UpdateState>
      onUpdateState: (callback: (state: UpdateState) => void) => () => void
    }
  }
}
