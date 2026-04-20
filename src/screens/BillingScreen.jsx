import { useState } from 'react'
import {
  ChevronLeft, ChevronRight, BedDouble, UtensilsCrossed,
  Wine, Sparkles, Package, Building2, Download, Mail,
  CheckCircle2, Clock, AlertCircle, FileText, X,
  CreditCard, Receipt, ArrowDownToLine, CalendarDays,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useFetch, useMutation } from '../hooks/useFetch'
import { billingApi } from '../services/api'
import BottomNav from '../components/BottomNav'
import Spinner from '../components/Spinner'
import { ROUTES } from '../constants'
import { formatDate, formatPrice } from '../utils'

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  paid:      { label: 'Paid',     bg: 'bg-emerald-900/40 border-emerald-700/40', color: 'text-emerald-400', dot: 'bg-emerald-400', Icon: CheckCircle2 },
  pending:   { label: 'Pending',  bg: 'bg-amber-900/40 border-amber-700/40',     color: 'text-amber-400',   dot: 'bg-amber-400',   Icon: Clock        },
  overdue:   { label: 'Overdue',  bg: 'bg-red-900/40 border-red-700/40',         color: 'text-red-400',     dot: 'bg-red-400',     Icon: AlertCircle  },
  cancelled: { label: 'Cancelled',bg: 'bg-stone-800/60 border-stone-700/40',     color: 'text-stone-500',   dot: 'bg-stone-500',   Icon: X            },
}

// ─── Category config ─────────────────────────────────────────────────────────
const CAT_CONFIG = {
  room:       { label: 'Accommodation', Icon: BedDouble,       color: 'text-green-400',   bg: 'bg-green-900/20'   },
  restaurant: { label: 'Restaurant',    Icon: UtensilsCrossed, color: 'text-amber-400',  bg: 'bg-amber-900/20'  },
  minibar:    { label: 'Minibar',       Icon: Wine,            color: 'text-rose-400',   bg: 'bg-rose-900/20'   },
  service:    { label: 'Services',      Icon: Sparkles,        color: 'text-violet-400', bg: 'bg-violet-900/20' },
  other:      { label: 'Other',         Icon: Package,         color: 'text-stone-400',  bg: 'bg-stone-800'     },
}

const CAT_ORDER = ['room', 'restaurant', 'minibar', 'service', 'other']

// ─── Helpers ──────────────────────────────────────────────────────────────────
function StatusBadge({ status, small = false }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending
  const { Icon } = cfg
  return (
    <span className={`inline-flex items-center gap-1.5 border rounded-full font-semibold ${cfg.bg} ${cfg.color} ${small ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1'}`}>
      <Icon size={small ? 10 : 11} strokeWidth={2.5} />
      {cfg.label}
    </span>
  )
}

function shortDate(iso) {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso))
}

function shortDateNoYear(iso) {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short' }).format(new Date(iso))
}

function groupByCategory(items) {
  const groups = {}
  for (const item of items) {
    const cat = item.category in CAT_CONFIG ? item.category : 'other'
    if (!groups[cat]) groups[cat] = []
    groups[cat].push(item)
  }
  return groups
}

function categorySums(items) {
  const sums = {}
  for (const item of items) {
    const cat = item.category in CAT_CONFIG ? item.category : 'other'
    sums[cat] = (sums[cat] ?? 0) + item.total
  }
  return sums
}

