import { useState, useRef, useEffect } from 'react'
import {
  ChevronLeft, Send, CheckCircle2, Clock, AlertCircle,
  ChevronRight, Minus, MessageSquare, Wrench, BedDouble,
  Volume2, PhoneCall, LogOut, HelpCircle, Sparkles,
  Circle, CircleDot, RefreshCw,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useFetch, useMutation } from '../hooks/useFetch'
import { frontDeskApi } from '../services/api'
import BottomNav from '../components/BottomNav'
import Button from '../components/Button'
import Spinner from '../components/Spinner'
import { ROUTES } from '../constants'
import { formatTime, formatDate } from '../utils'

// ─── Brand colors (DAS ELB Magdeburg — navy + gold) ──────────────────────────
// Primary navy: #1A2B48  Dark navy bg: #080c18  Gold: #D4AF37

// ─── Quick request templates ──────────────────────────────────────────────────
const QUICK_REQUESTS = [
  { id: 'towels',      icon: BedDouble,    label: 'Extra Towels',      category: 'Housekeeping', defaultDesc: 'Please bring extra towels to my room.',        needsTime: false },
  { id: 'checkout',    icon: LogOut,       label: 'Late Checkout',     category: 'Reception',    defaultDesc: 'I would like to request a late checkout.',     needsTime: false },
  { id: 'callback',    icon: PhoneCall,    label: 'Call Me Back',      category: 'Reception',    defaultDesc: 'Please call me back at your earliest convenience.', needsTime: false },
  { id: 'maintenance', icon: Wrench,       label: 'Room Maintenance',  category: 'Maintenance',  defaultDesc: 'There is a maintenance issue in my room.',     needsTime: true  },
  { id: 'housekeeping',icon: Sparkles,     label: 'Housekeeping',      category: 'Housekeeping', defaultDesc: 'Please arrange housekeeping for my room.',     needsTime: true  },
  { id: 'quiet',       icon: Volume2,      label: 'Quiet Please',      category: 'Reception',    defaultDesc: 'There is noise disturbance near my room.',     needsTime: false },
  { id: 'other',       icon: HelpCircle,   label: 'Other Request',     category: 'General',      defaultDesc: '',                                             needsTime: false },
  { id: 'custom',      icon: MessageSquare,label: 'Custom Message',    category: 'General',      defaultDesc: '',                                             needsTime: false },
]

const URGENCY_OPTIONS = [
  { value: 'normal', label: 'Normal',  color: 'text-stone-400',  bg: 'bg-stone-800',  ring: 'ring-stone-600',  dot: 'bg-stone-400'  },
  { value: 'soon',   label: 'Soon',    color: 'text-amber-400',  bg: 'bg-amber-900/30', ring: 'ring-amber-600', dot: 'bg-amber-400'  },
  { value: 'urgent', label: 'Urgent',  color: 'text-red-400',    bg: 'bg-red-900/30',  ring: 'ring-red-600',   dot: 'bg-red-400'    },
]

const STATUS_CONFIG = {
  open:         { label: 'Pending',      color: 'text-amber-400',  bg: 'bg-amber-900/30 border-amber-700/40',  dot: 'bg-amber-400',  icon: Clock          },
  acknowledged: { label: 'Acknowledged', color: 'text-emerald-400',   bg: 'bg-emerald-900/30 border-emerald-700/40',    dot: 'bg-emerald-400',   icon: CircleDot      },
  in_progress:  { label: 'In Progress',  color: 'text-violet-400', bg: 'bg-violet-900/30 border-violet-700/40',dot: 'bg-violet-400', icon: RefreshCw      },
  completed:    { label: 'Completed',    color: 'text-emerald-400',bg: 'bg-emerald-900/30 border-emerald-700/40',dot:'bg-emerald-400',icon: CheckCircle2   },
  cancelled:    { label: 'Cancelled',    color: 'text-stone-500',  bg: 'bg-stone-800/50 border-stone-700/40',  dot: 'bg-stone-500',  icon: Minus          },
}

const STATUS_ORDER = ['open', 'acknowledged', 'in_progress', 'completed']

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.open
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${cfg.bg} ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return formatDate(iso)
}

