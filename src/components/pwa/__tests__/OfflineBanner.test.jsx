import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

vi.mock('../../../utils/LanguageContext.jsx', () => ({
  useLanguage: () => ({
    t: (key) => {
      const map = {
        offline_banner: 'You are currently offline.',
        offline_badge: 'OFFLINE',
      }
      return map[key] || key
    },
    lang: 'en',
  }),
}))

import { OfflineBanner } from '../OfflineBanner.jsx'

describe('OfflineBanner', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true })
  })

  it('renders nothing when browser is online', () => {
    const { container } = render(<OfflineBanner />)
    expect(container.innerHTML).toBe('')
  })

  it('renders offline banner when browser is offline', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true })
    render(<OfflineBanner />)
    expect(screen.getByText('You are currently offline.')).toBeInTheDocument()
  })

  it('renders OFFLINE badge when offline', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true })
    render(<OfflineBanner />)
    expect(screen.getByText('OFFLINE')).toBeInTheDocument()
  })

  it('shows banner when going from online to offline', () => {
    render(<OfflineBanner />)
    expect(screen.queryByText('OFFLINE')).not.toBeInTheDocument()
    act(() => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true })
      window.dispatchEvent(new Event('offline'))
    })
    expect(screen.getByText('OFFLINE')).toBeInTheDocument()
  })

  it('hides banner when going from offline to online', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true })
    render(<OfflineBanner />)
    expect(screen.getByText('OFFLINE')).toBeInTheDocument()
    act(() => {
      Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true })
      window.dispatchEvent(new Event('online'))
    })
    expect(screen.queryByText('OFFLINE')).not.toBeInTheDocument()
  })
})