// ─── Download modal ───────────────────────────────────────────────────────────
function DownloadModal({ bill, guestEmail, onClose }) {
  const [phase, setPhase] = useState('idle') // idle | loading_pdf | loading_email | done_pdf | done_email
  const { mutate: doDownload } = useMutation(billingApi.downloadInvoice)

  const handlePdf = async () => {
    setPhase('loading_pdf')
    await doDownload({ billId: bill.billNumber, format: 'pdf' })
    setPhase('done_pdf')
  }
  const handleEmail = async () => {
    setPhase('loading_email')
    await doDownload({ billId: bill.billNumber, format: 'email' })
    setPhase('done_email')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div className="relative w-full max-w-lg bg-[#0f1628] border border-white/10 rounded-t-2xl pb-safe-bottom">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        <div className="px-5 pb-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-white font-semibold text-base">Invoice</h3>
              <p className="text-stone-500 text-xs mt-0.5">{bill.billNumber}</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center text-stone-400 hover:text-white">
              <X size={15} />
            </button>
          </div>

          {phase === 'done_pdf' && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-900/30 border border-emerald-700/30 mb-4">
              <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
              <div>
                <p className="text-emerald-300 text-sm font-medium">Invoice downloaded</p>
                <p className="text-emerald-600 text-xs mt-0.5">{bill.billNumber}.pdf</p>
              </div>
            </div>
          )}
          {phase === 'done_email' && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-900/30 border border-emerald-700/30 mb-4">
              <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
              <div>
                <p className="text-emerald-300 text-sm font-medium">Invoice sent by email</p>
                <p className="text-emerald-600 text-xs mt-0.5">{guestEmail}</p>
              </div>
            </div>
          )}

          <div className="space-y-2.5">
            <button
              onClick={handlePdf}
              disabled={phase !== 'idle' && phase !== 'loading_pdf'}
              className="w-full flex items-center gap-3 p-4 rounded-xl bg-[#1A2B48] border border-[#2a3f6f] text-left disabled:opacity-50 hover:border-[#D4AF37]/40 transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-green-900/20 flex items-center justify-center shrink-0">
                {phase === 'loading_pdf' ? <Spinner size={18} /> : <ArrowDownToLine size={18} className="text-green-400" />}
              </div>
              <div className="flex-1">
                <p className="text-white text-sm font-medium">Download as PDF</p>
                <p className="text-stone-500 text-xs mt-0.5">Save to your device</p>
              </div>
            </button>

            <button
              onClick={handleEmail}
              disabled={phase !== 'idle' && phase !== 'loading_email'}
              className="w-full flex items-center gap-3 p-4 rounded-xl bg-[#1A2B48] border border-[#2a3f6f] text-left disabled:opacity-50 hover:border-[#D4AF37]/40 transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-violet-900/30 flex items-center justify-center shrink-0">
                {phase === 'loading_email' ? <Spinner size={18} /> : <Mail size={18} className="text-violet-400" />}
              </div>
              <div className="flex-1">
                <p className="text-white text-sm font-medium">Send by email</p>
                <p className="text-stone-500 text-xs mt-0.5">Sent to {guestEmail}</p>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Detail view ──────────────────────────────────────────────────────────────
