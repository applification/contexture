import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mock scrollIntoView for jsdom
Element.prototype.scrollIntoView = vi.fn();

// Mock ResizeObserver for jsdom
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

const noop = () => () => {};

// Mock window.api (Electron preload bridge)
Object.defineProperty(window, 'api', {
  value: {
    openFile: vi.fn().mockResolvedValue(null),
    saveFile: vi.fn().mockResolvedValue(true),
    saveFileAs: vi.fn().mockResolvedValue(null),
    readFileSilent: vi.fn().mockResolvedValue(null),

    onMenuFileOpen: vi.fn(noop),
    onMenuFileSave: vi.fn(noop),
    onMenuFileSaveAs: vi.fn(noop),

    detectClaudeCli: vi.fn().mockResolvedValue({ installed: false, path: null }),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    abortClaude: vi.fn().mockResolvedValue(undefined),
    resetSession: vi.fn().mockResolvedValue(undefined),

    onClaudeAssistantText: vi.fn(noop),
    onClaudeToolUse: vi.fn(noop),
    onClaudeResult: vi.fn(noop),
    onClaudeError: vi.fn(noop),
    onClaudeGetOntology: vi.fn(noop),
    onClaudeLoadOntology: vi.fn(noop),
    onClaudeAddClass: vi.fn(noop),
    onClaudeAddObjectProperty: vi.fn(noop),
    onClaudeAddDatatypeProperty: vi.fn(noop),
    onClaudeModifyClass: vi.fn(noop),
    onClaudeRemoveElement: vi.fn(noop),
    onClaudeValidate: vi.fn(noop),
    onClaudeGraphQuery: vi.fn(noop),

    respondOntology: vi.fn(),
    respondValidation: vi.fn(),
    respondGraphQuery: vi.fn(),

    runEval: vi.fn(),
    abortEval: vi.fn(),
    onEvalText: vi.fn(noop),
    onEvalResult: vi.fn(noop),
    onEvalError: vi.fn(noop),

    checkForUpdate: vi.fn().mockResolvedValue(undefined),
    downloadUpdate: vi.fn().mockResolvedValue(undefined),
    installUpdate: vi.fn(),
    openReleasesPage: vi.fn(),
    getUpdateState: vi.fn().mockResolvedValue({ status: 'idle' }),
    onUpdateState: vi.fn(noop),
  },
  writable: true,
});
