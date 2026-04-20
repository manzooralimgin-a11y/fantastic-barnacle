import { useEffect } from 'react'
import { X } from 'lucide-react'

export default function Modal({ open, onClose, title, children, className = '' }) {
  // Lock body scroll when open
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else      document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Sheet */}
      <div className={[
        'relative z-10 w-full sm:max-w-md bg-white dark:bg-stone-900',
        'rounded-t-3xl sm:rounded-3xl shadow-2xl',
        'max-h-[90dvh] overflow-y-auto',
        className,
      ].join(' ')}>
        {/* Handle (mobile) */}
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-stone-200 dark:bg-stone-700" />
        </div>

        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100 dark:border-stone-800">
            <h2 className="font-semibold text-lg text-stone-900 dark:text-stone-100">{title}</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors text-stone-400"
            >
              <X size={18} />
            </button>
          </div>
        )}

        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
