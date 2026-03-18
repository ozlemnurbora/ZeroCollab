import { useEffect, useRef, useState } from 'react'
import { Button } from '../ui/Button.jsx'

export function MessageComposer({ disabled, onSend, placeholder }) {
  const [text, setText] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const canSend = !disabled && text.trim().length > 0

  const send = () => {
    if (!canSend) return
    const value = text.trim()
    setText('')
    onSend?.(value)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  return (
    <div className="border-t border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.3)] px-4 py-3">
      <div className="flex items-end gap-2">
        <textarea
          ref={inputRef}
          rows={1}
          value={text}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          className="max-h-36 min-h-[42px] w-full resize-none rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-50"
        />
        <Button onClick={send} disabled={!canSend}>
          Send
        </Button>
      </div>
      <p className="mt-2 text-xs text-[rgb(var(--zc-subtle))]">
        Press Enter to send • Shift+Enter for a new line
      </p>
    </div>
  )
}

