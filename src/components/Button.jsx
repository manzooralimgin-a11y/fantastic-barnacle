import { Loader2 } from 'lucide-react'

const variants = {
  primary:   'bg-[#1a3a2a] hover:bg-[#2d5a42] text-white shadow-sm',
  secondary: 'bg-stone-100 hover:bg-stone-200 text-stone-800 dark:bg-stone-800 dark:hover:bg-stone-700 dark:text-stone-100',
  accent:    'bg-[#c9a84c] hover:bg-[#b8973b] text-white shadow-sm',
  ghost:     'hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300',
  danger:    'bg-red-600 hover:bg-red-700 text-white shadow-sm',
  outline:   'border border-stone-300 dark:border-stone-600 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300',
}

const sizes = {
  sm:   'h-8  px-3 text-sm  rounded-lg  gap-1.5',
  md:   'h-11 px-4 text-sm  rounded-xl  gap-2',
  lg:   'h-13 px-6 text-base rounded-2xl gap-2.5',
  icon: 'h-11 w-11         rounded-xl',
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  className = '',
  icon: Icon,
  iconRight: IconRight,
  ...props
}) {
  return (
    <button
      disabled={disabled || loading}
      className={[
        'inline-flex items-center justify-center font-medium transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c] focus-visible:ring-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]',
        variants[variant],
        sizes[size],
        fullWidth ? 'w-full' : '',
        className,
      ].join(' ')}
      {...props}
    >
      {loading ? (
        <Loader2 size={16} className="animate-spin shrink-0" />
      ) : Icon ? (
        <Icon size={16} className="shrink-0" />
      ) : null}
      {children && <span>{children}</span>}
      {IconRight && !loading && <IconRight size={16} className="shrink-0" />}
    </button>
  )
}
