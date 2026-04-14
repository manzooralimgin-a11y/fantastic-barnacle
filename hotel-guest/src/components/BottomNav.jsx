import { Home, UtensilsCrossed, Sparkles, MessageCircle, BedDouble } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { ROUTES } from '../constants'

const NAV_ITEMS = [
  { route: ROUTES.HOME,         icon: Home,            label: 'Home' },
  { route: ROUTES.ROOM_SERVICE, icon: UtensilsCrossed, label: 'Dine' },
  { route: ROUTES.SPA,          icon: Sparkles,        label: 'Spa' },
  { route: ROUTES.HOUSEKEEPING, icon: BedDouble,       label: 'Room' },
  { route: ROUTES.CONCIERGE,    icon: MessageCircle,   label: 'Concierge' },
]

export default function BottomNav() {
  const { currentRoute, navigate } = useApp()

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-white dark:bg-stone-900 border-t border-stone-100 dark:border-stone-800 safe-bottom">
      <div className="flex items-stretch h-16">
        {NAV_ITEMS.map(({ route, icon: Icon, label }) => {
          const active = currentRoute === route
          return (
            <button
              key={route}
              onClick={() => navigate(route)}
              className={[
                'flex-1 flex flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors',
                active
                  ? 'text-[#1a3a2a] dark:text-[#7ab89a]'
                  : 'text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-400',
              ].join(' ')}
            >
              <Icon
                size={22}
                strokeWidth={active ? 2.2 : 1.6}
                className={active ? 'drop-shadow-sm' : ''}
              />
              <span>{label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
