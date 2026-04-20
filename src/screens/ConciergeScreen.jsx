import { useState, useRef, useEffect } from 'react'
import { Send, Car, AlarmClock, MapPin, Star, ExternalLink } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useFetch, useMutation } from '../hooks/useFetch'
import { conciergeApi } from '../services/api'
import TopBar from '../components/TopBar'
import BottomNav from '../components/BottomNav'
import Card from '../components/Card'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Badge from '../components/Badge'
import Spinner from '../components/Spinner'
import { ROUTES } from '../constants'
import { formatTime } from '../utils'

const QUICK_MESSAGES = [
  'Can you recommend a restaurant nearby?',
  'I need an umbrella.',
  'Is the pool open today?',
  'Can I get late check-out?',
]

const CATEGORY_ICONS = {
  dining:     '🍽️',
  attraction: '🏛️',
  activity:   '⛵',
  culture:    '🎵',
}

export default function ConciergeScreen() {
  const { guest } = useApp()
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'concierge',
      text: `Welcome, ${guest?.firstName}! I'm your personal concierge. How can I help you today?`,
      time: new Date().toISOString(),
    },
  ])
  const [input, setInput] = useState('')
  const [showTaxi, setShowTaxi] = useState(false)
  const [showWakeUp, setShowWakeUp] = useState(false)
  const [wakeUpTime, setWakeUpTime] = useState('07:00')
  const [taxiResult, setTaxiResult] = useState(null)
  const [wakeUpResult, setWakeUpResult] = useState(null)
  const messagesEndRef = useRef(null)

  const { data: recommendations, loading: recLoading } = useFetch(
    () => conciergeApi.getRecommendations(),
    []
  )
  const { mutate: sendMessage, loading: sending } = useMutation(conciergeApi.sendMessage)
  const { mutate: bookTaxi, loading: taxiLoading } = useMutation(conciergeApi.bookTaxi)
  const { mutate: requestWakeUp, loading: wakeUpLoading } = useMutation(conciergeApi.requestWakeUp)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async (text) => {
    const msg = text ?? input.trim()
    if (!msg) return
    setInput('')

    const userMsg = { id: Date.now(), role: 'guest', text: msg, time: new Date().toISOString() }
    setMessages((prev) => [...prev, userMsg])

    const result = await sendMessage(msg)
    setMessages((prev) => [
      ...prev,
      { id: result.messageId, role: 'concierge', text: result.reply, time: result.timestamp },
    ])
  }

  const handleTaxi = async () => {
    const result = await bookTaxi({ destination: 'As requested' })
    setTaxiResult(result)
  }

  const handleWakeUp = async () => {
    const result = await requestWakeUp(wakeUpTime)
    setWakeUpResult(result)
    setTimeout(() => setShowWakeUp(false), 1500)
  }

  return (
    <div className="flex flex-col min-h-dvh bg-stone-50 dark:bg-stone-950">
      <TopBar title="Concierge" backRoute={ROUTES.HOME} />

      <main className="flex-1 overflow-y-auto pb-36">
        {/* Quick actions row */}
        <div className="px-4 pt-3 flex gap-2 overflow-x-auto scrollbar-hide pb-1">
          <button
            onClick={() => setShowTaxi(true)}
            className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 text-sm font-medium text-stone-700 dark:text-stone-300 shadow-sm"
          >
            <Car size={15} className="text-[#1a3a2a] dark:text-[#7ab89a]" />
            Book Taxi
          </button>
          <button
            onClick={() => setShowWakeUp(true)}
            className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 text-sm font-medium text-stone-700 dark:text-stone-300 shadow-sm"
          >
            <AlarmClock size={15} className="text-[#1a3a2a] dark:text-[#7ab89a]" />
            Wake-up Call
          </button>
        </div>

        {/* Recommendations */}
        <section className="px-4 mt-4">
          <h2 className="text-sm font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wide mb-3">
            Nearby Highlights
          </h2>
          {recLoading ? (
            <Spinner size={24} className="py-4" />
          ) : (
            <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
              {recommendations?.map((rec) => (
                <div key={rec.id} className="shrink-0 w-56 bg-white dark:bg-stone-900 rounded-2xl border border-stone-100 dark:border-stone-800 p-3 shadow-sm">
                  <div className="text-2xl mb-2">{CATEGORY_ICONS[rec.category] ?? '📍'}</div>
                  <p className="text-sm font-semibold text-stone-900 dark:text-stone-100 leading-tight">{rec.name}</p>
                  <p className="text-xs text-stone-400 mt-1 leading-snug">{rec.description}</p>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-1">
                      <Star size={11} className="text-amber-400 fill-amber-400" />
                      <span className="text-xs text-stone-500">{rec.rating}</span>
                    </div>
                    <Badge variant="default">
                      <MapPin size={9} />
                      {rec.distance}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Chat */}
        <section className="px-4 mt-5">
          <h2 className="text-sm font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wide mb-3">
            Chat with Concierge
          </h2>
          <div className="flex flex-col gap-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'guest' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={[
                  'max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed',
                  msg.role === 'guest'
                    ? 'bg-[#1a3a2a] text-white rounded-br-sm'
                    : 'bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-200 border border-stone-100 dark:border-stone-800 rounded-bl-sm shadow-sm',
                ].join(' ')}>
                  <p>{msg.text}</p>
                  <p className={`text-[10px] mt-1 ${msg.role === 'guest' ? 'text-white/50' : 'text-stone-300 dark:text-stone-600'}`}>
                    {formatTime(msg.time)}
                  </p>
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="px-4 py-3 rounded-2xl bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 shadow-sm">
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="w-1.5 h-1.5 rounded-full bg-stone-300 animate-[bounce_1s_ease-in-out_infinite]" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </section>

        {/* Quick message chips */}
        <div className="px-4 mt-3 flex gap-2 flex-wrap">
          {QUICK_MESSAGES.map((msg) => (
            <button
              key={msg}
              onClick={() => handleSend(msg)}
              className="text-xs px-3 py-1.5 rounded-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
            >
              {msg}
            </button>
          ))}
        </div>
      </main>

      {/* Input bar */}
      <div className="fixed bottom-16 inset-x-0 z-20 bg-white/90 dark:bg-stone-900/90 backdrop-blur-md border-t border-stone-100 dark:border-stone-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Message your concierge…"
            className="flex-1 h-10 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#c9a84c] text-stone-900 dark:text-stone-100 placeholder:text-stone-400"
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || sending}
            className="w-10 h-10 rounded-xl bg-[#1a3a2a] flex items-center justify-center text-white disabled:opacity-40 hover:bg-[#2d5a42] transition-colors"
          >
            <Send size={16} />
          </button>
        </div>
      </div>

      {/* Taxi modal */}
      <Modal open={showTaxi} onClose={() => { setShowTaxi(false); setTaxiResult(null) }} title="Book a Taxi">
        {taxiResult ? (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <div className="text-4xl">🚕</div>
            <h3 className="font-semibold text-stone-900 dark:text-stone-100">Taxi Booked!</h3>
            <div className="w-full p-4 rounded-xl bg-stone-50 dark:bg-stone-800 text-sm space-y-1.5 text-left">
              <div className="flex justify-between"><span className="text-stone-400">Driver</span><span className="font-medium text-stone-800 dark:text-stone-200">{taxiResult.driver}</span></div>
              <div className="flex justify-between"><span className="text-stone-400">Plate</span><span className="font-medium text-stone-800 dark:text-stone-200">{taxiResult.plate}</span></div>
              <div className="flex justify-between"><span className="text-stone-400">ETA</span><span className="font-semibold text-emerald-600">{taxiResult.estimatedArrival}</span></div>
            </div>
            <Button fullWidth onClick={() => { setShowTaxi(false); setTaxiResult(null) }}>Done</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-stone-500 dark:text-stone-400">
              A taxi will be dispatched to the hotel entrance. Please be ready in the lobby.
            </p>
            <Button fullWidth loading={taxiLoading} onClick={handleTaxi} icon={Car}>
              Dispatch Taxi Now
            </Button>
          </div>
        )}
      </Modal>

      {/* Wake-up modal */}
      <Modal open={showWakeUp} onClose={() => setShowWakeUp(false)} title="Wake-up Call">
        <div className="flex flex-col gap-4">
          {wakeUpResult ? (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20">
              <span className="text-2xl">⏰</span>
              <p className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">
                Wake-up call set for <strong>{wakeUpResult.time}</strong>
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-stone-500 dark:text-stone-400">
                Select the time for your wake-up call.
              </p>
              <input
                type="time"
                value={wakeUpTime}
                onChange={(e) => setWakeUpTime(e.target.value)}
                className="w-full h-11 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#c9a84c] text-stone-900 dark:text-stone-100"
              />
              <Button fullWidth loading={wakeUpLoading} onClick={handleWakeUp} icon={AlarmClock}>
                Set Wake-up Call
              </Button>
            </>
          )}
        </div>
      </Modal>

      <BottomNav />
    </div>
  )
}
