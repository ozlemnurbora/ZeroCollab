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
      'bg-indigo-500 text-white hover:bg-indigo-400 active:bg-indigo-500/90',
    secondary:
      'bg-[rgb(var(--zc-border))] text-[rgb(var(--zc-text))] hover:bg-[rgb(var(--zc-border)/0.85)] active:bg-[rgb(var(--zc-border))] border border-[rgb(var(--zc-border))]',
    ghost:
      'text-[rgb(var(--zc-muted))] hover:bg-[rgb(var(--zc-border)/0.7)] hover:text-[rgb(var(--zc-text))] active:bg-[rgb(var(--zc-border)/0.6)]',
    danger:
      'bg-rose-600 text-white hover:bg-rose-500 active:bg-rose-600/90',
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

