import { Minus, Plus } from 'lucide-react'
import { clamp } from '../utils'

export default function QuantitySelector({ value, onChange, min = 0, max = 99, size = 'md' }) {
  const btnCls = size === 'sm'
    ? 'w-7 h-7 rounded-lg text-sm'
    : 'w-9 h-9 rounded-xl text-base'

  const countCls = size === 'sm' ? 'w-6 text-sm' : 'w-8 text-base'

  return (
    <div className="inline-flex items-center gap-2">
      <button
        onClick={() => onChange(clamp(value - 1, min, max))}
        disabled={value <= min}
        className={[
          btnCls,
          'flex items-center justify-center font-bold transition-colors',
          'bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700',
          'text-stone-700 dark:text-stone-300',
          'disabled:opacity-30 disabled:cursor-not-allowed',
        ].join(' ')}
      >
        <Minus size={size === 'sm' ? 12 : 14} />
      </button>

      <span className={`${countCls} text-center font-semibold text-stone-900 dark:text-stone-100`}>
        {value}
      </span>

      <button
        onClick={() => onChange(clamp(value + 1, min, max))}
        disabled={value >= max}
        className={[
          btnCls,
          'flex items-center justify-center font-bold transition-colors',
          'bg-[#1a3a2a] hover:bg-[#2d5a42] text-white',
          'disabled:opacity-30 disabled:cursor-not-allowed',
        ].join(' ')}
      >
        <Plus size={size === 'sm' ? 12 : 14} />
      </button>
    </div>
  )
}
