import { useState, useEffect } from 'react'
import { BookOpen, User, Eye, EyeOff, AlertCircle, CheckCircle2, ChevronRight, Loader2 } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { ROUTES } from '../constants'

// ---------------------------------------------------------------------------
// Field component (self-contained for this screen)
// ---------------------------------------------------------------------------
function Field({ label, placeholder, value, onChange, error, type = 'text', icon: Icon, rightSlot, hint }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-white/80">{label}</label>
      <div className="relative">
        {Icon && (
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none">
            <Icon size={16} />
          </div>
        )}
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          autoComplete="off"
          className={[
            'w-full h-12 rounded-xl text-sm font-medium transition-all outline-none',
            'bg-white/10 border placeholder:text-white/30 text-white',
            'focus:bg-white/15 focus:border-white/50',
            Icon ? 'pl-10 pr-4' : 'px-4',
            rightSlot ? 'pr-11' : '',
            error
              ? 'border-red-400/60 bg-red-500/10'
              : 'border-white/20',
          ].join(' ')}
        />
        {rightSlot && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">{rightSlot}</div>
        )}
      </div>
      {error && (
        <p className="flex items-center gap-1.5 text-xs text-red-300">
          <AlertCircle size={11} />
          {error}
        </p>
      )}
      {hint && !error && (
        <p className="text-xs text-white/40">{hint}</p>
      )}
    </div>
  )
}


// ---------------------------------------------------------------------------
// Animated success overlay
// ---------------------------------------------------------------------------
function SuccessOverlay({ guest }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-blue-600 to-blue-900 z-10 animate-[fadeIn_0.3s_ease-out]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-20 h-20 rounded-full bg-white/15 border-2 border-white/30 flex items-center justify-center animate-[scaleIn_0.4s_cubic-bezier(0.34,1.56,0.64,1)_0.1s_both]">
          <CheckCircle2 size={40} className="text-white" />
        </div>
        <div className="text-center animate-[fadeUp_0.4s_ease-out_0.3s_both]">
          <p className="text-white/70 text-sm">Welcome back</p>
          <h2 className="text-white text-2xl font-bold mt-0.5">
            {guest.firstName} {guest.lastName}
          </h2>
        </div>
        <div className="flex gap-1.5 animate-[fadeUp_0.4s_ease-out_0.5s_both]">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-white/50 animate-[bounce_1s_ease-in-out_infinite]"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function LoginScreen() {
  const { login, authLoading, authError, guest, navigate } = useApp()

  const [bookingNumber, setBookingNumber] = useState('')
  const [lastName,      setLastName]      = useState('')
  const [showLastName,  setShowLastName]  = useState(false)
  const [errors,        setErrors]        = useState({})
  const [loginSuccess,  setLoginSuccess]  = useState(false)

  // After success animation completes, navigate to HOME
  useEffect(() => {
    if (loginSuccess) {
      const t = setTimeout(() => navigate(ROUTES.HOME), 1600)
      return () => clearTimeout(t)
    }
  }, [loginSuccess, navigate])

  const validate = () => {
    const e = {}
    const bn = bookingNumber.trim()
    if (!bn) {
      e.bookingNumber = 'Booking number is required.'
    } else if (bn.length < 3) {
      e.bookingNumber = 'Booking number looks too short.'
    }
    if (!lastName.trim()) {
      e.lastName = 'Last name is required.'
    } else if (lastName.trim().length < 2) {
      e.lastName = 'Please enter your full last name.'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    const success = await login({
      bookingNumber,
      lastName,
    })
    if (success) setLoginSuccess(true)
  }


  return (
    <div className="relative min-h-dvh flex flex-col overflow-hidden bg-gradient-to-br from-blue-950 via-blue-800 to-blue-600">
      {/* Success overlay */}
      {loginSuccess && guest && <SuccessOverlay guest={guest} />}

      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-blue-400/20 blur-3xl" />
        <div className="absolute top-1/2 -left-32  w-80 h-80 rounded-full bg-blue-300/10 blur-3xl" />
        <div className="absolute -bottom-20 right-20 w-64 h-64 rounded-full bg-indigo-500/20 blur-3xl" />
        {/* Subtle grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
      </div>

      {/* Content */}
      <div className="relative flex-1 flex flex-col px-5 pt-14 pb-10">

        {/* Logo + headline */}
        <div className="flex flex-col items-center gap-3 mb-10">
          <div className="w-16 h-16 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center shadow-2xl backdrop-blur-sm">
            <span className="text-white font-bold text-2xl tracking-tighter">DE</span>
          </div>
          <div className="text-center">
            <h1 className="text-white text-2xl font-bold tracking-tight">das elb</h1>
            <p className="text-white/50 text-xs mt-0.5 tracking-widest uppercase">Magdeburg · Guest Portal</p>
          </div>
        </div>

        {/* Login card */}
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-6 shadow-2xl">
          <h2 className="text-white text-lg font-semibold mb-1">Sign in to your stay</h2>
          <p className="text-white/50 text-sm mb-6">
            Use your booking confirmation details to access your room services.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            <Field
              label="Booking Number"
              placeholder="e.g. SWED0416-012 or BK000123"
              value={bookingNumber}
              onChange={(e) => {
                setBookingNumber(e.target.value)
                setErrors((p) => ({ ...p, bookingNumber: '' }))
              }}
              error={errors.bookingNumber}
              icon={BookOpen}
              hint="Exactly as shown in your confirmation email"
            />

            <Field
              label="Last Name"
              placeholder="As on your booking"
              value={lastName}
              onChange={(e) => {
                setLastName(e.target.value)
                setErrors((p) => ({ ...p, lastName: '' }))
              }}
              error={errors.lastName}
              type={showLastName ? 'text' : 'password'}
              icon={User}
              rightSlot={
                <button
                  type="button"
                  onClick={() => setShowLastName((v) => !v)}
                  className="text-white/40 hover:text-white/70 transition-colors p-1"
                >
                  {showLastName ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              }
            />

            {/* API error */}
            {authError && (
              <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-500/15 border border-red-400/30">
                <AlertCircle size={15} className="text-red-300 mt-0.5 shrink-0" />
                <p className="text-sm text-red-200 leading-snug">{authError}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={authLoading}
              className={[
                'w-full h-13 rounded-xl flex items-center justify-center gap-2.5',
                'font-semibold text-sm transition-all duration-150 mt-1',
                'bg-white text-blue-900 shadow-lg shadow-blue-900/30',
                'hover:bg-blue-50 active:scale-[0.98]',
                'disabled:opacity-60 disabled:cursor-not-allowed',
              ].join(' ')}
            >
              {authLoading ? (
                <>
                  <Loader2 size={17} className="animate-spin" />
                  <span>Signing in…</span>
                </>
              ) : (
                <>
                  <span>Access My Stay</span>
                  <ChevronRight size={17} />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-white/30 mt-6">
          Need help?{' '}
          <span className="text-white/50 font-medium">Call reception · ext. 0</span>
        </p>
      </div>

      <style>{`
        @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.5) } to { opacity: 1; transform: scale(1) } }
        @keyframes fadeUp  { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>
    </div>
  )
}
