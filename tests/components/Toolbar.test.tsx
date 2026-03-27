import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

// Mock streamdown before importing Toolbar (it uses useClaude which uses ChatPanel dependencies)
vi.mock('streamdown', () => ({
  Streamdown: ({ children }: { children: string }) => <span>{children}</span>
}))
vi.mock('@streamdown/code', () => ({ code: {} }))

const { Toolbar } = await import('@renderer/components/toolbar/Toolbar')

describe('Toolbar', () => {
  afterEach(cleanup)

  it('renders file operation buttons', () => {
    render(<Toolbar onNew={() => {}} onOpen={() => {}} onSave={() => {}} onSaveAs={() => {}} />)
    expect(screen.getByTitle('New ontology')).toBeInTheDocument()
    expect(screen.getByTitle('Open (⌘O)')).toBeInTheDocument()
    expect(screen.getByTitle('Save (⌘S)')).toBeInTheDocument()
    expect(screen.getByTitle('Save As (⇧⌘S)')).toBeInTheDocument()
  })

  it('renders theme toggle', () => {
    render(<Toolbar onNew={() => {}} onOpen={() => {}} onSave={() => {}} onSaveAs={() => {}} />)
    expect(screen.getByTitle('Toggle theme')).toBeInTheDocument()
  })

  it('renders Claude settings button', () => {
    render(<Toolbar onNew={() => {}} onOpen={() => {}} onSave={() => {}} onSaveAs={() => {}} />)
    expect(screen.getByTitle('Claude settings')).toBeInTheDocument()
  })

  it('renders sidebar toggle', () => {
    render(<Toolbar onNew={() => {}} onOpen={() => {}} onSave={() => {}} onSaveAs={() => {}} />)
    expect(screen.getByTitle('Toggle sidebar')).toBeInTheDocument()
  })

  it('renders search bar', () => {
    render(<Toolbar onNew={() => {}} onOpen={() => {}} onSave={() => {}} onSaveAs={() => {}} />)
    expect(screen.getByPlaceholderText('Search label, URI, comment…')).toBeInTheDocument()
  })
})
