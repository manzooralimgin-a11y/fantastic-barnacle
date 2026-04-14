import { useState } from 'react'
import { Sparkles, Clock, ChevronRight, CheckCircle2, CalendarDays } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useFetch, useMutation } from '../hooks/useFetch'
import { spaApi } from '../services/api'
import TopBar from '../components/TopBar'
import BottomNav from '../components/BottomNav'
import Card from '../components/Card'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Badge from '../components/Badge'
import Spinner from '../components/Spinner'
import { ROUTES } from '../constants'
import { formatPrice, formatDate } from '../utils'

const CATEGORY_LABELS = {
  massage:  { label: 'Massage',  emoji: '💆' },
  facial:   { label: 'Facial',   emoji: '✨' },
  nails:    { label: 'Nails',    emoji: '💅' },
  wellness: { label: 'Wellness', emoji: '🧘' },
}

function ServiceCard({ service, onBook }) {
  const cat = CATEGORY_LABELS[service.category] ?? { label: service.category, emoji: '🌿' }
  return (
    <Card onClick={() => onBook(service)} className="!p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center text-xl shrink-0">
            {cat.emoji}
          </div>
          <div>
            <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">{service.name}</p>
            <p className="text-xs text-stone-400 mt-0.5 leading-snug">{service.description}</p>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="default">
                <Clock size={10} className="shrink-0" />
                {service.duration} min
              </Badge>
              <Badge variant="accent">{cat.label}</Badge>
            </div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold text-[#1a3a2a] dark:text-[#7ab89a]">{formatPrice(service.price)}</p>
          <ChevronRight size={14} className="text-stone-300 mt-1 ml-auto" />
        </div>
      </div>
    </Card>
  )
}

const DATES = Array.from({ length: 7 }, (_, i) => {
  const d = new Date()
  d.setDate(d.getDate() + i)
  return d
})

export default function SpaScreen() {
  const { addActiveRequest } = useApp()
  const [selectedService, setSelectedService] = useState(null)
  const [selectedDate, setSelectedDate] = useState(DATES[0])
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [booking, setBooking] = useState(null)

  const { data: services, loading: servicesLoading } = useFetch(spaApi.getServices, [])
  const { data: slots, loading: slotsLoading } = useFetch(
    () => selectedService ? spaApi.getAvailableSlots(selectedService.id, selectedDate) : Promise.resolve([]),
    [selectedService?.id, selectedDate.toDateString()],
    { immediate: !!selectedService }
  )
  const { mutate: bookSpa, loading: bookingLoading } = useMutation(spaApi.book)

  const handleBook = (service) => {
    setSelectedService(service)
    setSelectedSlot(null)
  }

  const handleConfirmBooking = async () => {
    const result = await bookSpa({
      serviceId: selectedService.id,
      serviceName: selectedService.name,
      date: selectedDate.toISOString(),
      time: selectedSlot,
    })
    addActiveRequest(result)
    setBooking(result)
    setSelectedService(null)
    setSelectedSlot(null)
  }

  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  if (booking) return (
    <div className="flex flex-col min-h-dvh bg-stone-50 dark:bg-stone-950">
      <TopBar title="Spa & Wellness" backRoute={ROUTES.HOME} />
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center pb-24">
        <div className="w-20 h-20 rounded-3xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mb-5 text-4xl">
          ✨
        </div>
        <h2 className="text-xl font-bold text-stone-900 dark:text-stone-100">Booking Confirmed!</h2>
        <p className="text-stone-500 dark:text-stone-400 mt-2 text-sm">
          {booking.serviceName}
        </p>
        <div className="flex items-center gap-2 mt-4 px-4 py-3 rounded-xl bg-violet-50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-800">
          <CalendarDays size={16} className="text-violet-600 dark:text-violet-400 shrink-0" />
          <p className="text-sm text-violet-700 dark:text-violet-300">
            <strong>{formatDate(booking.date)}</strong> at <strong>{booking.time}</strong>
          </p>
        </div>
        <p className="text-xs text-stone-400 mt-3">Confirmation sent to your room profile.</p>
        <Button className="mt-8" onClick={() => setBooking(null)}>Back to Spa</Button>
      </div>
      <BottomNav />
    </div>
  )

  return (
    <div className="flex flex-col min-h-dvh bg-stone-50 dark:bg-stone-950">
      <TopBar title="Spa & Wellness" backRoute={ROUTES.HOME} />

      <main className="flex-1 overflow-y-auto pb-24 pt-2 px-4 space-y-3">
        {/* Hero */}
        <div className="rounded-2xl bg-gradient-to-br from-violet-600 to-purple-800 p-5 text-white overflow-hidden relative">
          <div className="absolute -right-6 -top-6 w-32 h-32 rounded-full bg-white/10" />
          <p className="text-xs uppercase tracking-widest text-white/70 mb-1">Das Elb</p>
          <h2 className="text-lg font-bold">Spa & Wellness</h2>
          <p className="text-sm text-white/80 mt-1">Open daily · 08:00 – 22:00 · Level B</p>
        </div>

        {servicesLoading ? (
          <Spinner size={32} className="py-10" />
        ) : (
          <>
            <h3 className="text-sm font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wide pt-2">
              Our Treatments
            </h3>
            {services?.map((service) => (
              <ServiceCard key={service.id} service={service} onBook={handleBook} />
            ))}
          </>
        )}
      </main>

      {/* Booking modal */}
      <Modal
        open={!!selectedService}
        onClose={() => setSelectedService(null)}
        title={selectedService?.name}
      >
        {selectedService && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-stone-50 dark:bg-stone-800">
              <Clock size={14} className="text-stone-400" />
              <span className="text-sm text-stone-600 dark:text-stone-300">{selectedService.duration} minutes</span>
              <span className="ml-auto text-sm font-semibold text-[#1a3a2a] dark:text-[#7ab89a]">
                {formatPrice(selectedService.price)}
              </span>
            </div>

            {/* Date picker */}
            <div>
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">Select Date</p>
              <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                {DATES.map((date) => {
                  const active = date.toDateString() === selectedDate.toDateString()
                  return (
                    <button
                      key={date.toDateString()}
                      onClick={() => { setSelectedDate(date); setSelectedSlot(null) }}
                      className={[
                        'shrink-0 flex flex-col items-center px-3 py-2 rounded-xl text-xs font-medium transition-colors',
                        active
                          ? 'bg-[#1a3a2a] text-white'
                          : 'bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400',
                      ].join(' ')}
                    >
                      <span>{DAY_LABELS[date.getDay()]}</span>
                      <span className="text-base font-bold mt-0.5">{date.getDate()}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Time slots */}
            <div>
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">Select Time</p>
              {slotsLoading ? (
                <Spinner size={20} className="py-3" />
              ) : (
                <div className="grid grid-cols-4 gap-1.5">
                  {slots?.map((slot) => (
                    <button
                      key={slot}
                      onClick={() => setSelectedSlot(slot)}
                      className={[
                        'py-2 rounded-lg text-xs font-medium transition-colors',
                        selectedSlot === slot
                          ? 'bg-[#1a3a2a] text-white'
                          : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300',
                      ].join(' ')}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Button
              fullWidth
              disabled={!selectedSlot}
              loading={bookingLoading}
              onClick={handleConfirmBooking}
              icon={CheckCircle2}
            >
              Confirm Booking
            </Button>
          </div>
        )}
      </Modal>

      <BottomNav />
    </div>
  )
}
