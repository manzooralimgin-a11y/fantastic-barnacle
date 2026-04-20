import { Bell, Info, ShoppingBag, CalendarCheck, CheckCheck } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useNotifications } from '../hooks/useNotifications'
import TopBar from '../components/TopBar'
import BottomNav from '../components/BottomNav'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import { ROUTES } from '../constants'
import { formatTime } from '../utils'

const TYPE_META = {
  info:    { icon: Info,           color: 'text-sky-500',   bg: 'bg-sky-50 dark:bg-sky-900/20' },
  order:   { icon: ShoppingBag,    color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20' },
  booking: { icon: CalendarCheck,  color: 'text-violet-500',bg: 'bg-violet-50 dark:bg-violet-900/20' },
}

export default function NotificationsScreen() {
  const { notifications, unreadCount } = useApp()
  const { handleMarkRead, handleMarkAllRead } = useNotifications()

  return (
    <div className="flex flex-col min-h-dvh bg-stone-50 dark:bg-stone-950">
      <TopBar title="Notifications" backRoute={ROUTES.HOME} />

      <main className="flex-1 overflow-y-auto pb-24 pt-3 px-4">
        {/* Mark all read */}
        {unreadCount > 0 && (
          <div className="flex justify-end mb-3">
            <button
              onClick={handleMarkAllRead}
              className="flex items-center gap-1.5 text-xs font-medium text-[#1a3a2a] dark:text-[#7ab89a]"
            >
              <CheckCheck size={13} />
              Mark all as read
            </button>
          </div>
        )}

        {notifications.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="No notifications yet"
            description="We'll notify you about your orders, bookings, and hotel updates here."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {notifications.map((n) => {
              const meta = TYPE_META[n.type] ?? TYPE_META.info
              const Icon = meta.icon
              return (
                <button
                  key={n.id}
                  onClick={() => !n.read && handleMarkRead(n.id)}
                  className={[
                    'w-full flex items-start gap-3 p-4 rounded-2xl text-left transition-all',
                    'bg-white dark:bg-stone-900 border shadow-sm',
                    n.read
                      ? 'border-stone-100 dark:border-stone-800 opacity-70'
                      : 'border-stone-200 dark:border-stone-700',
                  ].join(' ')}
                >
                  <div className={`w-9 h-9 rounded-xl ${meta.bg} flex items-center justify-center shrink-0`}>
                    <Icon size={16} className={meta.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm font-semibold leading-tight ${n.read ? 'text-stone-500 dark:text-stone-400' : 'text-stone-900 dark:text-stone-100'}`}>
                        {n.title}
                      </p>
                      <span className="text-[10px] text-stone-300 dark:text-stone-600 shrink-0 mt-0.5">
                        {formatTime(n.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-stone-400 mt-0.5 leading-snug">{n.body}</p>
                  </div>
                  {!n.read && (
                    <div className="w-2 h-2 rounded-full bg-[#1a3a2a] dark:bg-[#7ab89a] shrink-0 mt-1.5" />
                  )}
                </button>
              )
            })}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  )
}