// ─── Timeline component ───────────────────────────────────────────────────────
function Timeline({ steps, currentStatus }) {
  const currentIdx = STATUS_ORDER.indexOf(currentStatus)
  return (
    <div className="space-y-0">
      {steps.map((step, i) => {
        const cfg = STATUS_CONFIG[step.status] ?? STATUS_CONFIG.open
        const isLast = i === steps.length - 1
        return (
          <div key={i} className="flex gap-3">
            {/* Track */}
            <div className="flex flex-col items-center">
              <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${cfg.dot}`} />
              {!isLast && <div className="w-px flex-1 bg-stone-700 mt-1 mb-0 min-h-[20px]" />}
            </div>
            {/* Content */}
            <div className={`pb-4 ${isLast ? '' : ''}`}>
              <p className={`text-sm font-medium ${cfg.color}`}>{step.label}</p>
              <p className="text-xs text-stone-600 mt-0.5">{formatTime(step.time)}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
export default function FrontDeskScreen() {
  const { guest, booking } = useApp()
  const [view,            setView]           = useState('home')
  const [selectedPreset,  setSelectedPreset] = useState(null)
  const [customTitle,     setCustomTitle]    = useState('')
  const [description,     setDescription]   = useState('')
  const [urgency,         setUrgency]        = useState('normal')
  const [bestTime,        setBestTime]       = useState('')
  const [confirmation,    setConfirmation]   = useState(null)
  const [activeRequest,   setActiveRequest]  = useState(null)
  const [followUp,        setFollowUp]       = useState('')
  const [followUpSent,    setFollowUpSent]   = useState(false)
  const messagesEndRef = useRef(null)

  const { data: requests, loading, error, refetch } = useFetch(
    () => frontDeskApi.getRequestHistory(guest?.id ?? 'g-001', booking),
    []
  )
  const { mutate: submitRequest, loading: submitting, error: submitError, reset: resetSubmit } = useMutation(frontDeskApi.submitRequest)
  const { mutate: updateRequest, loading: updatingMsg } = useMutation(frontDeskApi.updateRequest)
  const { mutate: markRead } = useMutation(frontDeskApi.markRead)

  const unreadCount = (requests ?? []).filter((r) => r.hasUnread).length

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeRequest?.messages])

  const openCompose = (preset) => {
    setSelectedPreset(preset)
    setDescription(preset.defaultDesc)
    setCustomTitle('')
    setUrgency('normal')
    setBestTime('')
    resetSubmit()
    setView('compose')
  }

  const handleSubmit = async () => {
    const title = selectedPreset.id === 'custom' || selectedPreset.id === 'other'
      ? (customTitle.trim() || selectedPreset.label)
      : selectedPreset.label

    const result = await submitRequest({
      guestId:     guest?.id ?? 'g-001',
      title,
      category:    selectedPreset.category,
      description: description.trim(),
      urgency,
      bestTime:    selectedPreset.needsTime ? bestTime : null,
      booking,
    })
    if (result) {
      setConfirmation(result)
      await refetch()
      setView('success')
    }
  }

  const openDetail = async (req) => {
    setActiveRequest(req)
    setFollowUp('')
    setFollowUpSent(false)
    if (req.hasUnread) {
      await markRead(req.ticketId)
      await refetch()
    }
    setView('detail')
  }

  const handleFollowUp = async () => {
    if (!followUp.trim()) return
    await updateRequest({ ticketId: activeRequest.ticketId, message: followUp.trim(), booking })
    setFollowUpSent(true)
    setFollowUp('')
    await refetch()
    // Update local activeRequest with new message
    const updated = (requests ?? []).find((r) => r.ticketId === activeRequest.ticketId)
    if (updated) setActiveRequest({ ...updated })
  }

  // ── Success ──────────────────────────────────────────────────────────────
  if (view === 'success' && confirmation) {
    return (
      <div className="flex flex-col min-h-dvh bg-[#080c18]">
        <div className="safe-top" />
        <div className="flex items-center px-4 pt-3 pb-1">
          <button
            onClick={() => { setView('home'); setConfirmation(null) }}
            className="flex items-center gap-1.5 text-white/40 hover:text-white transition-colors py-2"
          >
            <ChevronLeft size={20} />
            <span className="text-sm font-medium">Front Desk</span>
          </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center pb-24">
          <div className="w-20 h-20 rounded-full bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center mb-6">
            <CheckCircle2 size={36} className="text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Request Sent</h1>
          <p className="text-stone-400 text-sm mb-8 leading-relaxed">
            Our team has been notified and will attend to you shortly.
          </p>

          <div className="w-full bg-[#0f1628] rounded-2xl border border-white/8 p-5 text-left space-y-3 mb-6">
            <div className="flex items-center justify-between">
              <span className="text-xs text-stone-500 uppercase tracking-wider">Reference</span>
              <span className="text-sm font-bold text-white font-mono tracking-widest">{confirmation.ticketId}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-stone-500 uppercase tracking-wider">Estimated time</span>
              <span className="text-sm font-semibold text-[#D4AF37]">{confirmation.estimatedTime}</span>
            </div>
          </div>

          <p className="text-xs text-stone-600 mb-6">Charged to your stay where applicable</p>

          <Button fullWidth variant="primary" onClick={() => { setView('home'); setConfirmation(null) }}>
            Back to Front Desk
          </Button>
        </div>
        <BottomNav />
      </div>
    )
  }

  // ── Detail view ──────────────────────────────────────────────────────────
  if (view === 'detail' && activeRequest) {
    const req = activeRequest
    const cfg = STATUS_CONFIG[req.status] ?? STATUS_CONFIG.open
    const canCancel = req.status === 'open'
    const canFollowUp = req.status !== 'cancelled' && req.status !== 'completed'

    return (
      <div className="flex flex-col min-h-dvh bg-[#080c18]">
        {/* Header */}
        <div className="bg-[#0f1628] border-b border-white/6 shrink-0">
          <div className="safe-top" />
          <div className="flex items-center px-4 pt-3 pb-3">
            <button
              onClick={() => setView('home')}
              className="flex items-center gap-1.5 text-white/40 hover:text-white transition-colors"
            >
              <ChevronLeft size={20} />
              <span className="text-sm font-medium">Requests</span>
            </button>
            <div className="flex-1" />
            <StatusBadge status={req.status} />
          </div>
        </div>

        <main className="flex-1 overflow-y-auto pb-28">
          <div className="px-4 pt-4 space-y-4">

            {/* Title card */}
            <div className="bg-[#0f1628] rounded-2xl border border-white/8 p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <h1 className="text-xl font-bold text-white leading-tight">{req.title}</h1>
                <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${
                  req.urgency === 'urgent' ? 'bg-red-900/40 text-red-400 border border-red-700/40' :
                  req.urgency === 'soon'   ? 'bg-amber-900/30 text-amber-400 border border-amber-700/40' :
                  'bg-stone-800/50 text-stone-400 border border-stone-700/40'
                }`}>
                  {req.urgency.charAt(0).toUpperCase() + req.urgency.slice(1)}
                </span>
              </div>
              <p className="text-sm text-stone-400 leading-relaxed mb-3">{req.description}</p>
              <div className="flex items-center gap-3 text-xs text-stone-600">
                <span>{req.ticketId}</span>
                <span>·</span>
                <span>{timeAgo(req.submittedAt)}</span>
                {req.bestTime && (
                  <>
                    <span>·</span>
                    <span>Best time: {req.bestTime}</span>
                  </>
                )}
              </div>
            </div>

            {/* Estimated time */}
            {req.estimatedTime && req.status !== 'completed' && req.status !== 'cancelled' && (
              <div className="flex items-center gap-3 px-4 py-3 bg-[#D4AF37]/10 rounded-2xl border border-[#D4AF37]/20">
                <Clock size={16} className="text-[#D4AF37] shrink-0" />
                <div>
                  <p className="text-xs text-[#D4AF37]/70 font-semibold uppercase tracking-wider">Estimated Resolution</p>
                  <p className="text-sm text-[#D4AF37] font-semibold">{req.estimatedTime}</p>
                </div>
              </div>
            )}

            {/* Staff notes */}
            {req.staffNotes && (
              <div className="bg-[#0f1628] rounded-2xl border border-white/8 p-4">
                <p className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-2">Staff Notes</p>
                <p className="text-sm text-stone-300 leading-relaxed italic">"{req.staffNotes}"</p>
              </div>
            )}

            {/* Timeline */}
            <div className="bg-[#0f1628] rounded-2xl border border-white/8 p-4">
              <p className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-4">Status Timeline</p>
              <Timeline steps={req.timeline} currentStatus={req.status} />
            </div>

            {/* Messages / follow-up */}
            {req.messages?.length > 0 && (
              <div className="bg-[#0f1628] rounded-2xl border border-white/8 p-4">
                <p className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-3">Messages</p>
                <div className="space-y-3">
                  {req.messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.role === 'guest' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                        msg.role === 'guest'
                          ? 'bg-[#1A2B48] text-white rounded-br-sm'
                          : 'bg-stone-800 text-stone-200 rounded-bl-sm'
                      }`}>
                        <p>{msg.text}</p>
                        <p className={`text-[10px] mt-0.5 ${msg.role === 'guest' ? 'text-white/40' : 'text-stone-500'}`}>
                          {formatTime(msg.time)}
                        </p>
                      </div>
                    </div>
                  ))}
                  {followUpSent && (
                    <p className="text-xs text-emerald-400 text-center">Message sent to front desk.</p>
                  )}
                </div>
              </div>
            )}

            {/* Follow-up input */}
            {canFollowUp && (
              <div className="bg-[#0f1628] rounded-2xl border border-white/8 p-4">
                <p className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-3">Add a Message</p>
                <div className="flex gap-2">
                  <input
                    value={followUp}
                    onChange={(e) => setFollowUp(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleFollowUp()}
                    placeholder="Add a note or follow-up…"
                    className="flex-1 h-10 rounded-xl border border-stone-700 bg-stone-800/50 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 text-white placeholder:text-stone-600"
                  />
                  <button
                    onClick={handleFollowUp}
                    disabled={!followUp.trim() || updatingMsg}
                    className="w-10 h-10 rounded-xl bg-[#1A2B48] flex items-center justify-center text-white disabled:opacity-30 hover:bg-[#243d6e] transition-colors"
                  >
                    <Send size={15} />
                  </button>
                </div>
              </div>
            )}

            {/* Cancel button */}
            {canCancel && (
              <button className="w-full text-center py-3 text-sm text-red-400 hover:text-red-300 transition-colors border border-red-800/30 rounded-2xl bg-red-900/10">
                Cancel Request
              </button>
            )}
          </div>
        </main>
        <BottomNav />
      </div>
    )
  }

  // ── Compose view ─────────────────────────────────────────────────────────
  if (view === 'compose' && selectedPreset) {
    const isCustom = selectedPreset.id === 'custom' || selectedPreset.id === 'other'
    const PresetIcon = selectedPreset.icon

    return (
      <div className="flex flex-col min-h-dvh bg-[#080c18]">
        {/* Header */}
        <div className="bg-[#0f1628] border-b border-white/6 shrink-0">
          <div className="safe-top" />
          <div className="flex items-center px-4 pt-3 pb-3">
            <button
              onClick={() => setView('home')}
              className="flex items-center gap-1.5 text-white/40 hover:text-white transition-colors"
            >
              <ChevronLeft size={20} />
              <span className="text-sm font-medium">Back</span>
            </button>
            <h1 className="flex-1 text-center text-base font-semibold text-white pr-16">New Request</h1>
          </div>
        </div>

        <main className="flex-1 overflow-y-auto pb-28 px-4 pt-5 space-y-4">

          {/* Request type */}
          <div className="bg-[#0f1628] rounded-2xl border border-white/8 p-4">
            <p className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-3">Request Type</p>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#1A2B48] flex items-center justify-center shrink-0">
                <PresetIcon size={18} className="text-[#D4AF37]" />
              </div>
              <div className="flex-1">
                {isCustom ? (
                  <input
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder="Describe your request…"
                    maxLength={80}
                    className="w-full bg-transparent text-white font-semibold text-sm outline-none placeholder:text-stone-600"
                  />
                ) : (
                  <p className="text-white font-semibold text-sm">{selectedPreset.label}</p>
                )}
                <p className="text-xs text-stone-600 mt-0.5">{selectedPreset.category}</p>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="bg-[#0f1628] rounded-2xl border border-white/8 p-4">
            <p className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-3">Details</p>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Describe what you need…"
              className="w-full bg-transparent text-sm text-white placeholder:text-stone-600 resize-none outline-none leading-relaxed"
            />
            <p className="text-right text-[10px] text-stone-600 mt-1">{description.length}/500</p>
          </div>

          {/* Best time (conditional) */}
          {selectedPreset.needsTime && (
            <div className="bg-[#0f1628] rounded-2xl border border-white/8 p-4">
              <p className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-3">Best Time to Visit</p>
              <input
                type="time"
                value={bestTime}
                onChange={(e) => setBestTime(e.target.value)}
                className="w-full h-10 bg-stone-800/50 border border-stone-700 rounded-xl px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/40"
              />
              <p className="text-xs text-stone-600 mt-1.5">Optional — we'll try to accommodate your preference.</p>
            </div>
          )}

          {/* Urgency */}
          <div className="bg-[#0f1628] rounded-2xl border border-white/8 p-4">
            <p className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-3">Priority</p>
            <div className="flex gap-2">
              {URGENCY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setUrgency(opt.value)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                    urgency === opt.value
                      ? `${opt.bg} ${opt.color} ring-1 ${opt.ring} border-transparent`
                      : 'border-stone-700 text-stone-500 bg-transparent hover:border-stone-600'
                  }`}
                >
                  <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${urgency === opt.value ? opt.dot : 'bg-stone-600'}`} />
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-stone-600 mt-2">
              {urgency === 'urgent' ? '🔴 Staff will respond within ~10 minutes.' :
               urgency === 'soon'   ? '🟡 Staff will respond within ~25 minutes.' :
                                      '⚪ Standard response within ~45 minutes.'}
            </p>
          </div>

          {submitError && (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-900/20 rounded-2xl border border-red-800/30">
              <AlertCircle size={16} className="text-red-400 shrink-0" />
              <p className="text-sm text-red-400">{submitError}</p>
            </div>
          )}

          <Button fullWidth variant="primary" icon={Send} onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Sending…' : 'Send Request'}
          </Button>

          <p className="text-center text-[11px] text-stone-700 pb-2">
            Requests are handled by Das Elb Magdeburg front desk staff
          </p>
        </main>
        <BottomNav />
      </div>
    )
  }

  // ── Home view ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-dvh bg-[#080c18]">

      {/* Header */}
      <div className="bg-[#0f1628] border-b border-white/6 shrink-0 overflow-hidden relative">
        <div className="absolute -top-10 right-0 w-64 h-64 rounded-full bg-[#D4AF37]/4 blur-3xl pointer-events-none" />
        <div className="safe-top" />
        <div className="relative flex items-center justify-between px-4 pt-3 pb-1">
          <div className="w-9" />
          <span className="text-white/20 text-[10px] font-bold tracking-[0.25em] uppercase">das elb magdeburg</span>
          {unreadCount > 0 && (
            <div className="w-9 flex justify-end">
              <span className="w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                {unreadCount}
              </span>
            </div>
          )}
          {unreadCount === 0 && <div className="w-9" />}
        </div>

        <div className="relative px-5 pt-1 pb-6">
          <p className="text-[#D4AF37] text-[11px] font-semibold tracking-[0.2em] uppercase mb-1.5">
            Reception · Ext. 0
          </p>
          <h1 className="text-[2rem] font-bold text-white leading-tight tracking-tight">Front Desk</h1>
          <p className="text-sm text-white/30 mt-1">Seilerweg 19 · 39114 Magdeburg · +49 391 5632660</p>
        </div>
      </div>

      <main className="flex-1 overflow-y-auto pb-24">

        {/* Quick requests grid */}
        <div className="px-4 pt-5">
          <p className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-3">Quick Requests</p>
          <div className="grid grid-cols-2 gap-2.5">
            {QUICK_REQUESTS.map((preset) => {
              const Icon = preset.icon
              return (
                <button
                  key={preset.id}
                  onClick={() => openCompose(preset)}
                  className="flex items-center gap-3 p-3.5 rounded-2xl bg-[#0f1628] border border-white/8 text-left active:scale-[0.97] transition-transform hover:border-white/15"
                >
                  <div className="w-9 h-9 rounded-xl bg-[#1A2B48] flex items-center justify-center shrink-0">
                    <Icon size={17} className="text-[#D4AF37]" />
                  </div>
                  <span className="text-sm font-medium text-stone-200 leading-snug">{preset.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Request history */}
        <div className="px-4 mt-6">
          <p className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-3">Your Requests</p>

          {loading && <Spinner size={24} className="py-6" />}

          {error && (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-900/20 rounded-2xl border border-red-800/30">
              <AlertCircle size={15} className="text-red-400 shrink-0" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {!loading && !error && (requests ?? []).length === 0 && (
            <div className="text-center py-10">
              <MessageSquare size={32} className="text-stone-700 mx-auto mb-3" />
              <p className="text-stone-600 text-sm">No requests yet.</p>
              <p className="text-stone-700 text-xs mt-1">Use a quick request above to get started.</p>
            </div>
          )}

          {!loading && (requests ?? []).length > 0 && (
            <div className="space-y-2.5">
              {(requests ?? []).map((req) => {
                const cfg = STATUS_CONFIG[req.status] ?? STATUS_CONFIG.open
                return (
                  <button
                    key={req.ticketId}
                    onClick={() => openDetail(req)}
                    className="w-full flex items-center gap-3 p-4 rounded-2xl bg-[#0f1628] border border-white/8 text-left active:scale-[0.98] transition-transform hover:border-white/15"
                  >
                    {/* Status dot */}
                    <div className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-white truncate">{req.title}</p>
                        {req.hasUnread && (
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-stone-600 mt-0.5 flex items-center gap-1.5">
                        <span>{req.ticketId}</span>
                        <span>·</span>
                        <span>{timeAgo(req.submittedAt)}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge status={req.status} />
                      <ChevronRight size={14} className="text-stone-700" />
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <p className="text-center text-xs text-stone-800 mt-8 mb-2 px-6">
          Das Elb Hotel · Seilerweg 19 · 39114 Magdeburg · Mo–So 00:00–24:00
        </p>
      </main>

      <BottomNav />
    </div>
  )
}
