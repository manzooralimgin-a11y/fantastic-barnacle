import { useState } from 'react'
import {
  ChevronLeft, LogOut, CheckCircle2, Star, BedDouble,
  Clock, Receipt, Download, Check, AlertCircle,
  CreditCard, ArrowRight, KeyRound, Building2,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useFetch, useMutation } from '../hooks/useFetch'
import { billingApi, checkoutApi } from '../services/api'
import BottomNav from '../components/BottomNav'
import Spinner from '../components/Spinner'
import { ROUTES } from '../constants'
import { formatPrice } from '../utils'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function shortDate(iso) {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso))
}
function coTime(iso) {
  if (!iso) return '11:00'
  return new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

const CAT_LABELS = {
  room: 'Accommodation', restaurant: 'Restaurant',
  minibar: 'Minibar', service: 'Services', other: 'Other',
}

// ─── Step indicator ───────────────────────────────────────────────────────────
function StepDots({ current, total = 3 }) {
  return (
    <div className="flex items-center justify-center gap-2 py-2.5">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={[
            'rounded-full transition-all duration-300',
            i + 1 === current ? 'w-6 h-1.5 bg-[#D4AF37]' :
            i + 1 < current   ? 'w-1.5 h-1.5 bg-[#D4AF37]/50' :
                                'w-1.5 h-1.5 bg-white/15',
          ].join(' ')}
        />
      ))}
    </div>
  )
}

