import { useState, useEffect, useRef } from 'react'
import {
  ChevronLeft, CheckCircle2, Wifi, Nfc, Loader2,
  AlertCircle, RefreshCw, KeyRound, ShieldCheck, Clock,
  Smartphone, Zap,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useMutation } from '../hooks/useFetch'
import { roomKeyApi } from '../services/api'
import { ROUTES } from '../constants'
import { formatDate, formatTime } from '../utils'

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------
const STATUS_META = {
  not_assigned: { label: 'Not Ready',  color: 'bg-stone-700 text-stone-300 border-stone-600' },
  assigning:    { label: 'Assigning…', color: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  active:       { label: 'Active',     color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
  error:        { label: 'Failed',     color: 'bg-red-500/20 text-red-300 border-red-500/40' },
}

function KeyStatusBadge({ status }) {
  const meta = STATUS_META[status] ?? STATUS_META.not_assigned
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${meta.color}`}>
      {status === 'assigning' && <Loader2 size={10} className="animate-spin" />}
      {status === 'active'    && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
      {meta.label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Check-in progress steps (top of screen)
// ---------------------------------------------------------------------------
const CHECKIN_STEPS = [
  { id: 'booking', label: 'Booking verified' },
  { id: 'id',      label: 'ID verified'      },
  { id: 'key',     label: 'Digital key'      },
]

function CheckinProgress({ idVerified, keyActive }) {
  const statuses = [true, idVerified, keyActive]

  return (
    <div className="flex items-center gap-0">
      {CHECKIN_STEPS.map(({ label }, i) => {
        const done    = statuses[i]
        const current = !done && (i === 0 || statuses[i - 1])
        return (
          <div key={i} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div className={[
                'w-8 h-8 rounded-full flex items-center justify-center transition-all duration-500',
                done
                  ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]'
                  : current
                    ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)] ring-2 ring-emerald-400/30 ring-offset-2 ring-offset-stone-950'
                    : 'bg-stone-800 border border-stone-700',
              ].join(' ')}>
                {done
                  ? <CheckCircle2 size={16} className="text-white" />
                  : current
                    ? <Loader2 size={14} className="text-white animate-spin" />
                    : <span className="text-stone-500 text-xs font-bold">{i + 1}</span>
                }
              </div>
              <span className={`text-[10px] font-medium whitespace-nowrap ${done ? 'text-emerald-400' : current ? 'text-emerald-400' : 'text-stone-600'}`}>
                {label}
              </span>
            </div>
            {i < CHECKIN_STEPS.length - 1 && (
              <div className={`w-10 h-0.5 -mt-4 mx-1 rounded-full transition-all duration-700 ${statuses[i] ? 'bg-emerald-500/60' : 'bg-stone-800'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Animated NFC / key card visual
// ---------------------------------------------------------------------------
function KeyCard({ status, roomNumber, floor }) {
  const isActive    = status === 'active'
  const isAssigning = status === 'assigning'

  return (
    <div className="relative flex items-center justify-center py-2">
      {/* Outer glow rings — only when active */}
      {isActive && (
        <>
          <div className="absolute w-72 h-72 rounded-full border border-emerald-500/10 animate-[ringPulse_3s_ease-in-out_infinite]" />
          <div className="absolute w-56 h-56 rounded-full border border-emerald-500/15 animate-[ringPulse_3s_ease-in-out_infinite_0.4s]" />
          <div className="absolute w-40 h-40 rounded-full border border-emerald-500/20 animate-[ringPulse_3s_ease-in-out_infinite_0.8s]" />
        </>
      )}
      {/* Processing rings */}
      {isAssigning && (
        <div className="absolute w-56 h-56 rounded-full border-2 border-dashed border-emerald-500/30 animate-spin" style={{ animationDuration: '4s' }} />
      )}

      {/* Card */}
      <div className={[
        'relative w-64 rounded-3xl overflow-hidden transition-all duration-700',
        'shadow-2xl',
        isActive
          ? 'shadow-emerald-500/30 scale-100'
          : isAssigning
            ? 'scale-95 opacity-80'
            : 'scale-90 opacity-60',
      ].join(' ')}
        style={{ aspectRatio: '1.586' }}
      >
        {/* Card gradient background */}
        <div className={[
          'absolute inset-0 transition-all duration-700',
          isActive
            ? 'bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900'
            : 'bg-gradient-to-br from-stone-800 via-stone-850 to-stone-900',
        ].join(' ')} />

        {/* Shimmer overlay */}
        {isActive && (
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent" />
        )}

        {/* NFC wave lines in corner */}
        <div className="absolute top-4 right-4 flex flex-col gap-1 items-end">
          {[14, 10, 6].map((size, i) => (
            <div
              key={i}
              className={`rounded-full border-t-2 border-r-2 transition-colors duration-500 ${isActive ? 'border-emerald-400/70' : 'border-stone-600'}`}
              style={{ width: size, height: size }}
            />
          ))}
        </div>

        {/* Hotel logo chip */}
        <div className="absolute top-4 left-4">
          <div className={`w-10 h-7 rounded-md flex items-center justify-center text-xs font-bold transition-colors duration-500 ${isActive ? 'bg-emerald-500/30 text-emerald-200 border border-emerald-500/40' : 'bg-stone-700 text-stone-500 border border-stone-600'}`}>
            DE
          </div>
        </div>

        {/* Room info */}
        <div className="absolute bottom-4 left-4 right-4">
          <div className="flex items-end justify-between">
            <div>
              <p className={`text-[10px] font-medium uppercase tracking-widest mb-0.5 transition-colors ${isActive ? 'text-emerald-300/70' : 'text-stone-600'}`}>
                Room
              </p>
              <p className={`text-2xl font-bold tracking-tight transition-colors duration-500 ${isActive ? 'text-white' : 'text-stone-500'}`}>
                {roomNumber ?? '—'}
              </p>
              {floor && (
                <p className={`text-[10px] transition-colors ${isActive ? 'text-stone-400' : 'text-stone-700'}`}>
                  Floor {floor}
                </p>
              )}
            </div>
            <div className={`transition-colors duration-500 ${isActive ? 'text-emerald-400' : 'text-stone-700'}`}>
              {isAssigning
                ? <Loader2 size={22} className="animate-spin text-emerald-400" />
                : isActive
                  ? <Nfc size={22} />
                  : <KeyRound size={22} />
              }
            </div>
          </div>
        </div>

        {/* Active glow edge */}
        {isActive && (
          <div className="absolute inset-0 rounded-3xl ring-1 ring-emerald-500/40 shadow-[inset_0_0_20px_rgba(16,185,129,0.08)]" />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Key details panel (shown after activation)
// ---------------------------------------------------------------------------
function KeyDetails({ roomKey }) {
  const details = [
    { icon: Nfc,        label: 'Type',    value: 'NFC Digital Key' },
    { icon: Clock,      label: 'Valid from', value: formatTime(roomKey.validFrom) + ', ' + formatDate(roomKey.validFrom) },
    { icon: Clock,      label: 'Expires', value: formatTime(roomKey.expiresAt) + ', ' + formatDate(roomKey.expiresAt) },
    { icon: Smartphone, label: 'Token',   value: roomKey.nfcToken },
  ]

  return (
    <div className="mx-5 rounded-2xl bg-stone-900 border border-stone-800 overflow-hidden divide-y divide-stone-800 animate-[fadeUp_0.4s_ease-out]">
      {details.map(({ icon: Icon, label, value }) => (
        <div key={label} className="flex items-center gap-3 px-4 py-3">
          <div className="w-7 h-7 rounded-lg bg-stone-800 flex items-center justify-center shrink-0">
            <Icon size={13} className="text-stone-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-stone-500 uppercase tracking-wide">{label}</p>
            <p className="text-sm font-medium text-stone-200 truncate">{value}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// How to use instructions
// ---------------------------------------------------------------------------
function HowToUse() {
  const steps = [
    { icon: Smartphone, text: 'Open this app on your phone' },
    { icon: Nfc,        text: 'Hold phone near the door sensor' },
    { icon: Zap,        text: 'Wait for the green light' },
  ]
  return (
    <div className="mx-5 mt-4 rounded-2xl bg-stone-900 border border-stone-800 p-4 animate-[fadeUp_0.4s_ease-out_0.1s_both]">
      <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3">How to use</p>
      <div className="flex flex-col gap-3">
        {steps.map(({ icon: Icon, text }, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <Icon size={11} className="text-emerald-400" />
            </div>
            <p className="text-sm text-stone-300">{text}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function RoomKeyScreen() {
  const { guest, booking, idVerified, roomKey: storedKey, setRoomKey, navigate } = useApp()

  // phase: idle | assigning | active | error
  const [phase,    setPhase]    = useState(storedKey ? 'active' : 'idle')
  const [roomKey,  setLocalKey] = useState(storedKey)
  const [errorMsg, setErrorMsg] = useState(null)
  const redirectTimer = useRef(null)

  const { mutate: assignKey, loading: assigning } = useMutation(roomKeyApi.assignRoomKey)

  // Auto-redirect after activation (2s)
  useEffect(() => {
    if (phase === 'active' && !storedKey) {
      // Only auto-redirect when freshly activated, not when already had a key
      redirectTimer.current = setTimeout(() => navigate(ROUTES.HOME), 2500)
    }
    return () => clearTimeout(redirectTimer.current)
  }, [phase, storedKey, navigate])

  const handleAssign = async () => {
    setPhase('assigning')
    setErrorMsg(null)
    try {
      const result = await assignKey({
        guestId:       guest?.id,
        bookingNumber: guest?.bookingNumber,
        roomNumber:    booking?.roomNumber,
      })
      const key = result.roomKey
      setLocalKey(key)
      setRoomKey(key)
      setPhase('active')
    } catch (err) {
      setErrorMsg(err.message || 'Failed to assign key. Please try again.')
      setPhase('error')
    }
  }

  const handleRetry = () => {
    setPhase('idle')
    setErrorMsg(null)
    handleAssign()
  }

  const keyStatus = phase === 'assigning' ? 'assigning' : phase === 'active' ? 'active' : phase === 'error' ? 'error' : 'not_assigned'
  const isActive  = phase === 'active'

  return (
    <div className="fixed inset-0 flex flex-col bg-stone-950 text-white overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
        <button
          onClick={() => navigate(ROUTES.HOME)}
          className="w-9 h-9 rounded-xl bg-stone-800 hover:bg-stone-700 flex items-center justify-center text-stone-300 transition-colors"
        >
          <ChevronLeft size={20} />
        </button>
        <span className="text-xs font-semibold text-stone-400 uppercase tracking-widest">Digital Key</span>
        <div className="w-9" />
      </div>

      {/* Check-in progress */}
      <div className="flex justify-center px-5 pb-5">
        <CheckinProgress idVerified={idVerified} keyActive={isActive} />
      </div>

      {/* Room number + status */}
      <div className="flex flex-col items-center gap-2 px-5 pb-4">
        <div className="flex items-center gap-3">
          <h1 className={`text-4xl font-bold tracking-tight transition-all duration-500 ${isActive ? 'text-white' : 'text-stone-500'}`}>
            Room {booking?.roomNumber ?? '—'}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <KeyStatusBadge status={keyStatus} />
          {isActive && (
            <span className="text-xs text-stone-500">
              {booking?.roomType}
            </span>
          )}
        </div>
      </div>

      {/* Key card visual */}
      <div className="px-5 py-2">
        <KeyCard
          status={keyStatus}
          roomNumber={booking?.roomNumber}
          floor={booking?.floor}
        />
      </div>

      {/* Success message */}
      {isActive && (
        <div className="flex flex-col items-center gap-1 pb-4 animate-[fadeUp_0.5s_ease-out]">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-emerald-400" />
            <p className="text-sm font-semibold text-emerald-400">Key Active</p>
          </div>
          {!storedKey && (
            <p className="text-xs text-stone-500">Redirecting to dashboard…</p>
          )}
        </div>
      )}

      {/* CTA / error */}
      <div className="px-5 pb-5">
        {phase === 'error' ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/25">
              <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-300 leading-snug">{errorMsg}</p>
            </div>
            <button
              onClick={handleRetry}
              className="w-full h-13 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
              style={{ height: 52 }}
            >
              <RefreshCw size={16} />
              Try Again
            </button>
          </div>
        ) : phase === 'idle' ? (
          <button
            onClick={handleAssign}
            className="w-full rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-semibold text-sm flex items-center justify-center gap-2.5 transition-all shadow-lg shadow-emerald-600/25"
            style={{ height: 52 }}
          >
            <KeyRound size={17} />
            Activate Digital Key
          </button>
        ) : phase === 'assigning' ? (
          <div
            className="w-full rounded-2xl bg-emerald-600/40 border border-emerald-500/30 text-emerald-300 font-semibold text-sm flex items-center justify-center gap-2.5"
            style={{ height: 52 }}
          >
            <Loader2 size={17} className="animate-spin" />
            Provisioning key…
          </div>
        ) : (
          /* active — show "go to dashboard" */
          <button
            onClick={() => navigate(ROUTES.HOME)}
            className="w-full rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-semibold text-sm flex items-center justify-center gap-2.5 transition-all shadow-lg shadow-emerald-600/25"
            style={{ height: 52 }}
          >
            <CheckCircle2 size={17} />
            Go to Dashboard
          </button>
        )}
      </div>

      {/* Key details + how-to (once active) */}
      {isActive && roomKey && (
        <>
          <KeyDetails roomKey={roomKey} />
          <HowToUse />
          <div className="h-8" />
        </>
      )}

      <style>{`
        @keyframes ringPulse {
          0%, 100% { transform: scale(1);    opacity: 0.6; }
          50%       { transform: scale(1.08); opacity: 0.2; }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
