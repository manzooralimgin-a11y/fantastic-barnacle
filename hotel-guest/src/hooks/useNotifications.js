import { useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { notificationsApi } from '../services/api'

/**
 * Loads notifications on mount and polls every 60 seconds while the guest is logged in.
 */
export function useNotifications() {
  const { guest, setNotifications, markRead, markAllRead } = useApp()

  useEffect(() => {
    if (!guest) return

    const load = async () => {
      try {
        const list = await notificationsApi.getNotifications()
        setNotifications(list)
      } catch {
        // silently ignore polling errors
      }
    }

    load()
    const interval = setInterval(load, 60_000)
    return () => clearInterval(interval)
  }, [guest, setNotifications])

  const handleMarkRead = async (id) => {
    await notificationsApi.markRead(id).catch(() => {})
    markRead(id)
  }

  const handleMarkAllRead = async () => {
    await notificationsApi.markAllRead().catch(() => {})
    markAllRead()
  }

  return { handleMarkRead, handleMarkAllRead }
}
