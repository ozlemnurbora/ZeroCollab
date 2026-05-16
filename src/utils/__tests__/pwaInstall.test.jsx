import { describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePwaInstallPrompt } from '../pwaInstall.js'

describe('usePwaInstallPrompt', () => {
  it('initially returns canInstall false', () => {
    const { result } = renderHook(() => usePwaInstallPrompt())
    expect(result.current.canInstall).toBe(false)
  })

  it('initially returns isInstalled false in non-standalone mode', () => {
    const { result } = renderHook(() => usePwaInstallPrompt())
    expect(result.current.isInstalled).toBe(false)
  })

  it('promptInstall returns dismissed when no deferred prompt', async () => {
    const { result } = renderHook(() => usePwaInstallPrompt())
    const choice = await result.current.promptInstall()
    expect(choice.outcome).toBe('dismissed')
  })

  it('sets canInstall true when beforeinstallprompt fires', () => {
    const { result } = renderHook(() => usePwaInstallPrompt())
    const mockEvent = new Event('beforeinstallprompt')
    mockEvent.preventDefault = vi.fn()
    mockEvent.prompt = vi.fn().mockResolvedValue(undefined)
    mockEvent.userChoice = Promise.resolve({ outcome: 'accepted' })

    act(() => {
      window.dispatchEvent(mockEvent)
    })

    expect(result.current.canInstall).toBe(true)
  })

  it('detects installed state when appinstalled fires', () => {
    // Mock standalone display mode
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: query === '(display-mode: standalone)',
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    })

    const { result } = renderHook(() => usePwaInstallPrompt())

    act(() => {
      window.dispatchEvent(new Event('appinstalled'))
    })

    expect(result.current.isInstalled).toBe(true)
  })
})
