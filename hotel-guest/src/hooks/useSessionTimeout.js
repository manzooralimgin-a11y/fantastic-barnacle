import { useEffect, useRef, useCallback } from 'react'

const TIMEOUT_MS = 15 * 60 * 1000   // 15 minutes → auto-logout
const WARNING_MS = 13 * 60 * 1000   // 13 minutes → show warning

const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'click']

/**
 * Tracks user inactivity. Calls onWarning at 13 min, onExpire at 15 min.
 * Resets the clock on any user interaction while authenticated.
 */
export function useSessionTimeout({ isAuthenticated, onWarning, onExpire, onActivity }) {
  const warningTimer = useRef(null)
  const expireTimer  = useRef(null)

  const clearTimers = useCallback(() => {
    clearTimeout(warningTimer.current)
    clearTimeout(expireTimer.current)
  }, [])

  const reset = useCallback(() => {
    clearTimers()
    if (!isAuthenticated) return
    onActivity?.()
    warningTimer.current = setTimeout(onWarning, WARNING_MS)
    expireTimer.current  = setTimeout(onExpire,  TIMEOUT_MS)
  }, [isAuthenticated, onWarning, onExpire, onActivity, clearTimers])

  useEffect(() => {
    if (!isAuthenticated) { clearTimers(); return }

    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, reset, { passive: true }))
    reset()

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, reset))
      clearTimers()
    }
  }, [isAuthenticated, reset, clearTimers])
}
