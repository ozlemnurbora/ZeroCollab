export function Button({
  className = '',
  variant = 'primary',
  size = 'md',
  type = 'button',
  ...props
}) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 disabled:opacity-50 disabled:pointer-events-none'

  const variants = {
    primary:
      'bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800 shadow-sm',
    secondary:
      'bg-slate-200 text-slate-800 hover:bg-slate-300 active:bg-slate-400 border border-slate-300 dark:bg-[rgb(var(--zc-border))] dark:text-[rgb(var(--zc-text))] dark:hover:bg-[rgb(var(--zc-border)/0.85)] dark:active:bg-[rgb(var(--zc-border))] dark:border-[rgb(var(--zc-border))]',
    ghost:
      'text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200 dark:text-[rgb(var(--zc-muted))] dark:hover:bg-[rgb(var(--zc-border)/0.7)] dark:hover:text-[rgb(var(--zc-text))] dark:active:bg-[rgb(var(--zc-border)/0.6)]',
    danger:
      'bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800 shadow-sm',
  }

  const sizes = {
    sm: 'h-8 px-3 text-sm',
    md: 'h-9 px-3.5 text-sm',
    lg: 'h-10 px-4 text-sm',
  }

  const variantClasses = variants[variant] ?? variants.primary
  const sizeClasses = sizes[size] ?? sizes.md

  return (
    <button
      type={type}
      className={`${base} ${variantClasses} ${sizeClasses} ${className}`}
      {...props}
    />
  )
}

