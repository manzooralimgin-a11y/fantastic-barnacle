export default function Card({ children, className = '', onClick, padding = true }) {
  const base = [
    'bg-white dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-100 dark:border-stone-800',
    padding ? 'p-4' : '',
    onClick ? 'cursor-pointer hover:shadow-md active:scale-[0.99] transition-all duration-150' : '',
    className,
  ].join(' ')

  return onClick
    ? <div className={base} onClick={onClick} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onClick()}>{children}</div>
    : <div className={base}>{children}</div>
}
