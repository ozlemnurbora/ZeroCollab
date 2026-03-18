export function Toggle({ checked, onChange, label, description }) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.4)] px-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-[rgb(var(--zc-text))]">
          {label}
        </p>
        {description ? (
          <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
            {description}
          </p>
        ) : null}
      </div>

      <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={!!checked}
          onChange={(e) => onChange?.(e.target.checked)}
        />
        <span className="absolute inset-0 rounded-full bg-[rgb(var(--zc-border))] ring-1 ring-inset ring-[rgb(var(--zc-border))] transition peer-checked:bg-indigo-500/60 peer-checked:ring-indigo-400/30" />
        <span className="absolute left-1 h-4 w-4 rounded-full bg-white/90 transition peer-checked:translate-x-5" />
      </span>
    </label>
  )
}

