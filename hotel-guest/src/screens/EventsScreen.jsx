import { useState, useMemo } from 'react'
import {
  ChevronLeft, MapPin, Clock, Users, CheckCircle2,
  AlertCircle, CalendarDays, ChevronRight, Minus, Plus,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useFetch } from '../hooks/useFetch'
import { useMutation } from '../hooks/useFetch'
import { eventsApi } from '../services/api'
import BottomNav from '../components/BottomNav'
import Button from '../components/Button'
import Spinner from '../components/Spinner'
import { ROUTES } from '../constants'
import { formatPrice } from '../utils'

// ─── Category config (all static Tailwind strings — never interpolated) ───────
const CATEGORY_CONFIG = {
  Dining:        { from: 'from-amber-950',   ring: 'bg-amber-900/30',   chip: 'bg-amber-500/15 text-amber-400 border border-amber-500/25'    },
  Wellness:      { from: 'from-teal-950',    ring: 'bg-teal-900/30',    chip: 'bg-teal-500/15 text-teal-400 border border-teal-500/25'      },
  Entertainment: { from: 'from-violet-950',  ring: 'bg-violet-900/30',  chip: 'bg-violet-500/15 text-violet-400 border border-violet-500/25' },
  Activity:      { from: 'from-emerald-950',    ring: 'bg-emerald-900/30',    chip: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'      },
}
const DEFAULT_CAT = { from: 'from-zinc-900', ring: 'bg-zinc-800/40', chip: 'bg-stone-700/40 text-stone-400 border border-stone-600/30' }

const ALL_CATEGORIES = ['All', 'Dining', 'Wellness', 'Entertainment', 'Activity']

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatEventDate(dateStr) {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(dateStr))
}

