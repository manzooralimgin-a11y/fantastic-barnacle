import { useState } from 'react'
import { User, Settings, LogOut, Moon, Sun, Globe, Leaf, Phone, ChevronRight } from 'lucide-react'
import { useApp } from '../context/AppContext'
import TopBar from '../components/TopBar'
import BottomNav from '../components/BottomNav'
import Card from '../components/Card'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Badge from '../components/Badge'
import { ROUTES } from '../constants'
import { getInitials, formatDate } from '../utils'

const LANGUAGES = ['English', 'Deutsch', 'Français', 'Español', 'Italiano']

export default function ProfileScreen() {
  const { guest, booking, logout, toggleDarkMode, darkMode, navigate } = useApp()
  const [showLogout, setShowLogout] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  const handleLogout = async () => {
    setLoggingOut(true)
    await logout()
  }

  if (!guest) return null

  const checkIn  = booking?.checkInDate  ? new Date(booking.checkInDate)  : null
  const checkOut = booking?.checkOutDate ? new Date(booking.checkOutDate) : null

  return (
    <div className="flex flex-col min-h-dvh bg-stone-50 dark:bg-stone-950">
      <TopBar title="My Profile" backRoute={ROUTES.HOME} />

      <main className="flex-1 overflow-y-auto pb-24 pt-3 px-4 space-y-4">
        {/* Avatar header */}
        <Card>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[#1a3a2a] flex items-center justify-center text-white font-bold text-lg shrink-0">
              {getInitials(`${guest.firstName} ${guest.lastName}`)}
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
                {guest.firstName} {guest.lastName}
              </h2>
              <p className="text-sm text-stone-400">Room {booking?.roomNumber} · {booking?.roomType}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-stone-100 dark:border-stone-800">
            <div>
              <p className="text-xs text-stone-400 mb-0.5">Check-in</p>
              <p className="text-sm font-medium text-stone-800 dark:text-stone-200">{checkIn ? formatDate(checkIn) : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-stone-400 mb-0.5">Check-out</p>
              <p className="text-sm font-medium text-stone-800 dark:text-stone-200">{checkOut ? formatDate(checkOut) : '—'}</p>
            </div>
          </div>

          {/* Guest details */}
          <div className="mt-3 pt-3 border-t border-stone-100 dark:border-stone-800 flex flex-col gap-1.5">
            {guest.email && (
              <p className="text-xs text-stone-400 truncate">{guest.email}</p>
            )}
            {guest.phone && (
              <p className="text-xs text-stone-400">{guest.phone}</p>
            )}
            {booking?.preferences?.dietaryNotes && booking.preferences.dietaryNotes !== 'none' && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <Leaf size={11} className="text-emerald-500" />
                <span className="text-xs text-stone-500 dark:text-stone-400 capitalize">{booking.preferences.dietaryNotes}</span>
              </div>
            )}
          </div>
        </Card>

        {/* Settings */}
        <section>
          <h2 className="text-sm font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wide mb-3">
            Preferences
          </h2>
          <Card padding={false}>
            {/* Dark mode */}
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-stone-100 dark:border-stone-800">
              <div className="flex items-center gap-3">
                {darkMode ? <Moon size={16} className="text-stone-400" /> : <Sun size={16} className="text-stone-400" />}
                <span className="text-sm text-stone-700 dark:text-stone-300">Dark Mode</span>
              </div>
              <button
                onClick={toggleDarkMode}
                className={[
                  'relative w-11 h-6 rounded-full transition-colors duration-200',
                  darkMode ? 'bg-[#1a3a2a]' : 'bg-stone-200 dark:bg-stone-700',
                ].join(' ')}
              >
                <span className={[
                  'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200',
                  darkMode ? 'translate-x-5' : 'translate-x-0.5',
                ].join(' ')} />
              </button>
            </div>

            {/* Language */}
            <div className="flex items-center justify-between px-4 py-3.5">
              <div className="flex items-center gap-3">
                <Globe size={16} className="text-stone-400" />
                <span className="text-sm text-stone-700 dark:text-stone-300">Language</span>
              </div>
              <div className="flex items-center gap-1 text-stone-400">
                <span className="text-sm capitalize">{booking?.preferences?.language === 'de' ? 'Deutsch' : 'English'}</span>
                <ChevronRight size={14} />
              </div>
            </div>
          </Card>
        </section>

        {/* Hotel contact */}
        <section>
          <h2 className="text-sm font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wide mb-3">
            Hotel Contact
          </h2>
          <Card padding={false}>
            {[
              { label: 'Reception', value: 'Ext. 0', icon: Phone },
              { label: 'Room Service', value: 'Ext. 1', icon: Phone },
              { label: 'Concierge', value: 'Ext. 2', icon: Phone },
            ].map(({ label, value, icon: Icon }, i, arr) => (
              <div key={label} className={`flex items-center justify-between px-4 py-3.5 ${i < arr.length - 1 ? 'border-b border-stone-100 dark:border-stone-800' : ''}`}>
                <div className="flex items-center gap-3">
                  <Icon size={15} className="text-stone-400" />
                  <span className="text-sm text-stone-700 dark:text-stone-300">{label}</span>
                </div>
                <span className="text-sm font-medium text-[#1a3a2a] dark:text-[#7ab89a]">{value}</span>
              </div>
            ))}
          </Card>
        </section>

        {/* Folio & Logout */}
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            fullWidth
            onClick={() => navigate(ROUTES.CHECKOUT)}
          >
            View My Folio
          </Button>
          <Button
            variant="danger"
            fullWidth
            onClick={() => setShowLogout(true)}
            icon={LogOut}
          >
            Sign Out
          </Button>
        </div>
      </main>

      <Modal open={showLogout} onClose={() => setShowLogout(false)} title="Sign Out">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-stone-500 dark:text-stone-400">
            Are you sure you want to sign out? You'll need your room number and last name to sign back in.
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={() => setShowLogout(false)}>Cancel</Button>
            <Button variant="danger" fullWidth loading={loggingOut} onClick={handleLogout}>Sign Out</Button>
          </div>
        </div>
      </Modal>

      <BottomNav />
    </div>
  )
}