// ─── Checklist item ───────────────────────────────────────────────────────────
function CheckItem({ checked, label, sub, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className={[
        'w-full flex items-center gap-4 p-4 rounded-2xl border text-left active:scale-[0.98] transition-all duration-150',
        checked ? 'bg-emerald-900/20 border-emerald-700/30' : 'bg-[#0f1628] border-white/6',
      ].join(' ')}
    >
      <div className={[
        'w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all',
        checked ? 'bg-emerald-500 border-emerald-500' : 'border-stone-600',
      ].join(' ')}>
        {checked && <Check size={13} strokeWidth={3} className="text-white" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${checked ? 'text-emerald-300' : 'text-stone-200'}`}>{label}</p>
        {sub && <p className="text-stone-600 text-xs mt-0.5">{sub}</p>}
      </div>
    </button>
  )
}

// ─── Compact bill preview ─────────────────────────────────────────────────────
function BillPreview({ bill }) {
  const catSums = {}
  for (const item of bill.items) {
    const cat = item.category in CAT_LABELS ? item.category : 'other'
    catSums[cat] = (catSums[cat] ?? 0) + item.total
  }
  const cats = Object.keys(CAT_LABELS).filter((c) => (catSums[c] ?? 0) > 0)
  return (
    <div className="rounded-2xl bg-[#0f1628] border border-white/6 overflow-hidden">
      <div className="flex items-center gap-2 px-4 pt-3.5 pb-2.5 border-b border-white/6">
        <Receipt size={13} className="text-stone-500" />
        <p className="text-stone-500 text-[10px] uppercase tracking-widest font-semibold">Bill Preview</p>
      </div>
      <div className="divide-y divide-white/[0.04]">
        {cats.map((cat) => (
          <div key={cat} className="flex items-center justify-between px-4 py-2.5">
            <span className="text-stone-400 text-sm">{CAT_LABELS[cat]}</span>
            <span className="text-stone-200 text-sm">{formatPrice(catSums[cat], bill.currency)}</span>
          </div>
        ))}
        <div className="flex items-center justify-between px-4 py-2">
          <span className="text-stone-600 text-xs">Subtotal</span>
          <span className="text-stone-500 text-xs">{formatPrice(bill.subtotal, bill.currency)}</span>
        </div>
        <div className="flex items-center justify-between px-4 py-2">
          <span className="text-stone-600 text-xs">Tax ({Math.round((bill.taxRate ?? 0.07) * 100)}%)</span>
          <span className="text-stone-500 text-xs">{formatPrice(bill.taxAmount, bill.currency)}</span>
        </div>
        <div className="flex items-center justify-between px-4 py-3.5 bg-white/[0.02]">
          <span className="text-white font-bold text-sm">Total</span>
          <span className="text-[#D4AF37] font-bold text-lg">{formatPrice(bill.total, bill.currency)}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Star rating ──────────────────────────────────────────────────────────────
const STAR_LABELS = { 1: 'Poor', 2: 'Fair', 3: 'Good', 4: 'Great', 5: 'Excellent!' }

function StarRating({ value, onChange }) {
  const [hover, setHover] = useState(0)
  const active = hover || value
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => onChange(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            className="p-1.5 active:scale-90 transition-transform"
          >
            <Star
              size={30}
              fill={n <= active ? 'currentColor' : 'none'}
              className={n <= active ? 'text-[#D4AF37]' : 'text-stone-700'}
            />
          </button>
        ))}
      </div>
      {active > 0 && (
        <p className="text-stone-400 text-xs font-medium">{STAR_LABELS[active]}</p>
      )}
    </div>
  )
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function CheckoutScreen() {
  const { guest, booking, navigate, logout } = useApp()
  const [step,            setStep]     = useState('summary')
  const [checklist,       setChecklist] = useState({ keys: false, items: false, damage: false })
  const [feedback,        setFeedback]  = useState('')
  const [rating,          setRating]    = useState(0)
  const [confirmation,    setConf]      = useState(null)
  const [ratingSubmitted, setRateDone]  = useState(false)

  const { data: bills, loading: billLoading } = useFetch(
    () => billingApi.getBills(guest?.id ?? 'g-001', booking),
    []
  )
  const { mutate: doConfirm, loading: confirming, error: confirmError } = useMutation(checkoutApi.confirmCheckout)

  const bill       = bills?.current
  const coT        = booking?.checkOutDate ? coTime(booking.checkOutDate) : '11:00'
  const allChecked = checklist.keys && checklist.items && checklist.damage
  const doneCount  = Object.values(checklist).filter(Boolean).length

  const handleConfirm = async () => {
    const result = await doConfirm({ guestId: guest?.id ?? 'g-001', feedback, rating, booking })
    if (result?.success) { setConf(result); setStep('success') }
  }

  // ── SUCCESS ───────────────────────────────────────────────────────────────
  if (step === 'success' && confirmation) {
    return (
      <div className="flex flex-col min-h-dvh bg-[#080c18] overflow-y-auto">
        <div className="safe-top" />

        <div className="flex flex-col items-center text-center px-5 pt-10 pb-4">
          {/* Animated check */}
          <div className="relative mb-6">
            <div className="w-24 h-24 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <CheckCircle2 size={44} className="text-emerald-400" strokeWidth={1.5} />
            </div>
            <div className="absolute inset-0 rounded-full bg-emerald-500/5 animate-ping" />
          </div>

          <h1 className="text-2xl font-bold text-white mb-1">Thank you for staying!</h1>
          <p className="text-stone-300 text-sm font-medium">{guest?.firstName} {guest?.lastName}</p>
          <p className="text-stone-600 text-xs mt-1 mb-8">
            {shortDate(booking?.checkInDate)} – {shortDate(booking?.checkOutDate)}
          </p>

          {/* Confirmation card */}
          <div className="w-full rounded-2xl bg-[#0f1628] border border-white/8 overflow-hidden mb-4 text-left">
            <div className="divide-y divide-white/6">
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-stone-500 text-xs uppercase tracking-wider">Confirmation</span>
                <span className="text-[#D4AF37] font-mono text-sm font-bold">{confirmation.confirmationNumber}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-stone-500 text-xs uppercase tracking-wider">Checkout</span>
                <span className="text-stone-200 text-sm">{confirmation.checkoutTime} · {shortDate(confirmation.checkoutDate)}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-stone-500 text-xs uppercase tracking-wider">Invoice</span>
                <span className="text-stone-300 text-sm font-mono">{confirmation.invoiceId}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-4 bg-white/[0.02]">
                <span className="text-white font-semibold text-sm">Final Amount</span>
                <span className="text-[#D4AF37] font-bold text-lg">{formatPrice(confirmation.finalAmount, confirmation.currency)}</span>
              </div>
            </div>
          </div>

          {/* Key notice */}
          <div className="w-full flex items-start gap-3 px-4 py-3 rounded-xl bg-stone-900/50 border border-stone-800 mb-6 text-left">
            <KeyRound size={14} className="text-stone-500 shrink-0 mt-0.5" />
            <p className="text-stone-500 text-xs leading-relaxed">
              Your digital key will deactivate at <span className="text-stone-300 font-medium">{coT}</span>. Please vacate your room by checkout time.
            </p>
          </div>

          {/* Rating */}
          {!ratingSubmitted ? (
            <div className="w-full mb-4">
              <p className="text-stone-400 text-sm mb-3">How was your stay?</p>
              <StarRating value={rating} onChange={setRating} />
              {rating > 0 && (
                <button
                  onClick={() => setRateDone(true)}
                  className="mt-3 px-5 py-2 rounded-xl bg-[#1A2B48] border border-[#2a3f6f] text-[#D4AF37] text-sm font-medium"
                >
                  Submit Rating
                </button>
              )}
            </div>
          ) : (
            <div className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-emerald-900/20 border border-emerald-700/20 mb-4">
              <CheckCircle2 size={14} className="text-emerald-400" />
              <p className="text-emerald-300 text-sm">Thanks for your feedback!</p>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="px-5 pb-10 space-y-2.5">
          <button
            onClick={() => navigate(ROUTES.BILLING)}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-[#0f1628] border border-white/8 text-stone-300 font-medium text-sm hover:border-white/15 transition-colors"
          >
            <Download size={16} />
            Download Invoice
          </button>
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-[#1A2B48] border border-[#2a3f6f] text-[#D4AF37] font-bold text-base hover:border-[#D4AF37]/40 active:scale-[0.98] transition-all"
          >
            Done
            <ArrowRight size={18} />
          </button>
        </div>

        <p className="text-center text-xs text-stone-700 pb-8 px-6">
          We look forward to welcoming you back at Das Elb Magdeburg.
        </p>
      </div>
    )
  }

  // ── Loading state ─────────────────────────────────────────────────────────
  if (billLoading) {
    return (
      <div className="flex flex-col min-h-dvh bg-[#080c18]">
        <div className="safe-top" />
        <div className="flex items-center gap-3 px-4 pt-3 pb-2">
          <button onClick={() => navigate(ROUTES.HOME)} className="w-9 h-9 rounded-xl flex items-center justify-center text-white/40 hover:text-white hover:bg-white/8">
            <ChevronLeft size={20} />
          </button>
          <p className="text-white font-semibold text-sm">Check Out</p>
        </div>
        <div className="flex-1 flex items-center justify-center"><Spinner size={32} /></div>
        <BottomNav />
      </div>
    )
  }

  // ── Shared header (steps 1–3) ─────────────────────────────────────────────
  const TITLES = { summary: 'Check Out', checklist: 'Pre-Checkout', confirm: 'Confirm Checkout' }
  const BACKS  = {
    summary:   () => navigate(ROUTES.HOME),
    checklist: () => setStep('summary'),
    confirm:   () => setStep('checklist'),
  }
  const NUMS = { summary: 1, checklist: 2, confirm: 3 }

  return (
    <div className="flex flex-col min-h-dvh bg-[#080c18]">
      <div className="safe-top" />

      {/* Header */}
      <div className="bg-[#0f1628] border-b border-white/5 shrink-0">
        <div className="flex items-center gap-3 px-4 pt-4 pb-1">
          <button
            onClick={BACKS[step]}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white/40 hover:text-white hover:bg-white/8 transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <p className="flex-1 text-white font-bold text-base">{TITLES[step]}</p>
          <p className="text-stone-600 text-xs">Step {NUMS[step]} of 3</p>
        </div>
        <StepDots current={NUMS[step]} />
      </div>

      {/* ── SUMMARY ───────────────────────────────────────────────────────── */}
      {step === 'summary' && (
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 pt-4 pb-4 space-y-3">

            {/* Stay summary */}
            <div className="rounded-2xl bg-[#0f1628] border border-white/8 overflow-hidden">
              <div className="flex items-center gap-2.5 px-4 pt-4 pb-3 border-b border-white/6">
                <BedDouble size={16} className="text-[#D4AF37]" strokeWidth={1.8} />
                <div>
                  <p className="text-white font-semibold text-sm leading-tight">
                    Room {booking?.roomNumber} · {booking?.roomType}
                  </p>
                  <p className="text-stone-500 text-xs">Floor {booking?.floor}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-0 divide-x divide-white/4">
                <div className="px-4 py-3">
                  <p className="text-stone-600 text-[10px] uppercase tracking-wider mb-1">Check-in</p>
                  <p className="text-stone-200 text-sm font-medium">{shortDate(booking?.checkInDate)}</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-stone-600 text-[10px] uppercase tracking-wider mb-1">Check-out</p>
                  <p className="text-stone-200 text-sm font-medium">{shortDate(booking?.checkOutDate)}</p>
                </div>
                <div className="px-4 py-3 border-t border-white/4">
                  <p className="text-stone-600 text-[10px] uppercase tracking-wider mb-1">Nights</p>
                  <p className="text-stone-200 text-sm font-medium">{booking?.nights}</p>
                </div>
                <div className="px-4 py-3 border-t border-white/4">
                  <p className="text-stone-600 text-[10px] uppercase tracking-wider mb-1">Checkout Time</p>
                  <p className="text-[#D4AF37] text-sm font-semibold">{coT}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 px-4 py-2.5 border-t border-white/4">
                <Clock size={11} className="text-stone-700 shrink-0" />
                <p className="text-stone-700 text-[11px]">
                  Standard checkout is at {coT}. Contact front desk for late checkout.
                </p>
              </div>
            </div>

            {/* Bill preview */}
            {bill
              ? <BillPreview bill={bill} />
              : (
                <div className="rounded-2xl bg-[#0f1628] border border-white/6 p-4 text-center">
                  <p className="text-stone-500 text-sm">Bill unavailable</p>
                </div>
              )
            }

            {/* Info note */}
            <div className="rounded-xl bg-[#1A2B48]/30 border border-[#2a3f6f]/30 px-4 py-3">
              <p className="text-stone-500 text-xs leading-relaxed">
                Your final bill will be settled at the front desk or charged to the payment method on file.
              </p>
            </div>

            {/* CTA */}
            <button
              onClick={() => setStep('checklist')}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-[#1A2B48] border border-[#2a3f6f] text-[#D4AF37] font-bold text-base hover:border-[#D4AF37]/50 active:scale-[0.98] transition-all"
            >
              Start Checkout
              <ArrowRight size={18} />
            </button>
          </div>

          <BottomNav />
        </div>
      )}

      {/* ── CHECKLIST ─────────────────────────────────────────────────────── */}
      {step === 'checklist' && (
        <div className="flex-1 overflow-y-auto px-4 pt-5 pb-10 space-y-3">
          <div className="mb-1">
            <h2 className="text-white font-bold text-xl mb-1">Before you go…</h2>
            <p className="text-stone-500 text-sm">Please confirm each item below.</p>
          </div>

          <div className="space-y-2.5">
            <CheckItem
              checked={checklist.keys}
              label="Room keys returned"
              sub="Return all key cards to the front desk"
              onToggle={() => setChecklist((p) => ({ ...p, keys: !p.keys }))}
            />
            <CheckItem
              checked={checklist.items}
              label="All personal items collected"
              sub="Check drawers, wardrobe, safe, and bathroom"
              onToggle={() => setChecklist((p) => ({ ...p, items: !p.items }))}
            />
            <CheckItem
              checked={checklist.damage}
              label="No damage to report"
              sub="Any issues? Uncheck and contact the front desk"
              onToggle={() => setChecklist((p) => ({ ...p, damage: !p.damage }))}
            />
          </div>

          {/* Progress bar */}
          <div className="flex items-center gap-3 px-1 pt-1">
            <div className="flex-1 h-1.5 rounded-full bg-white/8 overflow-hidden">
              <div
                className="h-full rounded-full bg-[#D4AF37] transition-all duration-500"
                style={{ width: `${(doneCount / 3) * 100}%` }}
              />
            </div>
            <span className="text-stone-500 text-xs w-8 text-right">{doneCount}/3</span>
          </div>

          {/* Feedback */}
          <div className="pt-1">
            <label className="text-stone-400 text-xs font-medium mb-1.5 block">
              Comments or requests <span className="text-stone-600">(optional)</span>
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Anything you'd like to share with our team…"
              rows={3}
              className="w-full bg-[#0f1628] border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-stone-600 focus:outline-none focus:border-[#D4AF37]/30 resize-none transition-colors"
            />
          </div>

          <button
            onClick={() => setStep('confirm')}
            disabled={!allChecked}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-[#1A2B48] border border-[#2a3f6f] text-[#D4AF37] font-bold text-base disabled:opacity-35 hover:border-[#D4AF37]/50 active:scale-[0.98] transition-all"
          >
            Continue
            <ArrowRight size={18} />
          </button>
        </div>
      )}

      {/* ── CONFIRM ───────────────────────────────────────────────────────── */}
      {step === 'confirm' && (
        <div className="flex-1 overflow-y-auto px-4 pt-6 pb-10 space-y-4">

          {/* Hero */}
          <div className="flex flex-col items-center text-center pb-1">
            <div className="w-16 h-16 rounded-2xl bg-[#1A2B48] border border-[#2a3f6f] flex items-center justify-center mb-4">
              <LogOut size={26} className="text-[#D4AF37]" strokeWidth={1.5} />
            </div>
            <h2 className="text-white text-xl font-bold mb-1">Ready to check out?</h2>
            <p className="text-stone-500 text-sm">
              Checkout time: <span className="text-white font-medium">{coT}</span>
            </p>
          </div>

          {/* Final bill */}
          {bill && (
            <div className="rounded-2xl bg-[#0f1628] border border-white/8 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/6">
                <p className="text-stone-500 text-xs uppercase tracking-wider">Final Bill</p>
                <span className="text-stone-600 text-xs font-mono">{bill.billNumber}</span>
              </div>
              <div className="px-4 py-4 flex items-center justify-between">
                <div>
                  <p className="text-stone-500 text-xs mb-1">Total Due</p>
                  <p className="text-[#D4AF37] text-3xl font-bold">{formatPrice(bill.total, bill.currency)}</p>
                </div>
                <div className="text-right space-y-1.5">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-900/40 border border-amber-700/40 text-amber-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                    {bill.status === 'paid' ? 'Paid' : 'Pending'}
                  </span>
                  {bill.companyBilling && (
                    <p className="text-[#D4AF37] text-xs flex items-center gap-1 justify-end">
                      <Building2 size={10} />
                      Company Invoice
                    </p>
                  )}
                </div>
              </div>
              <div className="px-4 pb-4">
                <p className="text-stone-600 text-xs">
                  Payment will be settled at the front desk or charged to your card on file.
                </p>
              </div>
            </div>
          )}

          {/* What happens next */}
          <div className="rounded-2xl bg-[#0f1628] border border-white/6 px-4 py-4 space-y-3">
            <p className="text-stone-500 text-[10px] uppercase tracking-wider">What happens next</p>
            {[
              { Icon: CreditCard, text: 'Final bill processed at front desk' },
              { Icon: KeyRound,   text: `Digital key deactivates at ${coT}` },
              { Icon: Receipt,    text: 'Invoice emailed to your address on file' },
            ].map(({ Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <Icon size={14} className="text-stone-600 shrink-0" />
                <p className="text-stone-400 text-sm">{text}</p>
              </div>
            ))}
          </div>

          {confirmError && (
            <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-red-900/20 border border-red-700/30">
              <AlertCircle size={16} className="text-red-400 shrink-0" />
              <p className="text-red-300 text-sm">{confirmError}</p>
            </div>
          )}

          <button
            onClick={handleConfirm}
            disabled={confirming}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-[#1A2B48] border border-[#2a3f6f] text-[#D4AF37] font-bold text-base disabled:opacity-60 hover:border-[#D4AF37]/50 active:scale-[0.98] transition-all"
          >
            {confirming ? <Spinner size={18} /> : <LogOut size={18} />}
            {confirming ? 'Checking out…' : 'Confirm Checkout'}
          </button>

          <button
            onClick={() => setStep('checklist')}
            disabled={confirming}
            className="w-full py-2 text-stone-500 text-sm font-medium"
          >
            Go back
          </button>
        </div>
      )}
    </div>
  )
}
