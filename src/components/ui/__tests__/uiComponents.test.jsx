import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Button } from '../Button.jsx'
import { Modal } from '../Modal.jsx'

describe('Button', () => {
  it('renders with children text', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByText('Click me')).toBeInTheDocument()
  })

  it('renders as a button element with type="button" by default', () => {
    render(<Button>Test</Button>)
    const btn = screen.getByText('Test')
    expect(btn.tagName).toBe('BUTTON')
    expect(btn).toHaveAttribute('type', 'button')
  })

  it('applies primary variant classes by default', () => {
    render(<Button>Primary</Button>)
    expect(screen.getByText('Primary').className).toContain('bg-indigo-500')
  })

  it('applies secondary variant classes', () => {
    render(<Button variant="secondary">Secondary</Button>)
    expect(screen.getByText('Secondary').className).toContain('border')
  })

  it('applies danger variant classes', () => {
    render(<Button variant="danger">Delete</Button>)
    expect(screen.getByText('Delete').className).toContain('bg-rose-600')
  })

  it('handles onClick', () => {
    const handleClick = vi.fn()
    render(<Button onClick={handleClick}>Click</Button>)
    fireEvent.click(screen.getByText('Click'))
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('can be disabled', () => {
    render(<Button disabled>Disabled</Button>)
    expect(screen.getByText('Disabled')).toBeDisabled()
  })

  it('applies size classes', () => {
    render(<Button size="sm">Small</Button>)
    expect(screen.getByText('Small').className).toContain('h-8')
  })

  it('applies ghost variant classes', () => {
    render(<Button variant="ghost">Ghost</Button>)
    expect(screen.getByText('Ghost').className).toContain('text-[rgb(var(--zc-muted))]')
  })
})

describe('Modal', () => {
  it('renders nothing when open is false', () => {
    const { container } = render(<Modal open={false} title="Test"><p>Content</p></Modal>)
    expect(container.innerHTML).toBe('')
  })

  it('renders title and children when open is true', () => {
    render(<Modal open={true} title="My Modal"><p>Hello World</p></Modal>)
    expect(screen.getByText('My Modal')).toBeInTheDocument()
    expect(screen.getByText('Hello World')).toBeInTheDocument()
  })

  it('renders footer when provided', () => {
    render(<Modal open={true} title="Test" footer={<button>Save</button>}><p>Body</p></Modal>)
    expect(screen.getByText('Save')).toBeInTheDocument()
  })

  it('does not render footer when not provided', () => {
    render(<Modal open={true} title="Test"><p>Body</p></Modal>)
    expect(screen.queryByText('Save')).not.toBeInTheDocument()
  })

  it('has role dialog and aria-modal true', () => {
    render(<Modal open={true} title="Accessible"><p>Test</p></Modal>)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('calls onClose when Escape key is pressed', () => {
    const handleClose = vi.fn()
    render(<Modal open={true} onClose={handleClose} title="Esc Test"><p>Content</p></Modal>)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(handleClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when close button is clicked', () => {
    const handleClose = vi.fn()
    render(<Modal open={true} onClose={handleClose} title="Close Btn"><p>Content</p></Modal>)
    fireEvent.click(screen.getByText('✕'))
    expect(handleClose).toHaveBeenCalled()
  })
})
