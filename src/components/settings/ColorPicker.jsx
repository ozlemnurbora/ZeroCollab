export function ColorPicker({ label, colors, value, onChange }) {
  return (
    <div>
      <p className="text-sm font-medium text-[rgb(var(--zc-muted))]">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {colors.map((c) => {
          const selected = c.value === value
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onChange?.(c.value)}
              className={[
                'h-9 w-9 rounded-lg ring-1 ring-inset transition',
                selected ? 'ring-2 ring-indigo-500/60' : 'ring-[rgb(var(--zc-border))]',
              ].join(' ')}
              style={{ backgroundColor: c.value }}
              title={c.label}
            >
              <span className="sr-only">{c.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

