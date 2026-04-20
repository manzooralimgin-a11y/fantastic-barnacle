import { useState } from 'react'
import {
  ChevronLeft, BedDouble, Wifi, Wind, Tv, Lock, Wine,
  Coffee, Sun, Zap, Shirt, Bath,
  Nfc, KeyRound, CheckCircle2, AlertCircle, XCircle,
  CreditCard, Receipt, DollarSign,
  Sparkles, EyeOff, Clock, Thermometer,
  ChevronRight, Loader2, Info,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useFetch, useMutation } from '../hooks/useFetch'
import { roomDetailsApi, housekeepingApi } from '../services/api'
import { ROUTES } from '../constants'
import { formatDate, formatTime, formatPrice } from '../utils'

// ---------------------------------------------------------------------------
// Icon map for amenities (string → component)
// ---------------------------------------------------------------------------
const ICON_MAP = {
  wifi: Wifi, wind: Wind, tv: Tv, lock: Lock, wine: Wine,
  bath: Bath, sun: Sun, coffee: Coffee, shirt: Shirt, zap: Zap,
}

// ---------------------------------------------------------------------------
// Reusable section wrapper
// ---------------------------------------------------------------------------
function Section({ title, children, className = '' }) {
  return (
    <div className={`px-4 ${className}`}>
      <h2 className="text-xs font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-widest mb-3">
        {title}
      </h2>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Info row inside a card
// ---------------------------------------------------------------------------
function InfoRow({ label, value, valueClass = '', last = false }) {
  return (
    <div className={`flex items-center justify-between py-3 ${!last ? 'border-b border-stone-100 dark:border-stone-800' : ''}`}>
      <span className="text-sm text-stone-500 dark:text-stone-400">{label}</span>
      <span className={`text-sm font-semibold text-stone-900 dark:text-stone-100 text-right ${valueClass}`}>{value}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------
function StatusBadge({ status }) {
  const map = {
    active:       'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
    inactive:     'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400',
    expired:      'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
    not_assigned: 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400',
    paid:         'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
    pending:      'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
    overdue:      'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
    occupied:     'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
    vacant:       'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400',
    cleaning:     'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400',
  }
  const labels = {
    active: 'Active', inactive: 'Inactive', expired: 'Expired',
    not_assigned: 'Not Assigned',
    paid: 'Paid', pending: 'Pending', overdue: 'Overdue',
    occupied: 'Occupied', vacant: 'Vacant', cleaning: 'Cleaning',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${map[status] ?? map.inactive}`}>
      {status === 'active' || status === 'paid' || status === 'occupied'
        ? <span className="w-1.5 h-1.5 rounded-full bg-current" />
        : null}
      {labels[status] ?? status}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Temperature control
// ---------------------------------------------------------------------------
function TemperatureControl({ value, onChange, loading }) {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => onChange(Math.max(16, value - 1))}
        disabled={loading || value <= 16}
        className="w-9 h-9 rounded-xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700 disabled:opacity-30 transition-colors font-bold text-lg"
      >−</button>
      <div className="flex items-baseline gap-1 min-w-[56px] justify-center">
        {loading
          ? <Loader2 size={16} className="animate-spin text-stone-400" />
          : <span className="text-2xl font-bold text-stone-900 dark:text-stone-100">{value}°</span>
        }
      </div>
      <button
        onClick={() => onChange(Math.min(30, value + 1))}
        disabled={loading || value >= 30}
        className="w-9 h-9 rounded-xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700 disabled:opacity-30 transition-colors font-bold text-lg"
      >+</button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function RoomDetailsScreen() {
  const { guest, booking, roomKey, navigate } = useApp()

  const [dnd,         setDnd]         = useState(false)
  const [temperature, setTemperature] = useState(22)
  const [lateCheckout, setLateCheckout] = useState(null)
  const [toastMsg,    setToastMsg]    = useState(null)

  const { data: room, loading, error } = useFetch(
    () => roomDetailsApi.getRoomDetails({
      roomNumber:    booking?.roomNumber,
      bookingNumber: guest?.bookingNumber,
    }),
    [booking?.roomNumber]
  )

  const { mutate: requestHousekeeping, loading: cleaningLoading } = useMutation(
    () => housekeepingApi.requestCleaning('express')
  )
  const { mutate: setDndApi,   loading: dndLoading   } = useMutation(housekeepingApi.setDoNotDisturb)
  const { mutate: requestLate, loading: lateLoading  } = useMutation(
    () => roomDetailsApi.requestLateCheckout(guest?.bookingNumber)
  )
  const { mutate: setTempApi,  loading: tempLoading  } = useMutation(
    (temp) => roomDetailsApi.setTemperature({ roomNumber: booking?.roomNumber, temperature: temp })
  )

  const toast = (msg) => { setToastMsg(msg); setTimeout(() => setToastMsg(null), 3000) }

  const handleCleaning = async () => {
    await requestHousekeeping()
    toast('Housekeeping request sent!')
  }

  const handleDnd = async () => {
    const next = !dnd
    setDnd(next)
    await setDndApi(next).catch(() => setDnd(!next))
    toast(next ? 'Do Not Disturb activated.' : 'Do Not Disturb deactivated.')
  }

  const handleLateCheckout = async () => {
    const result = await requestLate()
    setLateCheckout(result)
    toast(result.message)
  }

  const handleTemperature = async (temp) => {
    setTemperature(temp)
    await setTempApi(temp).catch(() => {})
  }

  const keyStatus = roomKey ? 'active' : 'not_assigned'
  const folio     = room?.folio ?? booking

  return (
    <div className="flex flex-col min-h-dvh bg-stone-50 dark:bg-stone-950">

      {/* ── TOP BAR ── */}
      <div className="sticky top-0 z-30 bg-white/90 dark:bg-stone-900/90 backdrop-blur-md border-b border-stone-100 dark:border-stone-800 safe-top">
        <div className="flex items-center h-14 px-4 gap-3">
          <button
            onClick={() => navigate(ROUTES.HOME)}
            className="p-2 -ml-2 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors text-stone-600 dark:text-stone-400"
          >
            <ChevronLeft size={22} />
          </button>
          <h1 className="flex-1 font-semibold text-stone-900 dark:text-stone-100">
            Room {booking?.roomNumber}
          </h1>
          {room && <StatusBadge status={room.occupancyStatus} />}
        </div>
      </div>

      {/* ── TOAST ── */}
      {toastMsg && (
        <div className="fixed top-20 inset-x-0 z-50 flex justify-center px-4 pointer-events-none">
          <div className="bg-stone-900 dark:bg-stone-700 text-white text-sm font-medium px-4 py-2.5 rounded-2xl shadow-xl animate-[fadeUp_0.3s_ease-out]">
            {toastMsg}
          </div>
        </div>
      )}

      <main className="flex-1 overflow-y-auto pb-10 space-y-6 pt-4">

        {loading && (
          <div className="flex justify-center py-20">
            <Loader2 size={28} className="animate-spin text-stone-300" />
          </div>
        )}

        {error && (
          <div className="mx-4 p-4 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 flex items-center gap-3">
            <AlertCircle size={18} className="text-red-500 shrink-0" />
            <p className="text-sm text-red-600 dark:text-red-400">Failed to load room details.</p>
          </div>
        )}

        {room && (
          <>
            {/* ── HERO CARD ── */}
            <div className="px-4">
              <div className="rounded-3xl bg-gradient-to-br from-[#0f1f17] to-[#1a3a2a] p-5 text-white overflow-hidden relative">
                <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-white/5 blur-2xl pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full bg-[#c9a84c]/10 blur-2xl pointer-events-none" />
                <div className="relative">
                  {/* Room number */}
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-white/50 text-xs uppercase tracking-widest">Room</p>
                      <p className="text-5xl font-bold tracking-tight leading-none mt-1">{room.roomNumber}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[#c9a84c] font-semibold text-sm">{room.roomType}</p>
                      <p className="text-white/50 text-xs mt-0.5">Floor {room.floor} · {room.sqm}m²</p>
                    </div>
                  </div>

                  {/* Details row */}
                  <div className="mt-5 grid grid-cols-3 gap-3">
                    {[
                      { label: 'View',      value: room.view },
                      { label: 'Bed',       value: room.bedType },
                      { label: 'Nights',    value: `${room.nights} nights` },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-white/8 rounded-xl p-2.5">
                        <p className="text-white/40 text-[10px] uppercase tracking-wide">{label}</p>
                        <p className="text-white text-xs font-semibold mt-0.5 leading-tight">{value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Check-in / check-out */}
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div className="bg-white/8 rounded-xl p-2.5">
                      <p className="text-white/40 text-[10px] uppercase tracking-wide">Checked In</p>
                      <p className="text-white text-xs font-semibold mt-0.5">{formatTime(room.checkInTime)}</p>
                      <p className="text-white/40 text-[10px]">{formatDate(room.checkInTime)}</p>
                    </div>
                    <div className="bg-white/8 rounded-xl p-2.5">
                      <p className="text-white/40 text-[10px] uppercase tracking-wide">
                        {lateCheckout ? 'Late Checkout' : 'Check-out'}
                      </p>
                      <p className="text-white text-xs font-semibold mt-0.5">
                        {formatTime(lateCheckout?.newCheckoutTime ?? room.checkOutTime)}
                      </p>
                      <p className="text-white/40 text-[10px]">
                        {formatDate(lateCheckout?.newCheckoutTime ?? room.checkOutTime)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── AMENITIES ── */}
            <Section title="Room Amenities">
              <div className="grid grid-cols-2 gap-2">
                {room.amenities.map((a) => {
                  const Icon = ICON_MAP[a.icon] ?? Info
                  return (
                    <div
                      key={a.id}
                      className={[
                        'flex items-center gap-2.5 p-3 rounded-xl border',
                        a.available
                          ? 'bg-white dark:bg-stone-900 border-stone-100 dark:border-stone-800'
                          : 'bg-stone-50 dark:bg-stone-900/40 border-stone-100 dark:border-stone-800 opacity-50',
                      ].join(' ')}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${a.available ? 'bg-stone-100 dark:bg-stone-800' : 'bg-stone-100 dark:bg-stone-800'}`}>
                        <Icon size={15} className={a.available ? 'text-stone-600 dark:text-stone-300' : 'text-stone-400'} />
                      </div>
                      <div className="min-w-0">
                        <p className={`text-xs font-medium truncate ${a.available ? 'text-stone-800 dark:text-stone-200' : 'text-stone-400 line-through'}`}>
                          {a.label}
                        </p>
                      </div>
                      {a.available && <CheckCircle2 size={12} className="text-emerald-500 shrink-0 ml-auto" />}
                    </div>
                  )
                })}
              </div>
            </Section>

            {/* ── KEY STATUS ── */}
            <Section title="Digital Key">
              <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-100 dark:border-stone-800 overflow-hidden">
                <div className="px-4 py-3 flex items-center justify-between border-b border-stone-100 dark:border-stone-800">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${roomKey ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-stone-100 dark:bg-stone-800'}`}>
                      {roomKey ? <Nfc size={18} className="text-blue-600 dark:text-blue-400" /> : <KeyRound size={18} className="text-stone-400" />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">NFC Digital Key</p>
                      <p className="text-xs text-stone-400">Tap phone to door sensor</p>
                    </div>
                  </div>
                  <StatusBadge status={keyStatus} />
                </div>

                {roomKey ? (
                  <>
                    <InfoRow label="Key ID"         value={roomKey.id}        last={false} />
                    <InfoRow label="Token"           value={roomKey.nfcToken}  last={false} />
                    <InfoRow label="Activated"       value={formatTime(roomKey.validFrom) + ', ' + formatDate(roomKey.validFrom)} last={false} />
                    <InfoRow label="Expires"         value={formatTime(roomKey.expiresAt) + ', ' + formatDate(roomKey.expiresAt)} last={true}  />
                  </>
                ) : (
                  <div className="px-4 py-4 flex items-center justify-between">
                    <p className="text-sm text-stone-500 dark:text-stone-400">No active key assigned.</p>
                    <button
                      onClick={() => navigate(ROUTES.ROOM_KEY)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 transition-colors"
                    >
                      <KeyRound size={12} />
                      Get Key
                    </button>
                  </div>
                )}
              </div>
            </Section>

            {/* ── PAYMENT STATUS ── */}
            <Section title="Bills & Payment">
              <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-100 dark:border-stone-800 overflow-hidden">
                {/* Summary header */}
                <div className="px-4 py-4 flex items-center justify-between bg-stone-50 dark:bg-stone-800/50 border-b border-stone-100 dark:border-stone-800">
                  <div>
                    <p className="text-xs text-stone-400 uppercase tracking-wide mb-0.5">Current Balance</p>
                    <p className="text-2xl font-bold text-stone-900 dark:text-stone-100">
                      {formatPrice(folio?.balance ?? folio?.folio?.balance ?? 0)}
                    </p>
                  </div>
                  <StatusBadge status={folio?.paymentStatus ?? folio?.folio?.paymentStatus ?? 'pending'} />
                </div>

                {/* Breakdown */}
                {room.folio?.breakdown && Object.entries({
                  'Room Charge':    room.folio.breakdown.roomCharge,
                  'Room Service':   room.folio.breakdown.roomService,
                  'Spa & Wellness': room.folio.breakdown.spa,
                  'Minibar':        room.folio.breakdown.minibar,
                }).map(([label, amount], i, arr) => (
                  <div key={label} className={`flex justify-between items-center px-4 py-2.5 ${i < arr.length - 1 ? 'border-b border-stone-50 dark:border-stone-800/50' : ''}`}>
                    <span className="text-sm text-stone-500 dark:text-stone-400">{label}</span>
                    <span className="text-sm font-medium text-stone-800 dark:text-stone-200">{formatPrice(amount)}</span>
                  </div>
                ))}

                {/* Last payment */}
                {room.folio?.lastPaymentDate && (
                  <div className="px-4 py-3 border-t border-stone-100 dark:border-stone-800 flex items-center gap-2">
                    <CreditCard size={13} className="text-stone-400 shrink-0" />
                    <p className="text-xs text-stone-400">
                      Last payment: <strong className="text-stone-600 dark:text-stone-300">{formatPrice(room.folio.lastPaymentAmount)}</strong> on {formatDate(room.folio.lastPaymentDate)}
                    </p>
                  </div>
                )}

                {/* Make payment CTA */}
                {(folio?.paymentStatus === 'pending' || folio?.paymentStatus === 'overdue') && (
                  <div className="px-4 pb-4 pt-2">
                    <button
                      onClick={() => navigate(ROUTES.CHECKOUT)}
                      className="w-full h-11 rounded-xl bg-[#1a3a2a] hover:bg-[#2d5a42] text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                    >
                      <DollarSign size={15} />
                      Make Payment
                    </button>
                  </div>
                )}

                {/* View full folio */}
                <button
                  onClick={() => navigate(ROUTES.CHECKOUT)}
                  className="w-full flex items-center justify-between px-4 py-3 border-t border-stone-100 dark:border-stone-800 text-sm text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Receipt size={14} />
                    View full invoice
                  </div>
                  <ChevronRight size={14} />
                </button>
              </div>
            </Section>

            {/* ── ROOM CONTROLS ── */}
            <Section title="Room Controls">
              {/* 2×2 quick action grid */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                {/* Housekeeping */}
                <button
                  onClick={handleCleaning}
                  disabled={cleaningLoading || dnd}
                  className="flex flex-col items-start gap-3 p-4 rounded-2xl bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 hover:shadow-md active:scale-[0.98] transition-all disabled:opacity-40 text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-900/20 flex items-center justify-center">
                    {cleaningLoading
                      ? <Loader2 size={18} className="animate-spin text-sky-500" />
                      : <Sparkles size={18} className="text-sky-600 dark:text-sky-400" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">Housekeeping</p>
                    <p className="text-xs text-stone-400 mt-0.5">{dnd ? 'Unavailable (DND)' : 'Request cleaning'}</p>
                  </div>
                </button>

                {/* Do Not Disturb */}
                <button
                  onClick={handleDnd}
                  disabled={dndLoading}
                  className={[
                    'flex flex-col items-start gap-3 p-4 rounded-2xl border hover:shadow-md active:scale-[0.98] transition-all text-left',
                    dnd
                      ? 'bg-red-50 dark:bg-red-900/15 border-red-200 dark:border-red-800'
                      : 'bg-white dark:bg-stone-900 border-stone-100 dark:border-stone-800',
                  ].join(' ')}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${dnd ? 'bg-red-100 dark:bg-red-900/30' : 'bg-stone-100 dark:bg-stone-800'}`}>
                    {dndLoading
                      ? <Loader2 size={18} className="animate-spin text-stone-400" />
                      : <EyeOff size={18} className={dnd ? 'text-red-600 dark:text-red-400' : 'text-stone-500'} />}
                  </div>
                  <div>
                    <p className={`text-sm font-semibold ${dnd ? 'text-red-700 dark:text-red-300' : 'text-stone-900 dark:text-stone-100'}`}>Do Not Disturb</p>
                    <p className={`text-xs mt-0.5 ${dnd ? 'text-red-500 dark:text-red-400' : 'text-stone-400'}`}>{dnd ? 'Active — tap to disable' : 'Tap to enable'}</p>
                  </div>
                </button>

                {/* Late Checkout */}
                <button
                  onClick={handleLateCheckout}
                  disabled={lateLoading || !!lateCheckout}
                  className="flex flex-col items-start gap-3 p-4 rounded-2xl bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 hover:shadow-md active:scale-[0.98] transition-all disabled:opacity-50 text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
                    {lateLoading
                      ? <Loader2 size={18} className="animate-spin text-amber-500" />
                      : lateCheckout
                        ? <CheckCircle2 size={18} className="text-emerald-500" />
                        : <Clock size={18} className="text-amber-600 dark:text-amber-400" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">Late Checkout</p>
                    <p className="text-xs text-stone-400 mt-0.5">
                      {lateCheckout ? `Approved · ${formatTime(lateCheckout.newCheckoutTime)}` : 'Request until 14:00'}
                    </p>
                  </div>
                </button>

                {/* Temperature */}
                <div className="flex flex-col items-start gap-3 p-4 rounded-2xl bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800">
                  <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center">
                    <Thermometer size={18} className="text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-stone-900 dark:text-stone-100 mb-1">Temperature</p>
                    <TemperatureControl
                      value={temperature}
                      onChange={handleTemperature}
                      loading={false}
                    />
                  </div>
                </div>
              </div>
            </Section>
          </>
        )}
      </main>

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
