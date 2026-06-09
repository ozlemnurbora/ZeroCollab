const ACCENTS = {
  indigo: { border: 'border-l-indigo-500', title: 'text-indigo-600' },
  emerald: { border: 'border-l-emerald-500', title: 'text-emerald-600' },
  violet: { border: 'border-l-violet-500', title: 'text-violet-600' },
  amber: { border: 'border-l-amber-500', title: 'text-amber-600' },
  rose: { border: 'border-l-rose-600', title: 'text-rose-600' },
}

export function SectionCard({ title, subtitle, children, actions, accent = 'indigo' }) {
  const a = ACCENTS[accent] || ACCENTS.indigo
  return (
    <section className={`rounded-xl border border-l-4 ${a.border} border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.3)]`}>
      <header className="flex flex-col gap-2 border-b border-[rgb(var(--zc-border))] px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className={`text-sm font-semibold ${a.title}`}>
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
              {subtitle}
            </p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </header>
      <div className="px-4 py-4">{children}</div>
    </section>
  )
}