function DetailView({ bill, guest, onBack }) {
  const [showDownload, setShowDownload] = useState(false)
  const groups   = groupByCategory(bill.items)
  const catSums  = categorySums(bill.items)
  const statusCfg = STATUS_CONFIG[bill.status] ?? STATUS_CONFIG.pending

  return (
    <div className="flex flex-col min-h-dvh bg-[#080c18]">
      <div className="safe-top" />

      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#080c18]/95 backdrop-blur-sm border-b border-white/5">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={onBack} className="w-9 h-9 rounded-xl flex items-center justify-center text-white/40 hover:text-white hover:bg-white/8 transition-colors">
            <ChevronLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm leading-tight">Invoice</p>
            <p className="text-stone-500 text-xs">{bill.billNumber}</p>
          </div>
          <button
            onClick={() => setShowDownload(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1A2B48] border border-[#2a3f6f] text-[#D4AF37] text-xs font-medium hover:border-[#D4AF37]/40 transition-colors"
          >
            <Download size={13} />
            Download
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-28">
        {/* Bill summary card */}
        <div className="mx-4 mt-4 p-4 rounded-2xl bg-[#0f1628] border border-white/8">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="text-stone-500 text-xs mb-1">Total Amount</p>
              <p className="text-white text-3xl font-bold tracking-tight">{formatPrice(bill.total, bill.currency)}</p>
            </div>
            <StatusBadge status={bill.status} />
          </div>

          <div className="grid grid-cols-2 gap-2 pt-3 border-t border-white/6">
            <div>
              <p className="text-stone-600 text-[10px] uppercase tracking-wider mb-0.5">Invoice No.</p>
              <p className="text-stone-300 text-xs font-medium">{bill.billNumber}</p>
            </div>
            <div>
              <p className="text-stone-600 text-[10px] uppercase tracking-wider mb-0.5">Issued</p>
              <p className="text-stone-300 text-xs font-medium">{shortDate(bill.billDate)}</p>
            </div>
            {bill.roomNumber && (
              <div>
                <p className="text-stone-600 text-[10px] uppercase tracking-wider mb-0.5">Room</p>
                <p className="text-stone-300 text-xs font-medium">{bill.roomNumber} · {bill.roomType}</p>
              </div>
            )}
            {bill.checkIn && bill.checkOut && (
              <div>
                <p className="text-stone-600 text-[10px] uppercase tracking-wider mb-0.5">Stay</p>
                <p className="text-stone-300 text-xs font-medium">
                  {shortDateNoYear(bill.checkIn)} – {shortDateNoYear(bill.checkOut)} · {bill.nights}n
                </p>
              </div>
            )}
            {bill.companyBilling && bill.companyName && (
              <div className="col-span-2">
                <p className="text-stone-600 text-[10px] uppercase tracking-wider mb-0.5">Company Invoice</p>
                <p className="text-[#D4AF37] text-xs font-medium">{bill.companyName}</p>
              </div>
            )}
          </div>
        </div>

        {/* Line items by category */}
        <div className="mx-4 mt-4 space-y-3">
          {CAT_ORDER.filter((cat) => groups[cat]?.length).map((cat) => {
            const cfg   = CAT_CONFIG[cat]
            const lines = groups[cat]
            const { Icon } = cfg
            return (
              <div key={cat} className="rounded-2xl bg-[#0f1628] border border-white/6 overflow-hidden">
                {/* Category header */}
                <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/6">
                  <div className={`w-7 h-7 rounded-lg ${cfg.bg} flex items-center justify-center shrink-0`}>
                    <Icon size={14} className={cfg.color} strokeWidth={1.8} />
                  </div>
                  <span className="text-white/80 text-xs font-semibold uppercase tracking-wider">{cfg.label}</span>
                  <span className={`ml-auto text-sm font-semibold ${cfg.color}`}>
                    {formatPrice(catSums[cat] ?? 0, bill.currency)}
                  </span>
                </div>

                {/* Line items */}
                <div className="divide-y divide-white/4">
                  {lines.map((item) => (
                    <div key={item.id} className="flex items-start gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-stone-200 text-sm leading-snug">{item.description}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-stone-600 text-xs">{shortDate(item.date)}</p>
                          {item.quantity > 1 && (
                            <span className="text-stone-700 text-[10px]">×{item.quantity}</span>
                          )}
                          {item.quantity > 1 && (
                            <span className="text-stone-700 text-[10px]">{formatPrice(item.unitPrice, bill.currency)} each</span>
                          )}
                        </div>
                      </div>
                      <p className="text-stone-300 text-sm font-medium shrink-0">{formatPrice(item.total, bill.currency)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Totals */}
        <div className="mx-4 mt-3 rounded-2xl bg-[#0f1628] border border-white/6 overflow-hidden">
          <div className="divide-y divide-white/4">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-stone-400 text-sm">Subtotal</span>
              <span className="text-stone-200 text-sm font-medium">{formatPrice(bill.subtotal, bill.currency)}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-stone-400 text-sm">Tax ({Math.round((bill.taxRate ?? 0.07) * 100)}%)</span>
              <span className="text-stone-200 text-sm font-medium">{formatPrice(bill.taxAmount, bill.currency)}</span>
            </div>
            {bill.serviceCharge !== 0 && (
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-stone-400 text-sm">Service Charge</span>
                <span className="text-stone-200 text-sm font-medium">{formatPrice(bill.serviceCharge, bill.currency)}</span>
              </div>
            )}
            <div className="flex items-center justify-between px-4 py-3.5 bg-white/[0.03]">
              <span className="text-white font-bold text-base">Total</span>
              <span className="text-[#D4AF37] font-bold text-lg">{formatPrice(bill.total, bill.currency)}</span>
            </div>
          </div>
        </div>

        {/* Payment info */}
        <div className="mx-4 mt-3 rounded-2xl bg-[#0f1628] border border-white/6 p-4">
          <p className="text-stone-500 text-[10px] uppercase tracking-wider mb-3">Payment</p>
          {bill.status === 'paid' ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-stone-400 text-sm">Status</span>
                <StatusBadge status="paid" small />
              </div>
              {bill.paidAt && (
                <div className="flex items-center justify-between">
                  <span className="text-stone-400 text-sm">Paid on</span>
                  <span className="text-stone-200 text-sm">{shortDate(bill.paidAt)}</span>
                </div>
              )}
              {bill.paymentMethod && (
                <div className="flex items-center justify-between">
                  <span className="text-stone-400 text-sm">Method</span>
                  <div className="flex items-center gap-1.5">
                    <CreditCard size={13} className="text-stone-500" />
                    <span className="text-stone-200 text-sm">{bill.paymentMethod}</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-stone-400 text-sm">Status</span>
                <StatusBadge status={bill.status} small />
              </div>
              {bill.dueDate && (
                <div className="flex items-center justify-between">
                  <span className="text-stone-400 text-sm">Due by</span>
                  <span className="text-amber-400 text-sm font-medium">{shortDate(bill.dueDate)}</span>
                </div>
              )}
              <p className="text-stone-600 text-xs pt-1">
                Payment is processed at check-out. Contact front desk for questions.
              </p>
            </div>
          )}
        </div>

        {/* Download button */}
        <div className="mx-4 mt-4">
          <button
            onClick={() => setShowDownload(true)}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-[#1A2B48] border border-[#2a3f6f] text-[#D4AF37] font-semibold text-sm hover:border-[#D4AF37]/50 active:scale-[0.98] transition-all"
          >
            <Download size={16} />
            Download Invoice
          </button>
        </div>
      </div>

      {showDownload && (
        <DownloadModal
          bill={bill}
          guestEmail={guest?.email ?? 'your email'}
          onClose={() => setShowDownload(false)}
        />
      )}
    </div>
  )
}

// ─── Company billing view ─────────────────────────────────────────────────────
function CompanyView({ guest, booking, onBack, onSuccess }) {
  const [companyName, setCompanyName] = useState('')
  const [vatNumber,   setVatNumber]   = useState('')
  const [result,      setResult]      = useState(null)

  const { mutate: requestBilling, loading, error } = useMutation(billingApi.requestCompanyBilling)

  const handleConfirm = async () => {
    if (!companyName.trim()) return
    const res = await requestBilling({
      guestId:     guest?.id ?? 'g-001',
      companyName: companyName.trim(),
      vatNumber:   vatNumber.trim() || null,
      booking,
    })
    if (res?.success) setResult(res)
  }

  return (
    <div className="flex flex-col min-h-dvh bg-[#080c18]">
      <div className="safe-top" />

      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-3 pb-2">
        <button onClick={onBack} className="w-9 h-9 rounded-xl flex items-center justify-center text-white/40 hover:text-white hover:bg-white/8 transition-colors">
          <ChevronLeft size={20} />
        </button>
        <p className="text-white font-semibold text-sm">Company Invoice</p>
      </div>

      <div className="flex-1 px-4 pb-28 overflow-y-auto">
        {result ? (
          /* ── Success state ── */
          <div className="flex flex-col items-center text-center pt-12 pb-6">
            <div className="w-20 h-20 rounded-full bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center mb-5">
              <CheckCircle2 size={36} className="text-emerald-400" />
            </div>
            <h2 className="text-white text-xl font-bold mb-2">Company Billing Enabled</h2>
            <p className="text-stone-400 text-sm leading-relaxed mb-6 max-w-xs">
              Your invoice will be issued to <span className="text-white font-medium">{result.company_name}</span> and sent directly to your company email.
            </p>
            <div className="w-full rounded-2xl bg-[#0f1628] border border-white/8 p-4 text-left mb-6">
              <p className="text-stone-500 text-[10px] uppercase tracking-wider mb-2.5">Confirmation</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-stone-400 text-sm">Reference</span>
                  <span className="text-[#D4AF37] font-mono text-sm font-semibold">{result.confirmation}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-stone-400 text-sm">Company</span>
                  <span className="text-stone-200 text-sm">{result.company_name}</span>
                </div>
              </div>
            </div>
            <button
              onClick={onBack}
              className="w-full py-3.5 rounded-2xl bg-[#1A2B48] border border-[#2a3f6f] text-[#D4AF37] font-semibold text-sm"
            >
              Back to Bills
            </button>
          </div>
        ) : (
          /* ── Form state ── */
          <>
            <div className="flex flex-col items-center text-center pt-8 pb-6">
              <div className="w-16 h-16 rounded-2xl bg-[#1A2B48] border border-[#2a3f6f] flex items-center justify-center mb-4">
                <Building2 size={28} className="text-[#D4AF37]" strokeWidth={1.5} />
              </div>
              <h2 className="text-white text-lg font-bold mb-2">Request Company Invoice</h2>
              <p className="text-stone-400 text-sm leading-relaxed max-w-xs">
                The final invoice for this stay will be issued in the company name and emailed to your registered address.
              </p>
            </div>

            <div className="space-y-3 mb-6">
              <div>
                <label className="text-stone-400 text-xs font-medium mb-1.5 block">
                  Company Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Acme GmbH"
                  className="w-full bg-[#0f1628] border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-stone-600 focus:outline-none focus:border-[#D4AF37]/40 transition-colors"
                />
              </div>
              <div>
                <label className="text-stone-400 text-xs font-medium mb-1.5 block">
                  VAT Number <span className="text-stone-600">(optional)</span>
                </label>
                <input
                  type="text"
                  value={vatNumber}
                  onChange={(e) => setVatNumber(e.target.value)}
                  placeholder="e.g. DE123456789"
                  className="w-full bg-[#0f1628] border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-stone-600 focus:outline-none focus:border-[#D4AF37]/40 transition-colors"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-red-900/20 border border-red-700/30 mb-4">
                <AlertCircle size={15} className="text-red-400 shrink-0" />
                <p className="text-red-300 text-sm">{error}</p>
              </div>
            )}

            <div className="rounded-2xl bg-[#0f1628] border border-white/6 p-4 mb-5 text-sm text-stone-400 leading-relaxed">
              Our front desk will prepare your company invoice upon check-out. A copy will also be sent to your email on file.
            </div>

            <button
              onClick={handleConfirm}
              disabled={!companyName.trim() || loading}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-[#1A2B48] border border-[#2a3f6f] text-[#D4AF37] font-semibold text-sm disabled:opacity-40 hover:border-[#D4AF37]/50 active:scale-[0.98] transition-all"
            >
              {loading ? <Spinner size={16} /> : <Building2 size={16} />}
              {loading ? 'Requesting…' : 'Confirm Company Invoice Request'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Overview view ────────────────────────────────────────────────────────────
function OverviewView({ bills, guest, booking, onViewBill, onRequestCompany, navigate }) {
  const { current, history } = bills
  const catSums    = categorySums(current.items)
  const statusCfg  = STATUS_CONFIG[current.status] ?? STATUS_CONFIG.pending

  const catRows = CAT_ORDER.filter((c) => (catSums[c] ?? 0) > 0)

  return (
    <div className="flex-1 overflow-y-auto pb-28">

      {/* ── Current stay bill ── */}
      <div className="px-4 mb-1 mt-4">
        <p className="text-stone-500 text-[10px] uppercase tracking-widest font-semibold mb-3">Current Stay</p>
      </div>

      {/* Total card */}
      <div className="mx-4 rounded-2xl bg-[#0f1628] border border-white/8 overflow-hidden">
        {/* Amount hero */}
        <div className="px-4 pt-4 pb-3 border-b border-white/6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-stone-500 text-xs mb-1">Total Bill</p>
              <p className="text-[#D4AF37] text-4xl font-bold tracking-tight">
                {formatPrice(current.total, current.currency)}
              </p>
            </div>
            <StatusBadge status={current.status} />
          </div>
          <div className="flex items-center gap-4 mt-3 text-xs text-stone-500">
            <span className="flex items-center gap-1">
              <Receipt size={11} />
              {current.billNumber}
            </span>
            {current.dueDate && current.status !== 'paid' && (
              <span className="flex items-center gap-1 text-amber-500">
                <Clock size={11} />
                Due {shortDate(current.dueDate)}
              </span>
            )}
            {current.paidAt && (
              <span className="flex items-center gap-1 text-emerald-500">
                <CheckCircle2 size={11} />
                Paid {shortDate(current.paidAt)}
              </span>
            )}
          </div>
        </div>

        {/* Category breakdown */}
        <div className="px-4 py-3 space-y-2.5">
          {catRows.map((cat) => {
            const cfg   = CAT_CONFIG[cat]
            const { Icon } = cfg
            return (
              <div key={cat} className="flex items-center gap-3">
                <div className={`w-7 h-7 rounded-lg ${cfg.bg} flex items-center justify-center shrink-0`}>
                  <Icon size={13} className={cfg.color} strokeWidth={1.8} />
                </div>
                <span className="flex-1 text-stone-400 text-sm">{cfg.label}</span>
                <span className="text-stone-200 text-sm font-medium">{formatPrice(catSums[cat], current.currency)}</span>
              </div>
            )
          })}

          <div className="pt-2 border-t border-white/6 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-stone-500">
              <span>Subtotal</span>
              <span>{formatPrice(current.subtotal, current.currency)}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-stone-500">
              <span>Tax ({Math.round((current.taxRate ?? 0.07) * 100)}%)</span>
              <span>{formatPrice(current.taxAmount, current.currency)}</span>
            </div>
            <div className="flex items-center justify-between text-sm font-semibold text-white pt-1">
              <span>Total</span>
              <span className="text-[#D4AF37]">{formatPrice(current.total, current.currency)}</span>
            </div>
          </div>
        </div>

        {/* View full bill button */}
        <button
          onClick={() => onViewBill(current)}
          className="w-full flex items-center justify-between px-4 py-3 border-t border-white/6 text-[#D4AF37] text-sm font-medium hover:bg-white/[0.03] transition-colors"
        >
          <span>View Full Invoice</span>
          <ChevronRight size={16} />
        </button>
      </div>

      {/* ── Company billing ── */}
      <div className="mx-4 mt-3 rounded-2xl bg-[#0f1628] border border-white/6">
        {current.companyBilling ? (
          <div className="flex items-center gap-3 px-4 py-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-900/30 flex items-center justify-center shrink-0">
              <Building2 size={18} className="text-emerald-400" strokeWidth={1.5} />
            </div>
            <div className="flex-1">
              <p className="text-emerald-300 text-sm font-medium">Company Billing Active</p>
              <p className="text-stone-500 text-xs mt-0.5">{current.companyName}</p>
            </div>
            <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
          </div>
        ) : (
          <button
            onClick={onRequestCompany}
            className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-white/[0.03] transition-colors"
          >
            <div className="w-10 h-10 rounded-xl bg-[#1A2B48] border border-[#2a3f6f] flex items-center justify-center shrink-0">
              <Building2 size={18} className="text-[#D4AF37]" strokeWidth={1.5} />
            </div>
            <div className="flex-1">
              <p className="text-white text-sm font-medium">Request Company Invoice</p>
              <p className="text-stone-500 text-xs mt-0.5">Invoice issued to your company</p>
            </div>
            <ChevronRight size={16} className="text-stone-600 shrink-0" />
          </button>
        )}
      </div>

      {/* ── Past stays ── */}
      {history.length > 0 && (
        <>
          <div className="px-4 mt-6 mb-3">
            <p className="text-stone-500 text-[10px] uppercase tracking-widest font-semibold">Previous Stays</p>
          </div>
          <div className="mx-4 rounded-2xl bg-[#0f1628] border border-white/6 overflow-hidden divide-y divide-white/4">
            {history.map((bill) => (
              <button
                key={bill.id}
                onClick={() => onViewBill(bill)}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-white/[0.03] transition-colors"
              >
                <div className="w-9 h-9 rounded-xl bg-stone-800 flex items-center justify-center shrink-0">
                  <FileText size={16} className="text-stone-400" strokeWidth={1.6} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-stone-200 text-sm font-medium truncate">{bill.billNumber}</p>
                    {bill.companyBilling && (
                      <Building2 size={11} className="text-[#D4AF37] shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-stone-600 text-xs">{shortDate(bill.billDate)}</p>
                    {bill.roomType && (
                      <span className="text-stone-700 text-xs">· {bill.roomType}</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <p className="text-stone-200 text-sm font-semibold">{formatPrice(bill.total, bill.currency)}</p>
                  <StatusBadge status={bill.status} small />
                </div>
                <ChevronRight size={15} className="text-stone-700 shrink-0 ml-1" />
              </button>
            ))}
          </div>
        </>
      )}

      {/* Footer */}
      <p className="text-center text-xs text-stone-700 mt-6 px-6 pb-2">
        Questions about your bill? Dial <span className="text-stone-600">ext. 0</span> or use Front Desk.
      </p>
    </div>
  )
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function BillingScreen() {
  const { guest, booking, navigate } = useApp()
  const [view,          setView]    = useState('overview')  // 'overview' | 'detail' | 'company'
  const [selectedBill,  setSelBill] = useState(null)

  const { data: bills, loading, error, refetch } = useFetch(
    () => billingApi.getBills(guest?.id ?? 'g-001', booking),
    []
  )

  const openBill = (bill) => {
    setSelBill(bill)
    setView('detail')
  }

  // ── Loading / error ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col min-h-dvh bg-[#080c18]">
        <div className="safe-top" />
        <div className="flex items-center gap-3 px-4 pt-3 pb-2">
          <button onClick={() => navigate(ROUTES.HOME)} className="w-9 h-9 rounded-xl flex items-center justify-center text-white/40 hover:text-white hover:bg-white/8">
            <ChevronLeft size={20} />
          </button>
          <p className="text-white font-semibold text-sm">Bills & Invoices</p>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Spinner size={32} />
        </div>
        <BottomNav />
      </div>
    )
  }

  if (error || !bills) {
    return (
      <div className="flex flex-col min-h-dvh bg-[#080c18]">
        <div className="safe-top" />
        <div className="flex items-center gap-3 px-4 pt-3 pb-2">
          <button onClick={() => navigate(ROUTES.HOME)} className="w-9 h-9 rounded-xl flex items-center justify-center text-white/40 hover:text-white hover:bg-white/8">
            <ChevronLeft size={20} />
          </button>
          <p className="text-white font-semibold text-sm">Bills & Invoices</p>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-3">
          <AlertCircle size={32} className="text-red-400" />
          <p className="text-white font-medium">Could not load your bill</p>
          <p className="text-stone-500 text-sm">{error ?? 'Please try again.'}</p>
          <button onClick={refetch} className="mt-2 px-5 py-2 rounded-xl bg-[#1A2B48] border border-[#2a3f6f] text-[#D4AF37] text-sm font-medium">
            Retry
          </button>
        </div>
        <BottomNav />
      </div>
    )
  }

  // ── Sub-views ────────────────────────────────────────────────────────────
  if (view === 'detail' && selectedBill) {
    return <DetailView bill={selectedBill} guest={guest} onBack={() => setView('overview')} />
  }

  if (view === 'company') {
    return (
      <CompanyView
        guest={guest}
        booking={booking}
        onBack={() => setView('overview')}
        onSuccess={() => { refetch(); setView('overview') }}
      />
    )
  }

  // ── Overview ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-dvh bg-[#080c18]">
      <div className="safe-top" />

      {/* Header */}
      <div className="bg-[#0f1628] border-b border-white/5">
        <div className="flex items-center gap-3 px-4 pt-4 pb-2">
          <button
            onClick={() => navigate(ROUTES.HOME)}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white/40 hover:text-white hover:bg-white/8 transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="flex-1">
            <p className="text-white font-bold text-base leading-tight">Bills & Invoices</p>
            <p className="text-stone-500 text-xs mt-0.5">
              {guest?.firstName} {guest?.lastName} · Room {booking?.roomNumber}
            </p>
          </div>
        </div>

        {/* Hotel info strip */}
        <div className="px-4 pb-3">
          <p className="text-stone-600 text-[10px]">
            Das Elb · Seilerweg 19 · 39114 Magdeburg · +49 391 5632660
          </p>
        </div>
      </div>

      <OverviewView
        bills={bills}
        guest={guest}
        booking={booking}
        onViewBill={openBill}
        onRequestCompany={() => setView('company')}
        navigate={navigate}
      />

      <BottomNav />
    </div>
  )
}
