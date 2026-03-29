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

  it('renders search bar', () => {
    render(<Toolbar />)
    expect(screen.getByPlaceholderText('Search label, URI, comment…')).toBeInTheDocument()
  })

  it('renders theme toggle', () => {
    render(<Toolbar />)
    expect(screen.getByTitle('Toggle theme')).toBeInTheDocument()
  })

  it('renders Claude settings button', () => {
    render(<Toolbar />)
    expect(screen.getByTitle('Claude settings')).toBeInTheDocument()
  })

  it('renders sidebar toggle', () => {
    render(<Toolbar />)
    expect(screen.getByTitle('Toggle sidebar')).toBeInTheDocument()
  })
})
