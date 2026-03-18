export function SectionCard({ title, subtitle, children, actions }) {
  return (
    <section className="rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.3)]">
      <header className="flex flex-col gap-2 border-b border-[rgb(var(--zc-border))] px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[rgb(var(--zc-text))]">
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

