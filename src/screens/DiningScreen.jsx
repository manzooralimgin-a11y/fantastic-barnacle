import { useState } from 'react'
import {
  ChevronLeft, Clock, ShoppingCart, CheckCircle2, AlertCircle,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useFetch } from '../hooks/useFetch'
import { diningApi } from '../services/api'
import BottomNav from '../components/BottomNav'
import Button from '../components/Button'
import Spinner from '../components/Spinner'
import { ROUTES } from '../constants'
import { formatPrice } from '../utils'

// ─── Tag badge ────────────────────────────────────────────────────────────────
const TAG_STYLES = {
  'Chef Special':       'bg-[#c9a84c]/20 text-[#c9a84c] border border-[#c9a84c]/40',
  'Popular':            'bg-blue-500/15 text-blue-300 border border-blue-500/25',
  "Today's Highlight":  'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25',
  'Limited Time':       'bg-red-500/15 text-red-400 border border-red-400/25',
  'New':                'bg-violet-500/15 text-violet-400 border border-violet-400/25',
  'Seasonal':           'bg-teal-500/15 text-teal-400 border border-teal-400/25',
  'Signature':          'bg-purple-500/15 text-purple-400 border border-purple-400/25',
}

function TagBadge({ label }) {
  const cls = TAG_STYLES[label] ?? 'bg-stone-700/50 text-stone-400 border border-stone-600/30'
  return (
    <span className={`inline-flex items-center text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${cls}`}>
      {label}
    </span>
  )
}

// ─── Static gradient themes (safe from Tailwind purge) ────────────────────────
const THEMES = [
  { from: 'from-blue-950',    to: 'to-stone-950',    ring: 'bg-blue-900/30'    },
  { from: 'from-red-950',     to: 'to-stone-950',    ring: 'bg-red-900/30'     },
  { from: 'from-amber-950',   to: 'to-stone-950',    ring: 'bg-amber-900/30'   },
  { from: 'from-zinc-900',    to: 'to-stone-950',    ring: 'bg-zinc-800/40'    },
  { from: 'from-yellow-950',  to: 'to-stone-950',    ring: 'bg-yellow-900/25'  },
  { from: 'from-emerald-950', to: 'to-stone-950',    ring: 'bg-emerald-900/30' },
]

function vegLabel(dietary) {
  if (dietary?.vegan)       return '🌱 Vegan'
  if (dietary?.vegetarian)  return '🌿 Vegetarian'
  return null
}

