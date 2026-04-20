const variants = {
  default:  'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300',
  success:  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
  warning:  'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  danger:   'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
  info:     'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-400',
  accent:   'bg-[#c9a84c]/15 text-[#8a6f2e] dark:bg-[#c9a84c]/20 dark:text-[#e2c47a]',
  primary:  'bg-[#1a3a2a]/10 text-[#1a3a2a] dark:bg-[#1a3a2a]/30 dark:text-[#7ab89a]',
}

export default function Badge({ children, variant = 'default', className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${variants[variant]} ${className}`}>
      {children}
    </span>
  )
}
