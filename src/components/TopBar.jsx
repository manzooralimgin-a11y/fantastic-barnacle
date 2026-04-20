import { Bell, ChevronLeft, Moon, Sun, ShoppingCart } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { ROUTES } from '../constants'

export default function TopBar({ title, backRoute, showCart = false }) {
  const { navigate, toggleDarkMode, darkMode, unreadCount, cartCount, currentRoute } = useApp()

  const handleBack = () => {
    if (backRoute) navigate(backRoute)
  }

  return (
    <header className="sticky top-0 z-30 bg-white/90 dark:bg-stone-900/90 backdrop-blur-md border-b border-stone-100 dark:border-stone-800 safe-top">
      <div className="flex items-center h-14 px-4 gap-3">
        {/* Left: back button or logo */}
        {backRoute ? (
          <button
            onClick={handleBack}
            className="p-2 -ml-2 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors text-stone-600 dark:text-stone-400"
          >
            <ChevronLeft size={22} />
          </button>
        ) : (
          <span className="text-[#1a3a2a] dark:text-[#7ab89a] font-bold tracking-tight text-lg select-none">
            das elb
          </span>
        )}

        {/* Title */}
        {title && (
          <h1 className="flex-1 text-center font-semibold text-stone-900 dark:text-stone-100 truncate">
            {title}
          </h1>
        )}

        {/* Spacer when no title */}
        {!title && <div className="flex-1" />}

        {/* Right actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={toggleDarkMode}
            className="p-2 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors text-stone-500 dark:text-stone-400"
          >
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>

          {showCart && (
            <button
              onClick={() => navigate(ROUTES.ROOM_SERVICE)}
              className="relative p-2 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors text-stone-500 dark:text-stone-400"
            >
              <ShoppingCart size={20} />
              {cartCount > 0 && (
                <span className="absolute top-1 right-1 min-w-[16px] h-4 flex items-center justify-center text-[10px] font-bold rounded-full bg-[#c9a84c] text-white px-0.5">
                  {cartCount}
                </span>
              )}
            </button>
          )}

          <button
            onClick={() => navigate(ROUTES.NOTIFICATIONS)}
            className="relative p-2 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors text-stone-500 dark:text-stone-400"
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 flex items-center justify-center text-[10px] font-bold rounded-full bg-red-500 text-white px-0.5">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  )
}