// ─── Reusable info card ───────────────────────────────────────────────────────
function InfoCard({ label, children }) {
  return (
    <div className="bg-white dark:bg-stone-900 rounded-2xl p-4 border border-stone-100 dark:border-stone-800">
      <p className="text-[11px] font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wider mb-3">
        {label}
      </p>
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
export default function DiningScreen() {
  const { addToCart, navigate } = useApp()
  const [view,         setView]        = useState('list')
  const [selectedDish, setSelectedDish] = useState(null)
  const [addedId,      setAddedId]     = useState(null)

  const { data: dishes, loading, error } = useFetch(diningApi.getSpecialDishes, [])

  const handleAddToCart = (dish) => {
    addToCart(dish)
    setAddedId(dish.id)
    setTimeout(() => setAddedId(null), 2000)
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex flex-col min-h-dvh bg-[#0a0f0c]">
      <div className="safe-top" />
      <Spinner className="flex-1" size={32} />
      <BottomNav />
    </div>
  )

  if (error) return (
    <div className="flex flex-col min-h-dvh bg-[#0a0f0c]">
      <div className="safe-top" />
      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
        <AlertCircle size={40} className="text-stone-600" />
        <p className="text-stone-400 text-sm">{error}</p>
        <button onClick={() => navigate(ROUTES.HOME)} className="text-[#c9a84c] text-sm hover:underline">
          Go back
        </button>
      </div>
      <BottomNav />
    </div>
  )

  // ── Detail view ──────────────────────────────────────────────────────────
  if (view === 'detail' && selectedDish) {
    const dish  = selectedDish
    const idx   = (dishes ?? []).indexOf(dish)
    const theme = THEMES[idx % THEMES.length]
    const veg   = vegLabel(dish.dietary)
    const added = addedId === dish.id

    return (
      <div className="flex flex-col min-h-dvh bg-stone-50 dark:bg-stone-950">

        {/* ── Hero section ── */}
        <div className={`relative bg-gradient-to-b ${theme.from} ${theme.to} shrink-0`}>
          <div className="safe-top" />

          {/* Back button */}
          <div className="flex items-center px-4 pt-2 pb-1">
            <button
              onClick={() => setView('list')}
              className="flex items-center gap-1.5 text-white/50 hover:text-white transition-colors py-2"
            >
              <ChevronLeft size={20} />
              <span className="text-sm font-medium">Menu</span>
            </button>
          </div>

          <div className="flex flex-col items-center px-5 pt-2 pb-6">
            {/* Emoji */}
            <div className={`w-32 h-32 rounded-3xl ${theme.ring} flex items-center justify-center text-7xl mb-5 backdrop-blur-sm`}>
              {dish.emoji}
            </div>

            {/* Tags */}
            <div className="flex flex-wrap gap-1.5 justify-center mb-4">
              {dish.tags.map((t) => <TagBadge key={t} label={t} />)}
              {veg && (
                <span className="inline-flex items-center text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-900/30 text-emerald-400 border border-emerald-500/20">
                  {veg}
                </span>
              )}
            </div>

            {/* Name */}
            <h1 className="text-3xl font-bold text-white text-center leading-tight mb-2">
              {dish.name}
            </h1>

            {/* Meta */}
            <div className="flex items-center gap-2 text-xs text-white/40 flex-wrap justify-center">
              <span className="font-medium text-white/50">{dish.category}</span>
              <span>·</span>
              <span>{dish.servingTime}</span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <Clock size={11} /> {dish.prepTime} min
              </span>
              {!dish.available && (
                <>
                  <span>·</span>
                  <span className="text-red-400 font-medium">Unavailable</span>
                </>
              )}
            </div>

            {/* Price */}
            <p className="text-3xl font-bold text-[#c9a84c] mt-4">
              {formatPrice(dish.price)}
            </p>
            <p className="text-xs text-white/25 mt-1">per person · charged to room folio</p>
          </div>

          {/* Curved edge */}
          <div className="h-7 bg-stone-50 dark:bg-stone-950 rounded-t-[28px]" />
        </div>

        {/* ── Content ── */}
        <main className="flex-1 overflow-y-auto pb-28">
          <div className="px-4 -mt-1 space-y-4">

            {/* Description */}
            <InfoCard label="About this dish">
              <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
                {dish.description}
              </p>
            </InfoCard>

            {/* Chef's Notes */}
            <InfoCard label="Chef's Notes">
              <div className="border-l-2 border-[#c9a84c] pl-4">
                <p className="text-sm text-stone-600 dark:text-stone-400 italic leading-relaxed">
                  "{dish.chefNotes}"
                </p>
              </div>
            </InfoCard>

            {/* Key Ingredients */}
            <InfoCard label="Key Ingredients">
              <div className="flex flex-wrap gap-2">
                {dish.ingredients.map((ing) => (
                  <span
                    key={ing}
                    className="text-xs px-2.5 py-1 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 border border-stone-200 dark:border-stone-700"
                  >
                    {ing}
                  </span>
                ))}
              </div>
            </InfoCard>

            {/* Chef's Recommendation */}
            <div className="bg-[#0f1f17] rounded-2xl p-4 border border-[#c9a84c]/20">
              <p className="text-[11px] font-semibold text-[#c9a84c]/60 uppercase tracking-wider mb-2">
                How to Enjoy
              </p>
              <p className="text-sm text-stone-300 leading-relaxed">
                {dish.chefRecommendation}
              </p>
            </div>

            {/* Allergens */}
            <InfoCard label="Allergens">
              {dish.allergens?.length > 0
                ? <p className="text-sm text-stone-600 dark:text-stone-400">{dish.allergens.join(', ')}</p>
                : <p className="text-sm text-emerald-600 dark:text-emerald-400">No major allergens</p>
              }
            </InfoCard>

            {/* CTA */}
            {dish.available ? (
              <Button
                fullWidth
                variant={added ? 'secondary' : 'primary'}
                icon={added ? CheckCircle2 : ShoppingCart}
                onClick={() => handleAddToCart(dish)}
              >
                {added ? 'Added to Order' : `Add to Order · ${formatPrice(dish.price)}`}
              </Button>
            ) : (
              <div className="w-full text-center py-3.5 rounded-2xl bg-stone-100 dark:bg-stone-800 text-sm text-stone-400">
                Currently unavailable
              </div>
            )}

            <p className="text-center text-[11px] text-stone-400 dark:text-stone-600 pb-2">
              Serves {dish.servings} · {dish.servingTime}
            </p>
          </div>
        </main>

        <BottomNav />
      </div>
    )
  }

  // ── List view ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-dvh bg-[#080d0a]">

      {/* Premium header */}
      <div className="relative bg-[#0f1f17] shrink-0 overflow-hidden">
        <div className="absolute -top-12 right-0 w-72 h-72 rounded-full bg-[#c9a84c]/5 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 -left-8 w-48 h-48 rounded-full bg-emerald-900/10 blur-2xl pointer-events-none" />

        <div className="safe-top" />
        <div className="relative flex items-center justify-between px-4 pt-3 pb-1">
          <button
            onClick={() => navigate(ROUTES.HOME)}
            className="p-2 -ml-1 rounded-xl text-white/40 hover:text-white transition-colors"
          >
            <ChevronLeft size={22} />
          </button>
          <span className="text-white/25 text-[10px] font-bold tracking-[0.25em] uppercase">
            das elb
          </span>
          <div className="w-9" />
        </div>

        <div className="relative px-5 pt-1 pb-7">
          <p className="text-[#c9a84c] text-[11px] font-semibold tracking-[0.2em] uppercase mb-1.5">
            Today's Selection
          </p>
          <h1 className="text-[2rem] font-bold text-white leading-tight tracking-tight">
            Signature Dishes
          </h1>
          <p className="text-sm text-white/35 mt-1.5">
            Curated by our Executive Chef
          </p>
        </div>
      </div>

      {/* Dish card list */}
      <main className="flex-1 overflow-y-auto pb-24">
        <div className="px-4 pt-5 space-y-4">
          {(dishes ?? []).map((dish, index) => {
            const theme = THEMES[index % THEMES.length]
            const veg   = vegLabel(dish.dietary)
            return (
              <button
                key={dish.id}
                onClick={() => { setSelectedDish(dish); setView('detail') }}
                className={`group w-full bg-gradient-to-br ${theme.from} ${theme.to} rounded-3xl overflow-hidden text-left active:scale-[0.98] transition-transform duration-150 border border-white/5 shadow-lg`}
              >
                <div className="p-6">
                  {/* Emoji */}
                  <div className={`w-24 h-24 rounded-2xl ${theme.ring} flex items-center justify-center text-6xl mx-auto mb-5 backdrop-blur-sm`}>
                    {dish.emoji}
                  </div>

                  {/* Category */}
                  <p className="text-center text-[10px] font-bold text-white/25 uppercase tracking-[0.2em] mb-1">
                    {dish.category}
                  </p>

                  {/* Name */}
                  <h2 className="text-2xl font-bold text-white text-center leading-tight mb-2">
                    {dish.name}
                  </h2>

                  {/* Short description */}
                  <p className="text-sm text-white/45 text-center leading-relaxed mb-5">
                    {dish.shortDescription}
                  </p>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1.5 justify-center mb-5">
                    {dish.tags.map((t) => <TagBadge key={t} label={t} />)}
                    {veg && (
                      <span className="inline-flex items-center text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-900/30 text-emerald-400 border border-emerald-500/20">
                        {veg}
                      </span>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="border-t border-white/8 pt-4 flex items-end justify-between">
                    <div>
                      <p className="text-xs text-white/30 font-medium">{dish.servingTime}</p>
                      <p className="text-xs text-white/20 mt-0.5 flex items-center gap-1">
                        <Clock size={10} /> {dish.prepTime} min prep
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-white/25 mb-0.5">per person</p>
                      <p className="text-xl font-bold text-[#c9a84c]">{formatPrice(dish.price)}</p>
                    </div>
                  </div>

                  {!dish.available && (
                    <div className="mt-3 text-center text-xs text-red-400 bg-red-900/25 rounded-xl py-1.5 border border-red-800/30">
                      Currently unavailable
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        <p className="text-center text-xs text-stone-800 dark:text-stone-800 mt-6 mb-2 px-6">
          All dishes charged to your room folio · Prices include VAT
        </p>
      </main>

      <BottomNav />
    </div>
  )
}
