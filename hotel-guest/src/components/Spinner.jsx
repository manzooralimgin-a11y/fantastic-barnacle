import { Loader2 } from 'lucide-react'

export default function Spinner({ size = 24, className = '' }) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <Loader2 size={size} className="animate-spin text-[#1a3a2a] dark:text-[#7ab89a]" />
    </div>
  )
}

export function FullPageSpinner() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-stone-50 dark:bg-stone-950 z-50">
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-[#1a3a2a] flex items-center justify-center shadow-lg">
          <Loader2 size={28} className="animate-spin text-[#c9a84c]" />
        </div>
        <p className="text-sm text-stone-400 dark:text-stone-500">Loading…</p>
      </div>
    </div>
  )
}
