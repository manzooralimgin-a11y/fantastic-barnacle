import {
  BedDouble, MessageSquare, UtensilsCrossed, ChefHat,
  Coffee, CalendarDays, Receipt, DoorOpen,
  ChevronRight, Bell, LogOut, Nfc, ShieldAlert, ShieldCheck,
  KeyRound, Wifi, MapPin,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useNotifications } from '../hooks/useNotifications'
import BottomNav from '../components/BottomNav'
import Badge from '../components/Badge'
import { ROUTES } from '../constants'
import { formatDate } from '../utils'
import { getInitials } from '../utils'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

const PAYMENT_META = {
  paid:    { label: 'Paid',    color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' },
  pending: { label: 'Pending', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' },
  partial: { label: 'Partial', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400' },
}

// ---------------------------------------------------------------------------
// Service card data
// ---------------------------------------------------------------------------
function buildCards({ booking, idVerified, roomKey, unreadCount }) {
  const payMeta = PAYMENT_META[booking?.paymentStatus] ?? PAYMENT_META.pending
  return [
    {
      id:       'room',
      icon:     BedDouble,
      iconBg:   'bg-blue-50 dark:bg-blue-900/20',
      iconColor:'text-blue-600 dark:text-blue-400',
      title:    'My Room',
      subtitle: booking ? `${booking.roomType} · Floor ${booking.floor}` : 'View room details',
      badge:    booking?.paymentStatus
        ? <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${payMeta.color}`}>{payMeta.label}</span>
        : null,
      route:    ROUTES.ROOM_DETAILS,
    },
    {
      id:       'frontdesk',
      icon:     MessageSquare,
      iconBg:   'bg-violet-50 dark:bg-violet-900/20',
      iconColor:'text-violet-600 dark:text-violet-400',
      title:    'Front Desk',
      subtitle: 'Send a request or message',
      badge:    null,
      route:    ROUTES.FRONT_DESK,
    },
    {
      id:       'menu',
      icon:     UtensilsCrossed,
      iconBg:   'bg-amber-50 dark:bg-amber-900/20',
      iconColor:'text-amber-600 dark:text-amber-400',
      title:    'Restaurant Menu',
      subtitle: 'Full à la carte & room service',
      badge:    null,
      route:    ROUTES.ROOM_SERVICE,
    },
    {
      id:       'dishes',
      icon:     ChefHat,
      iconBg:   'bg-rose-50 dark:bg-rose-900/20',
      iconColor:'text-rose-600 dark:text-rose-400',
      title:    'Signature Dishes',
      subtitle: "Chef's weekly specials",
      badge:    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400">New</span>,
      route:    ROUTES.DINING,
    },
    {
      id:       'breakfast',
      icon:     Coffee,
      iconBg:   'bg-orange-50 dark:bg-orange-900/20',
      iconColor:'text-orange-600 dark:text-orange-400',
      title:    'Breakfast',
      subtitle: '06:30 – 11:00 · Wintergarten',
      badge:    null,
      route:    ROUTES.ROOM_SERVICE,
    },
    {
      id:       'events',
      icon:     CalendarDays,
      iconBg:   'bg-teal-50 dark:bg-teal-900/20',
      iconColor:'text-teal-600 dark:text-teal-400',
      title:    'Events & Activities',
      subtitle: 'Hotel events & reservations',
      badge:    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400">3 today</span>,
      route:    ROUTES.EVENTS,
    },
    {
      id:       'bills',
      icon:     Receipt,
      iconBg:   'bg-indigo-50 dark:bg-indigo-900/20',
      iconColor:'text-indigo-600 dark:text-indigo-400',
      title:    'Bills & Invoices',
      subtitle: 'View charges & download invoice',
      badge:    null,
      route:    ROUTES.CHECKOUT,
    },
    {
      id:       'checkout',
      icon:     DoorOpen,
      iconBg:   'bg-stone-100 dark:bg-stone-800',
      iconColor:'text-stone-600 dark:text-stone-400',
      title:    'Check Out',
      subtitle: booking?.checkOutDate ? `Due ${formatDate(new Date(booking.checkOutDate))}` : 'Initiate checkout',
      badge:    null,
      route:    ROUTES.CHECKOUT,
    },
  ]
}

// ---------------------------------------------------------------------------
// Individual service card
// ---------------------------------------------------------------------------
function ServiceCard({ card, onClick }) {
  const { icon: Icon, iconBg, iconColor, title, subtitle, badge } = card
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-4 p-4 rounded-2xl bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 shadow-sm hover:shadow-md hover:border-stone-200 dark:hover:border-stone-700 active:scale-[0.98] transition-all duration-150 text-left w-full"
    >
      {/* Icon */}
      <div className={`w-12 h-12 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}>
        <Icon size={24} className={iconColor} strokeWidth={1.8} />
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-stone-900 dark:text-stone-100 leading-tight">{title}</p>
        <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5 truncate">{subtitle}</p>
        {badge && <div className="mt-1.5">{badge}</div>}
      </div>

      {/* Chevron */}
      <ChevronRight
        size={16}
        className="text-stone-300 dark:text-stone-600 shrink-0 group-hover:text-stone-500 dark:group-hover:text-stone-400 group-hover:translate-x-0.5 transition-all"
      />
    </button>
  )
}

// ---------------------------------------------------------------------------
// Check-in status strip (compact horizontal)
// ---------------------------------------------------------------------------
function CheckinStrip({ idVerified, roomKey, navigate }) {
  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-hide px-4 pb-1">
      {/* ID status */}
      <button
        onClick={() => !idVerified && navigate(ROUTES.ID_VERIFICATION)}
        className={[
          'shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-colors',
          idVerified
            ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
            : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400',
        ].join(' ')}
      >
        {idVerified
          ? <ShieldCheck size={13} />
          : <ShieldAlert size={13} />
        }
        {idVerified ? 'ID Verified' : 'Verify ID'}
      </button>

      {/* Key status */}
      <button
        onClick={() => navigate(ROUTES.ROOM_KEY)}
        className={[
          'shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-colors',
          roomKey
            ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400'
            : 'bg-stone-100 dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-500 dark:text-stone-400',
        ].join(' ')}
      >
        {roomKey ? <Nfc size={13} /> : <KeyRound size={13} />}
        {roomKey ? 'Key Active' : 'Get Key'}
      </button>

      {/* Wi-Fi quick info */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-100 dark:bg-stone-800 text-xs font-medium text-stone-500 dark:text-stone-400">
        <Wifi size={13} />
        DasElb_Guest
      </div>

      {/* Location */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-100 dark:bg-stone-800 text-xs font-medium text-stone-500 dark:text-stone-400">
        <MapPin size={13} />
        Seilerweg 19, Magdeburg
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dashboard screen
// ---------------------------------------------------------------------------
export default function HomeScreen() {
  const { guest, booking, idVerified, roomKey, unreadCount, logout, navigate } = useApp()
  useNotifications()

  const checkOut   = booking?.checkOutDate ? new Date(booking.checkOutDate) : null
  const nightsLeft = checkOut ? Math.ceil((checkOut - new Date()) / (1000 * 60 * 60 * 24)) : null
  const cards      = buildCards({ booking, idVerified, roomKey, unreadCount })

  return (
    <div className="flex flex-col min-h-dvh bg-stone-50 dark:bg-stone-950">

      {/* ── HEADER ── */}
      <div className="relative bg-[#0f1f17] overflow-hidden shrink-0">
        {/* Ambient glows */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-emerald-600/10 blur-3xl" />
          <div className="absolute bottom-0 -left-10 w-48 h-48 rounded-full bg-blue-600/8 blur-2xl" />
        </div>

        {/* Safe area top */}
        <div className="safe-top" />

        {/* Top bar row */}
        <div className="relative flex items-center justify-between px-5 pt-4 pb-2">
          {/* Logo */}
          <span className="text-white/40 text-xs font-bold tracking-[0.2em] uppercase">das elb</span>

          {/* Right actions */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate(ROUTES.NOTIFICATIONS)}
              className="relative w-9 h-9 rounded-xl flex items-center justify-center text-white/50 hover:text-white hover:bg-white/8 transition-colors"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 min-w-[14px] h-3.5 flex items-center justify-center text-[9px] font-bold rounded-full bg-red-500 text-white px-0.5">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            <button
              onClick={logout}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-white/50 hover:text-white hover:bg-white/8 transition-colors"
              title="Sign out"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>

        {/* Welcome row */}
        <div className="relative flex items-center gap-3.5 px-5 pt-2 pb-5">
          {/* Avatar */}
          <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-base">
              {getInitials(`${guest?.firstName ?? ''} ${guest?.lastName ?? ''}`)}
            </span>
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <p className="text-white/50 text-xs">{getGreeting()}</p>
            <h1 className="text-white text-xl font-bold leading-tight truncate">
              {guest?.firstName} {guest?.lastName}
            </h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-xs text-white/50">
                Room <span className="text-[#c9a84c] font-semibold">{booking?.roomNumber}</span>
              </span>
              {checkOut && (
                <span className="text-xs text-white/40">·</span>
              )}
              {checkOut && (
                <span className="text-xs text-white/50">
                  {nightsLeft > 0
                    ? `Staying until ${formatDate(checkOut)}`
                    : 'Check-out today'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Bottom fade edge */}
        <div className="absolute bottom-0 inset-x-0 h-4 bg-gradient-to-t from-stone-50 dark:from-stone-950 to-transparent" />
      </div>

      {/* ── SCROLLABLE BODY ── */}
      <main className="flex-1 overflow-y-auto pb-24 pt-2">

        {/* Check-in status strip */}
        <div className="mt-3 mb-5">
          <CheckinStrip idVerified={idVerified} roomKey={roomKey} navigate={navigate} />
        </div>

        {/* Section header */}
        <div className="px-4 mb-3">
          <h2 className="text-xs font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-widest">
            Hotel Services
          </h2>
        </div>

        {/* 8-card responsive grid */}
        <div className="px-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {cards.map((card) => (
            <ServiceCard
              key={card.id}
              card={card}
              onClick={() => navigate(card.route)}
            />
          ))}
        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-stone-300 dark:text-stone-700 mt-8 px-6">
          Need help? Dial <strong className="text-stone-400 dark:text-stone-600">ext. 0</strong> for reception or tap Front Desk above.
        </p>
      </main>

      <BottomNav />
    </div>
  )
}
