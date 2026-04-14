export default function Input({
  label,
  error,
  hint,
  icon: Icon,
  className = '',
  ...props
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label className="text-sm font-medium text-stone-700 dark:text-stone-300">
          {label}
        </label>
      )}
      <div className="relative">
        {Icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400">
            <Icon size={16} />
          </div>
        )}
        <input
          className={[
            'w-full h-11 rounded-xl border text-sm transition-colors',
            'bg-white dark:bg-stone-800',
            'text-stone-900 dark:text-stone-100 placeholder:text-stone-400',
            'focus:outline-none focus:ring-2 focus:ring-[#c9a84c] focus:border-transparent',
            error
              ? 'border-red-400 dark:border-red-500'
              : 'border-stone-200 dark:border-stone-700 hover:border-stone-300 dark:hover:border-stone-600',
            Icon ? 'pl-9 pr-4' : 'px-4',
          ].join(' ')}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      {hint && !error && <p className="text-xs text-stone-400">{hint}</p>}
    </div>
  )
}

export function Textarea({ label, error, hint, className = '', ...props }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label className="text-sm font-medium text-stone-700 dark:text-stone-300">
          {label}
        </label>
      )}
      <textarea
        rows={4}
        className={[
          'w-full rounded-xl border text-sm transition-colors resize-none p-3',
          'bg-white dark:bg-stone-800',
          'text-stone-900 dark:text-stone-100 placeholder:text-stone-400',
          'focus:outline-none focus:ring-2 focus:ring-[#c9a84c] focus:border-transparent',
          error
            ? 'border-red-400 dark:border-red-500'
            : 'border-stone-200 dark:border-stone-700 hover:border-stone-300 dark:hover:border-stone-600',
        ].join(' ')}
        {...props}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      {hint && !error && <p className="text-xs text-stone-400">{hint}</p>}
    </div>
  )
}
