import { useState } from 'react'
import { BedDouble, Sparkles, Wind, CheckCircle2, EyeOff, Plus, Minus } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useMutation } from '../hooks/useFetch'
import { housekeepingApi } from '../services/api'
import TopBar from '../components/TopBar'
import BottomNav from '../components/BottomNav'
import Card from '../components/Card'
import Button from '../components/Button'
import Badge from '../components/Badge'
import Spinner from '../components/Spinner'
import { useFetch } from '../hooks/useFetch'
import { ROUTES } from '../constants'
import { groupBy } from '../utils'

const CLEANING_TYPES = [
  { id: 'full',     icon: Sparkles, label: 'Full Cleaning',      description: 'Complete room service including linen change' },
  { id: 'turndown', icon: BedDouble, label: 'Turndown Service',  description: 'Evening bed preparation & bathroom refresh' },
  { id: 'express',  icon: Wind,     label: 'Express Tidy',       description: 'Quick tidy-up, no linen change' },
]

export default function HousekeepingScreen() {
  const { addActiveRequest } = useApp()
  const [dnd, setDnd] = useState(false)
  const [selectedCleaning, setSelectedCleaning] = useState(null)
  const [selectedAmenities, setSelectedAmenities] = useState({})
  const [success, setSuccess] = useState(null)

  const { data: amenityList, loading: amenitiesLoading } = useFetch(housekeepingApi.getAmenityList, [])
  const { mutate: requestCleaning, loading: cleaningLoading } = useMutation(housekeepingApi.requestCleaning)
  const { mutate: requestAmenities, loading: amenitiesRequestLoading } = useMutation(housekeepingApi.requestAmenities)
  const { mutate: setDndApi } = useMutation(housekeepingApi.setDoNotDisturb)

  const toggleDnd = async () => {
    const next = !dnd
    setDnd(next)
    await setDndApi(next).catch(() => setDnd(!next))
  }

  const toggleAmenity = (id) => {
    setSelectedAmenities((prev) => {
      const current = prev[id] ?? 0
      if (current === 0) return { ...prev, [id]: 1 }
      const { [id]: _, ...rest } = prev
      return rest
    })
  }

  const amenityCount = Object.values(selectedAmenities).reduce((s, v) => s + v, 0)
  const groupedAmenities = amenityList ? groupBy(amenityList, 'category') : {}

  const handleRequestCleaning = async () => {
    if (!selectedCleaning) return
    const result = await requestCleaning(selectedCleaning)
    addActiveRequest(result)
    setSuccess({ type: 'cleaning', label: CLEANING_TYPES.find((t) => t.id === selectedCleaning)?.label, time: result.estimatedTime })
    setSelectedCleaning(null)
  }

  const handleRequestAmenities = async () => {
    if (amenityCount === 0) return
    const items = Object.entries(selectedAmenities).map(([id, qty]) => ({
      ...amenityList.find((a) => a.id === id),
      quantity: qty,
    }))
    const result = await requestAmenities(items)
    addActiveRequest(result)
    setSuccess({ type: 'amenities', count: amenityCount })
    setSelectedAmenities({})
  }

  const CATEGORY_LABELS = {
    linens: 'Linens & Bath',
    toiletries: 'Toiletries',
    food: 'Food & Drinks',
    beverages: 'Beverages',
    tech: 'Technology',
    other: 'Other',
  }

  return (
    <div className="flex flex-col min-h-dvh bg-stone-50 dark:bg-stone-950">
      <TopBar title="Housekeeping" backRoute={ROUTES.HOME} />

      <main className="flex-1 overflow-y-auto pb-24 space-y-5 pt-2 px-4">

        {/* Success toast */}
        {success && (
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800">
            <CheckCircle2 size={20} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">Request received!</p>
              <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-0.5">
                {success.type === 'cleaning'
                  ? `${success.label} scheduled. Estimated: ${success.time}.`
                  : `${success.count} item${success.count !== 1 ? 's' : ''} requested. We'll bring them shortly.`}
              </p>
            </div>
            <button onClick={() => setSuccess(null)} className="text-emerald-400 ml-auto">✕</button>
          </div>
        )}

        {/* Do Not Disturb */}
        <Card>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${dnd ? 'bg-red-100 dark:bg-red-900/20' : 'bg-stone-100 dark:bg-stone-800'}`}>
                <EyeOff size={18} className={dnd ? 'text-red-600 dark:text-red-400' : 'text-stone-400'} />
              </div>
              <div>
                <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">Do Not Disturb</p>
                <p className="text-xs text-stone-400">{dnd ? 'Active – room will not be serviced' : 'Staff may enter for housekeeping'}</p>
              </div>
            </div>
            <button
              onClick={toggleDnd}
              className={[
                'relative w-12 h-6 rounded-full transition-colors duration-200',
                dnd ? 'bg-red-500' : 'bg-stone-200 dark:bg-stone-700',
              ].join(' ')}
            >
              <span className={[
                'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200',
                dnd ? 'translate-x-6' : 'translate-x-0.5',
              ].join(' ')} />
            </button>
          </div>
        </Card>

        {/* Cleaning type */}
        <section>
          <h2 className="text-sm font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wide mb-3">
            Request Cleaning
          </h2>
          <div className="flex flex-col gap-2">
            {CLEANING_TYPES.map(({ id, icon: Icon, label, description }) => (
              <button
                key={id}
                onClick={() => setSelectedCleaning((prev) => prev === id ? null : id)}
                className={[
                  'flex items-center gap-3 p-4 rounded-2xl border text-left transition-all',
                  selectedCleaning === id
                    ? 'bg-[#1a3a2a] border-[#1a3a2a] text-white'
                    : 'bg-white dark:bg-stone-900 border-stone-100 dark:border-stone-800 text-stone-800 dark:text-stone-200',
                ].join(' ')}
              >
                <Icon size={20} className={selectedCleaning === id ? 'text-[#c9a84c]' : 'text-stone-400'} />
                <div>
                  <p className="text-sm font-semibold">{label}</p>
                  <p className={`text-xs mt-0.5 ${selectedCleaning === id ? 'text-white/70' : 'text-stone-400'}`}>
                    {description}
                  </p>
                </div>
              </button>
            ))}
          </div>
          <Button
            className="mt-3"
            fullWidth
            disabled={!selectedCleaning || dnd}
            loading={cleaningLoading}
            onClick={handleRequestCleaning}
          >
            {dnd ? 'Disable DND to Request' : 'Request Cleaning'}
          </Button>
        </section>

        {/* Amenities */}
        <section>
          <h2 className="text-sm font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wide mb-3">
            Request Amenities
          </h2>
          {amenitiesLoading ? (
            <Spinner size={24} className="py-6" />
          ) : (
            <div className="flex flex-col gap-4">
              {Object.entries(groupedAmenities).map(([cat, items]) => (
                <div key={cat}>
                  <p className="text-xs font-medium text-stone-400 uppercase tracking-wide mb-2 px-1">
                    {CATEGORY_LABELS[cat] ?? cat}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {items.map((item) => {
                      const qty = selectedAmenities[item.id] ?? 0
                      const selected = qty > 0
                      return (
                        <button
                          key={item.id}
                          onClick={() => toggleAmenity(item.id)}
                          className={[
                            'flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all',
                            selected
                              ? 'bg-[#1a3a2a]/5 dark:bg-[#1a3a2a]/30 border-[#1a3a2a]/30 dark:border-[#7ab89a]/30'
                              : 'bg-white dark:bg-stone-900 border-stone-100 dark:border-stone-800',
                          ].join(' ')}
                        >
                          <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${selected ? 'bg-[#1a3a2a] dark:bg-[#7ab89a]' : 'bg-stone-100 dark:bg-stone-800'}`}>
                            {selected
                              ? <span className="text-white dark:text-stone-900 text-xs font-bold">{qty}</span>
                              : <Plus size={12} className="text-stone-400" />}
                          </div>
                          <span className="text-xs font-medium text-stone-700 dark:text-stone-300 leading-tight">
                            {item.name}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          {amenityCount > 0 && (
            <Button
              className="mt-4"
              fullWidth
              loading={amenitiesRequestLoading}
              onClick={handleRequestAmenities}
            >
              Request {amenityCount} Item{amenityCount !== 1 ? 's' : ''}
            </Button>
          )}
        </section>
      </main>

      <BottomNav />
    </div>
  )
}