function formatDuration(mins) {
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

function spotsText(left) {
  if (left === 0) return { label: 'Sold out', cls: 'text-red-400' }
  if (left <= 3)  return { label: `${left} spot${left === 1 ? '' : 's'} left`, cls: 'text-amber-400' }
  return { label: `${left} spots left`, cls: 'text-emerald-400' }
}

// ─── Tag badge ────────────────────────────────────────────────────────────────
const TAG_STYLES = {
  'Live Music':    'bg-violet-500/15 text-violet-400 border border-violet-400/25',
  'Brunch':        'bg-amber-500/15 text-amber-400 border border-amber-500/25',
  'Wine':          'bg-red-500/15 text-red-400 border border-red-400/25',
  'Tasting':       'bg-red-500/15 text-red-400 border border-red-400/25',
  'Yoga':          'bg-teal-500/15 text-teal-400 border border-teal-500/25',
  'Wellness':      'bg-teal-500/15 text-teal-400 border border-teal-500/25',
  'Complimentary': 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25',
  'Boat':          'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25',
  'Magdeburg':     'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25',
  'Sightseeing':   'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25',
  'Cocktails':     'bg-pink-500/15 text-pink-400 border border-pink-400/25',
  'Interactive':   'bg-pink-500/15 text-pink-400 border border-pink-400/25',
  'Exclusive':     'bg-[#c9a84c]/20 text-[#c9a84c] border border-[#c9a84c]/40',
  'Fine Dining':   'bg-[#c9a84c]/20 text-[#c9a84c] border border-[#c9a84c]/40',
  'Chef Special':  'bg-[#c9a84c]/20 text-[#c9a84c] border border-[#c9a84c]/40',
  'Spa':           'bg-teal-500/15 text-teal-400 border border-teal-500/25',
  'Nordic':        'bg-teal-500/15 text-teal-400 border border-teal-500/25',
  'Sunset':        'bg-amber-500/15 text-amber-400 border border-amber-500/25',
  'Cruise':        'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25',
  'Champagne':     'bg-amber-500/15 text-amber-400 border border-amber-500/25',
}

function TagBadge({ label }) {
  const cls = TAG_STYLES[label] ?? 'bg-stone-700/50 text-stone-400 border border-stone-600/30'
  return (
    <span className={`inline-flex items-center text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${cls}`}>
      {label}
    </span>
  )
}

// ─── Info card ────────────────────────────────────────────────────────────────
function InfoCard({ label, children }) {
  return (
    <div className="bg-white dark:bg-stone-900 rounded-2xl p-4 border border-stone-100 dark:border-stone-800">
      <p className="text-[11px] font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wider mb-3">
        {label}
      </p>
      {children}
    </div>
  )
}

// ─── Guest count stepper ─────────────────────────────────────────────────────
function GuestStepper({ value, onChange, max }) {
  return (
    <div className="flex items-center gap-4">
      <button
        onClick={() => onChange(Math.max(1, value - 1))}
        disabled={value <= 1}
        className="w-10 h-10 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-stone-600 dark:text-stone-300 disabled:opacity-30 active:scale-95 transition-transform"
      >
        <Minus size={18} />
      </button>
      <span className="text-2xl font-bold text-stone-900 dark:text-white w-8 text-center tabular-nums">
        {value}
      </span>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="w-10 h-10 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-stone-600 dark:text-stone-300 disabled:opacity-30 active:scale-95 transition-transform"
      >
        <Plus size={18} />
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
export default function EventsScreen() {
  const { navigate } = useApp()
  const [view,          setView]          = useState('list')
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [guestCount,    setGuestCount]    = useState(1)
  const [specialReqs,   setSpecialReqs]   = useState('')
  const [confirmation,  setConfirmation]  = useState(null)

  const { data: events, loading, error } = useFetch(eventsApi.getEvents, [])
  const { mutate: reserve, loading: reserving, error: reserveError, reset: resetMutation } = useMutation(eventsApi.reserveEvent)

  const filteredEvents = useMemo(() => {
    if (!events) return []
    const base = categoryFilter === 'All' ? events : events.filter((e) => e.category === categoryFilter)
    return [...base].sort((a, b) => {
      const da = new Date(`${a.date}T${a.time}`)
      const db = new Date(`${b.date}T${b.time}`)
      return da - db
    })
  }, [events, categoryFilter])

  const openDetail = (event) => {
    setSelectedEvent(event)
    setGuestCount(1)
    setSpecialReqs('')
    resetMutation()
    setView('detail')
  }

  const openReserve = () => {
    setGuestCount(1)
    setSpecialReqs('')
    resetMutation()
    setView('reserve')
  }

  const handleReserve = async () => {
    const result = await reserve({
      eventId:         selectedEvent.id,
      guestCount,
      specialRequests: specialReqs.trim(),
    })
    if (result) {
      setConfirmation(result)
      setView('success')
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex flex-col min-h-dvh bg-[#080d0a]">
      <div className="safe-top" />
      <Spinner className="flex-1" size={32} />
      <BottomNav />
    </div>
  )

  if (error) return (
    <div className="flex flex-col min-h-dvh bg-[#080d0a]">
      <div className="safe-top" />
      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
        <AlertCircle size={40} className="text-stone-600" />
        <p className="text-stone-400 text-sm">{error}</p>
        <button onClick={() => navigate(ROUTES.HOME)} className="text-[#c9a84c] text-sm hover:underline">
          Go back
        </button>
      </div>
      <BottomNav />
    </div>
  )

  // ── Success view ─────────────────────────────────────────────────────────
  if (view === 'success' && confirmation && selectedEvent) {
    const cfg = CATEGORY_CONFIG[selectedEvent.category] ?? DEFAULT_CAT
    return (
      <div className="flex flex-col min-h-dvh bg-stone-50 dark:bg-stone-950">
        <div className={`relative bg-gradient-to-b ${cfg.from} to-stone-950 shrink-0`}>
          <div className="safe-top" />
          <div className="flex items-center px-4 pt-2 pb-1">
            <button
              onClick={() => { setView('list'); setCategoryFilter('All') }}
              className="flex items-center gap-1.5 text-white/50 hover:text-white transition-colors py-2"
            >
              <ChevronLeft size={20} />
              <span className="text-sm font-medium">Events</span>
            </button>
          </div>
          <div className="flex flex-col items-center px-5 pt-4 pb-8">
            <div className={`w-24 h-24 rounded-3xl ${cfg.ring} flex items-center justify-center text-6xl mb-4`}>
              {selectedEvent.emoji}
            </div>
            <div className="w-14 h-14 rounded-full bg-emerald-500/20 flex items-center justify-center mb-4">
              <CheckCircle2 size={32} className="text-emerald-400" />
            </div>
            <h1 className="text-2xl font-bold text-white text-center mb-1">Request sent!</h1>
            <p className="text-white/40 text-sm text-center">Your reservation request has been sent to the hotel team.</p>
          </div>
          <div className="h-7 bg-stone-50 dark:bg-stone-950 rounded-t-[28px]" />
        </div>

        <main className="flex-1 overflow-y-auto pb-28 px-4 -mt-1 space-y-4">
          <div className="bg-white dark:bg-stone-900 rounded-2xl p-4 border border-stone-100 dark:border-stone-800">
            <p className="text-[11px] font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wider mb-3">
              Confirmation
            </p>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-stone-500 dark:text-stone-400">Reference</span>
              <span className="text-sm font-bold text-stone-900 dark:text-white font-mono tracking-widest">
                {confirmation.confirmationNumber}
              </span>
            </div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-stone-500 dark:text-stone-400">Event</span>
              <span className="text-sm font-medium text-stone-800 dark:text-stone-200">{selectedEvent.title}</span>
            </div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-stone-500 dark:text-stone-400">Date & time</span>
              <span className="text-sm font-medium text-stone-800 dark:text-stone-200">
                {formatEventDate(selectedEvent.date)} · {selectedEvent.time}
              </span>
            </div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-stone-500 dark:text-stone-400">Venue</span>
              <span className="text-sm font-medium text-stone-800 dark:text-stone-200">{selectedEvent.venue}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-stone-500 dark:text-stone-400">Guests</span>
              <span className="text-sm font-medium text-stone-800 dark:text-stone-200">{confirmation.guestCount}</span>
            </div>
            {selectedEvent.price > 0 && (
              <div className="mt-3 pt-3 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between">
                <span className="text-sm text-stone-500 dark:text-stone-400">Estimated total</span>
                <span className="text-sm font-bold text-[#c9a84c]">
                  {formatPrice(selectedEvent.price * confirmation.guestCount)}
                </span>
              </div>
            )}
          </div>

          {confirmation.specialRequests && (
            <InfoCard label="Special Requests">
              <p className="text-sm text-stone-600 dark:text-stone-400 italic">"{confirmation.specialRequests}"</p>
            </InfoCard>
          )}

          <p className="text-center text-[11px] text-stone-400 dark:text-stone-600 pb-2">
            Details shared with guest services · Dress code: {selectedEvent.dressCode}
          </p>

          <Button fullWidth variant="primary" onClick={() => { setView('list'); setCategoryFilter('All') }}>
            Back to Events
          </Button>
        </main>
        <BottomNav />
      </div>
    )
  }

  // ── Reserve view ─────────────────────────────────────────────────────────
  if (view === 'reserve' && selectedEvent) {
    const cfg   = CATEGORY_CONFIG[selectedEvent.category] ?? DEFAULT_CAT
    const spots = selectedEvent.spotsLeft
    const total = selectedEvent.price * guestCount

    return (
      <div className="flex flex-col min-h-dvh bg-stone-50 dark:bg-stone-950">
        <div className={`relative bg-gradient-to-b ${cfg.from} to-stone-950 shrink-0`}>
          <div className="safe-top" />
          <div className="flex items-center px-4 pt-2 pb-1">
            <button
              onClick={() => setView('detail')}
              className="flex items-center gap-1.5 text-white/50 hover:text-white transition-colors py-2"
            >
              <ChevronLeft size={20} />
              <span className="text-sm font-medium">Details</span>
            </button>
          </div>
          <div className="flex flex-col items-center px-5 pt-2 pb-6">
            <div className={`w-20 h-20 rounded-3xl ${cfg.ring} flex items-center justify-center text-5xl mb-4`}>
              {selectedEvent.emoji}
            </div>
            <h1 className="text-xl font-bold text-white text-center mb-1">{selectedEvent.title}</h1>
            <p className="text-white/40 text-sm">{formatEventDate(selectedEvent.date)} · {selectedEvent.time} · {selectedEvent.venue}</p>
          </div>
          <div className="h-7 bg-stone-50 dark:bg-stone-950 rounded-t-[28px]" />
        </div>

        <main className="flex-1 overflow-y-auto pb-28 px-4 -mt-1 space-y-4">
          {/* Guest count */}
          <InfoCard label="Number of Guests">
            <div className="flex items-center justify-between">
              <GuestStepper value={guestCount} onChange={setGuestCount} max={Math.min(spots, 4)} />
              <div className="text-right">
                <p className="text-xs text-stone-400 mb-0.5">Max {Math.min(spots, 4)} guests</p>
                {spots <= 3 && (
                  <p className="text-xs text-amber-500 font-medium">{spots} spot{spots === 1 ? '' : 's'} left</p>
                )}
              </div>
            </div>
          </InfoCard>

          {/* Special requests */}
          <InfoCard label="Special Requests (optional)">
            <textarea
              value={specialReqs}
              onChange={(e) => setSpecialReqs(e.target.value)}
              rows={3}
              maxLength={300}
              placeholder="Dietary requirements, accessibility needs, celebrations…"
              className="w-full text-sm bg-transparent text-stone-800 dark:text-stone-200 placeholder-stone-400 dark:placeholder-stone-600 resize-none outline-none leading-relaxed"
            />
            <p className="text-right text-[10px] text-stone-400 mt-1">{specialReqs.length}/300</p>
          </InfoCard>

          {/* Order summary */}
          <InfoCard label="Summary">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-stone-500 dark:text-stone-400">{selectedEvent.title}</span>
                <span className="text-stone-700 dark:text-stone-300">
                  {selectedEvent.price > 0 ? formatPrice(selectedEvent.price) : 'Free'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-stone-500 dark:text-stone-400">Guests</span>
                <span className="text-stone-700 dark:text-stone-300">× {guestCount}</span>
              </div>
              <div className="border-t border-stone-100 dark:border-stone-800 pt-2 flex justify-between">
                <span className="text-sm font-semibold text-stone-800 dark:text-stone-200">Total</span>
                <span className="text-sm font-bold text-[#c9a84c]">
                  {selectedEvent.price > 0 ? formatPrice(total) : 'Complimentary'}
                </span>
              </div>
              {selectedEvent.price > 0 && (
                <p className="text-[11px] text-stone-400 dark:text-stone-600">Sent to guest services for confirmation · includes VAT</p>
              )}
            </div>
          </InfoCard>

          {reserveError && (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-900/20 rounded-2xl border border-red-200 dark:border-red-800/30">
              <AlertCircle size={16} className="text-red-500 shrink-0" />
              <p className="text-sm text-red-600 dark:text-red-400">{reserveError}</p>
            </div>
          )}

          <Button
            fullWidth
            variant="primary"
            onClick={handleReserve}
            disabled={reserving}
          >
            {reserving ? 'Confirming…' : `Confirm Reservation${selectedEvent.price > 0 ? ` · ${formatPrice(total)}` : ''}`}
          </Button>
        </main>
        <BottomNav />
      </div>
    )
  }

  // ── Detail view ──────────────────────────────────────────────────────────
  if (view === 'detail' && selectedEvent) {
    const ev   = selectedEvent
    const cfg  = CATEGORY_CONFIG[ev.category] ?? DEFAULT_CAT
    const spot = spotsText(ev.spotsLeft)

    return (
      <div className="flex flex-col min-h-dvh bg-stone-50 dark:bg-stone-950">
        {/* Hero */}
        <div className={`relative bg-gradient-to-b ${cfg.from} to-stone-950 shrink-0`}>
          <div className="safe-top" />
          <div className="flex items-center px-4 pt-2 pb-1">
            <button
              onClick={() => setView('list')}
              className="flex items-center gap-1.5 text-white/50 hover:text-white transition-colors py-2"
            >
              <ChevronLeft size={20} />
              <span className="text-sm font-medium">Events</span>
            </button>
          </div>

          <div className="flex flex-col items-center px-5 pt-2 pb-6">
            <div className={`w-32 h-32 rounded-3xl ${cfg.ring} flex items-center justify-center text-7xl mb-5 backdrop-blur-sm`}>
              {ev.emoji}
            </div>

            {/* Tags */}
            <div className="flex flex-wrap gap-1.5 justify-center mb-4">
              <span className={`inline-flex items-center text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${cfg.chip}`}>
                {ev.category}
              </span>
              {ev.tags.map((t) => <TagBadge key={t} label={t} />)}
            </div>

            <h1 className="text-3xl font-bold text-white text-center leading-tight mb-2">{ev.title}</h1>

            <div className="flex items-center gap-2 text-xs text-white/40 flex-wrap justify-center">
              <span className="flex items-center gap-1"><MapPin size={10} /> {ev.venue}</span>
              <span>·</span>
              <span className="flex items-center gap-1"><CalendarDays size={10} /> {formatEventDate(ev.date)}</span>
              <span>·</span>
              <span className="flex items-center gap-1"><Clock size={10} /> {ev.time} · {formatDuration(ev.durationMinutes)}</span>
            </div>

            <div className="mt-4 flex items-end gap-3">
              <div className="text-right">
                <p className="text-3xl font-bold text-[#c9a84c]">
                  {ev.price > 0 ? formatPrice(ev.price) : 'Free'}
                </p>
                <p className="text-xs text-white/25 mt-0.5">{ev.priceNote}</p>
              </div>
            </div>

            <div className={`mt-3 text-xs font-semibold ${spot.cls} flex items-center gap-1`}>
              <Users size={12} /> {spot.label}
            </div>
          </div>

          <div className="h-7 bg-stone-50 dark:bg-stone-950 rounded-t-[28px]" />
        </div>

        <main className="flex-1 overflow-y-auto pb-28 px-4 -mt-1 space-y-4">
          {/* Description */}
          <InfoCard label="About this event">
            <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed">{ev.description}</p>
          </InfoCard>

          {/* Highlights */}
          <InfoCard label="What's included">
            <ul className="space-y-2">
              {ev.highlights.map((h) => (
                <li key={h} className="flex items-start gap-2.5 text-sm text-stone-600 dark:text-stone-400">
                  <CheckCircle2 size={14} className="text-[#c9a84c] mt-0.5 shrink-0" />
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          </InfoCard>

          {/* Menu preview */}
          {ev.menu?.length > 0 && (
            <InfoCard label="Menu Preview">
              <div className="space-y-4">
                {ev.menu.map((section) => (
                  <div key={section.course}>
                    <p className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-2">
                      {section.course}
                    </p>
                    <ul className="space-y-1">
                      {section.items.map((item) => (
                        <li key={item} className="text-sm text-stone-600 dark:text-stone-400 flex items-start gap-2">
                          <span className="text-stone-300 dark:text-stone-700 mt-1">—</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </InfoCard>
          )}

          {/* Dress code */}
          <div className="bg-[#0f1f17] rounded-2xl p-4 border border-[#c9a84c]/20">
            <p className="text-[11px] font-semibold text-[#c9a84c]/60 uppercase tracking-wider mb-2">Dress Code</p>
            <p className="text-sm text-stone-300">{ev.dressCode}</p>
          </div>

          {/* CTA */}
          {ev.available && ev.spotsLeft > 0 ? (
            <Button fullWidth variant="primary" icon={CalendarDays} onClick={openReserve}>
              Reserve {guestCount > 1 ? `${guestCount} spots` : 'a spot'}
              {ev.price > 0 ? ` · ${formatPrice(ev.price)}` : ' · Free'}
            </Button>
          ) : (
            <div className="w-full text-center py-3.5 rounded-2xl bg-stone-100 dark:bg-stone-800 text-sm text-stone-400">
              {ev.spotsLeft === 0 ? 'Sold out' : 'Currently unavailable'}
            </div>
          )}

          <p className="text-center text-[11px] text-stone-400 dark:text-stone-600 pb-2">
            Requested via guest services · {ev.venue}
          </p>
        </main>

        <BottomNav />
      </div>
    )
  }

  // ── List view ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-dvh bg-[#080d0a]">

      {/* Premium header */}
      <div className="relative bg-[#0f1f17] shrink-0 overflow-hidden">
        <div className="absolute -top-12 right-0 w-72 h-72 rounded-full bg-[#c9a84c]/5 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 -left-8 w-48 h-48 rounded-full bg-teal-900/10 blur-2xl pointer-events-none" />

        <div className="safe-top" />
        <div className="relative flex items-center justify-between px-4 pt-3 pb-1">
          <button
            onClick={() => navigate(ROUTES.HOME)}
            className="p-2 -ml-1 rounded-xl text-white/40 hover:text-white transition-colors"
          >
            <ChevronLeft size={22} />
          </button>
          <span className="text-white/25 text-[10px] font-bold tracking-[0.25em] uppercase">das elb</span>
          <div className="w-9" />
        </div>

        <div className="relative px-5 pt-1 pb-5">
          <p className="text-[#c9a84c] text-[11px] font-semibold tracking-[0.2em] uppercase mb-1.5">
            This week
          </p>
          <h1 className="text-[2rem] font-bold text-white leading-tight tracking-tight">
            Events & Activities
          </h1>
          <p className="text-sm text-white/35 mt-1.5">
            Reserve your spot with reception
          </p>
        </div>

        {/* Category filter pills */}
        <div className="relative px-4 pb-4 flex gap-2 overflow-x-auto scrollbar-none">
          {ALL_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`shrink-0 text-xs font-semibold px-3.5 py-1.5 rounded-full border transition-colors ${
                categoryFilter === cat
                  ? 'bg-[#c9a84c] text-stone-950 border-[#c9a84c]'
                  : 'text-white/50 border-white/10 hover:border-white/20'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Event list */}
      <main className="flex-1 overflow-y-auto pb-24">
        <div className="px-4 pt-5 space-y-4">
          {filteredEvents.length === 0 && (
            <p className="text-center text-stone-600 text-sm mt-12">No events in this category.</p>
          )}
          {filteredEvents.map((ev) => {
            const cfg  = CATEGORY_CONFIG[ev.category] ?? DEFAULT_CAT
            const spot = spotsText(ev.spotsLeft)
            return (
              <button
                key={ev.id}
                onClick={() => openDetail(ev)}
                className={`group w-full bg-gradient-to-br ${cfg.from} to-stone-950 rounded-3xl overflow-hidden text-left active:scale-[0.98] transition-transform duration-150 border border-white/5 shadow-lg`}
              >
                <div className="p-6">
                  {/* Emoji */}
                  <div className={`w-20 h-20 rounded-2xl ${cfg.ring} flex items-center justify-center text-5xl mx-auto mb-4 backdrop-blur-sm`}>
                    {ev.emoji}
                  </div>

                  {/* Category */}
                  <p className="text-center text-[10px] font-bold text-white/25 uppercase tracking-[0.2em] mb-1">
                    {ev.category}
                  </p>

                  {/* Title */}
                  <h2 className="text-xl font-bold text-white text-center leading-tight mb-2">{ev.title}</h2>

                  {/* Short description */}
                  <p className="text-sm text-white/45 text-center leading-relaxed mb-4">{ev.shortDescription}</p>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1.5 justify-center mb-5">
                    {ev.tags.slice(0, 3).map((t) => <TagBadge key={t} label={t} />)}
                  </div>

                  {/* Footer */}
                  <div className="border-t border-white/8 pt-4 flex items-end justify-between">
                    <div>
                      <p className="text-xs text-white/30 font-medium flex items-center gap-1">
                        <MapPin size={10} /> {ev.venue}
                      </p>
                      <p className="text-xs text-white/20 mt-0.5 flex items-center gap-1">
                        <CalendarDays size={10} /> {formatEventDate(ev.date)} · {ev.time}
                      </p>
                      <p className={`text-xs mt-1 font-medium ${spot.cls}`}>
                        {spot.label}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-white/25 mb-0.5">{ev.price > 0 ? 'per person' : ''}</p>
                      <p className="text-xl font-bold text-[#c9a84c]">
                        {ev.price > 0 ? formatPrice(ev.price) : 'Free'}
                      </p>
                    </div>
                  </div>

                  {ev.spotsLeft === 0 && (
                    <div className="mt-3 text-center text-xs text-red-400 bg-red-900/25 rounded-xl py-1.5 border border-red-800/30">
                      Sold out
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        <p className="text-center text-xs text-stone-800 mt-6 mb-2 px-6">
          All bookings are sent to guest services for confirmation · Prices include VAT
        </p>
      </main>

      <BottomNav />
    </div>
  )
}
