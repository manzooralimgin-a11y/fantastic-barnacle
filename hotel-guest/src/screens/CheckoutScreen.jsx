import { useState } from 'react'
import { CreditCard, CheckCircle2, Receipt, LogOut } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useFetch, useMutation } from '../hooks/useFetch'
import { profileApi } from '../services/api'
import TopBar from '../components/TopBar'
import BottomNav from '../components/BottomNav'
import Card from '../components/Card'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Spinner from '../components/Spinner'
import { ROUTES } from '../constants'
import { formatPrice } from '../utils'

const LINE_LABELS = {
  roomCharge:  'Room Charge',
  roomService: 'Room Service',
  spa:         'Spa & Wellness',
  minibar:     'Minibar',
}

export default function CheckoutScreen() {
  const { logout, guest } = useApp()
  const [showConfirm, setShowConfirm] = useState(false)
  const [checkedOut, setCheckedOut] = useState(false)

  const { data: folio, loading } = useFetch(profileApi.getFolioBalance, [])
  const { mutate: checkout, loading: checkingOut } = useMutation(profileApi.checkout)

  const handleCheckout = async () => {
    await checkout()
    setShowConfirm(false)
    setCheckedOut(true)
    setTimeout(() => logout(), 3000)
  }

  if (checkedOut) return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#1a3a2a] px-6 text-center">
      <div className="w-20 h-20 rounded-3xl bg-white/10 flex items-center justify-center mb-6">
        <CheckCircle2 size={40} className="text-[#c9a84c]" />
      </div>
      <h2 className="text-2xl font-bold text-white">Thank you, {guest?.firstName}!</h2>
      <p className="text-white/60 mt-2 text-sm leading-relaxed">
        We hope you enjoyed your stay at das elb.<br />See you again soon in Hamburg.
      </p>
      <div className="mt-6 flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="w-1.5 h-1.5 rounded-full bg-white/30 animate-[bounce_1.2s_ease-in-out_infinite]" style={{ animationDelay: `${i * 0.2}s` }} />
        ))}
      </div>
    </div>
  )

  return (
    <div className="flex flex-col min-h-dvh bg-stone-50 dark:bg-stone-950">
      <TopBar title="My Folio" backRoute={ROUTES.HOME} />

      <main className="flex-1 overflow-y-auto pb-24 pt-3 px-4 space-y-4">
        {loading ? (
          <Spinner size={32} className="py-20" />
        ) : folio ? (
          <>
            {/* Summary header */}
            <div className="rounded-2xl bg-gradient-to-br from-[#1a3a2a] to-[#2d5a42] p-5 text-white">
              <p className="text-white/60 text-xs uppercase tracking-widest mb-1">Total Balance</p>
              <p className="text-3xl font-bold">{formatPrice(folio.total)}</p>
              <p className="text-white/50 text-xs mt-1">Charged to Room {guest?.roomNumber}</p>
            </div>

            {/* Line items */}
            <Card padding={false}>
              <div className="px-4 py-3 border-b border-stone-100 dark:border-stone-800">
                <div className="flex items-center gap-2">
                  <Receipt size={15} className="text-stone-400" />
                  <p className="text-sm font-semibold text-stone-700 dark:text-stone-300">Charges Breakdown</p>
                </div>
              </div>
              {Object.entries(LINE_LABELS).map(([key, label], i, arr) => {
                const amount = folio[key]
                if (!amount) return null
                return (
                  <div key={key} className={`flex items-center justify-between px-4 py-3.5 ${i < arr.length - 1 ? 'border-b border-stone-50 dark:border-stone-800/50' : ''}`}>
                    <span className="text-sm text-stone-600 dark:text-stone-400">{label}</span>
                    <span className="text-sm font-medium text-stone-900 dark:text-stone-100">{formatPrice(amount)}</span>
                  </div>
                )
              })}
              <div className="flex items-center justify-between px-4 py-4 border-t border-stone-100 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/40 rounded-b-2xl">
                <span className="text-sm font-bold text-stone-900 dark:text-stone-100">Total</span>
                <span className="text-base font-bold text-[#1a3a2a] dark:text-[#7ab89a]">{formatPrice(folio.total)}</span>
              </div>
            </Card>

            <p className="text-xs text-stone-400 dark:text-stone-600 text-center">
              All charges are approximate until final billing at checkout.
            </p>

            <Button
              fullWidth
              size="lg"
              variant="accent"
              icon={LogOut}
              onClick={() => setShowConfirm(true)}
            >
              Check Out Now
            </Button>
          </>
        ) : null}
      </main>

      <Modal open={showConfirm} onClose={() => setShowConfirm(false)} title="Confirm Check-out">
        <div className="flex flex-col gap-4">
          <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800">
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Your total folio of <strong>{folio ? formatPrice(folio.total) : '—'}</strong> will be charged to the payment method on file.
            </p>
          </div>
          <p className="text-sm text-stone-500 dark:text-stone-400">
            Please leave your key card at reception. We hope you enjoyed your stay!
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={() => setShowConfirm(false)}>Cancel</Button>
            <Button variant="accent" fullWidth loading={checkingOut} onClick={handleCheckout} icon={CreditCard}>
              Confirm
            </Button>
          </div>
        </div>
      </Modal>

      <BottomNav />
    </div>
  )
}
