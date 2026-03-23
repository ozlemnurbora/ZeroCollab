export function CallButton({ onClick, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-9 rounded-md bg-emerald-500/90 px-3 text-xs font-medium text-white shadow-sm transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/40"
    >
      Call
    </button>
  )
}
