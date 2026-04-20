import { useState, useEffect } from 'react'
import { Clock, LogOut, RefreshCw } from 'lucide-react'
import { useApp } from '../context/AppContext'
import Button from './Button'

const WARNING_COUNTDOWN = 2 * 60  // 2 minutes shown in countdown

export default function SessionTimeoutModal() {
  const { sessionWarning, extendSession, logout } = useApp()
  const [secondsLeft, setSecondsLeft] = useState(WARNING_COUNTDOWN)

  // Reset & start countdown whenever warning appears
  useEffect(() => {
    if (!sessionWarning) { setSecondsLeft(WARNING_COUNTDOWN); return }

    setSecondsLeft(WARNING_COUNTDOWN)
    const interval = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) { clearInterval(interval); return 0 }
        return s - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [sessionWarning])

  if (!sessionWarning) return null

  const minutes = Math.floor(secondsLeft / 60)
  const seconds = secondsLeft % 60
  const pct     = (secondsLeft / WARNING_COUNTDOWN) * 100

  // Circumference of the SVG ring
  const R = 28
  const circ = 2 * Math.PI * R

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-5">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Card */}
      <div className="relative z-10 w-full max-w-sm bg-white dark:bg-stone-900 rounded-3xl shadow-2xl overflow-hidden">
        {/* Top accent bar */}
        <div
          className="h-1 bg-amber-400 transition-all duration-1000"
          style={{ width: `${pct}%` }}
        />

        <div className="p-6 flex flex-col items-center text-center gap-5">
          {/* Countdown ring */}
          <div className="relative w-20 h-20 flex items-center justify-center">
            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 64 64">
              {/* track */}
              <circle cx="32" cy="32" r={R} fill="none" stroke="currentColor"
                className="text-stone-100 dark:text-stone-800" strokeWidth="4" />
              {/* progress */}
              <circle
                cx="32" cy="32" r={R} fill="none"
                stroke="currentColor"
                className={secondsLeft <= 30 ? 'text-red-500' : 'text-amber-400'}
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={circ}
                strokeDashoffset={circ * (1 - pct / 100)}
                style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
              />
            </svg>
            <div className="relative flex flex-col items-center leading-none">
              <span className={`text-xl font-bold tabular-nums ${secondsLeft <= 30 ? 'text-red-500' : 'text-stone-900 dark:text-stone-100'}`}>
                {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
              </span>
            </div>
          </div>

          {/* Text */}
          <div>
            <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">
              Still there?
            </h2>
            <p className="text-sm text-stone-500 dark:text-stone-400 mt-1.5 leading-relaxed">
              For your security, your session will automatically expire due to inactivity.
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 w-full">
            <Button
              fullWidth
              size="lg"
              icon={RefreshCw}
              onClick={extendSession}
            >
              Continue My Session
            </Button>
            <Button
              fullWidth
              variant="ghost"
              size="md"
              icon={LogOut}
              onClick={logout}
            >
              Sign Out Now
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
