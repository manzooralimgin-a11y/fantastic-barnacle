import { useState, useMemo } from 'react'
import {
  Search, X, ChevronRight, ChevronLeft,
  ShoppingCart, Trash2, CheckCircle2, Clock, AlertCircle,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useFetch, useMutation } from '../hooks/useFetch'
import { menuApi } from '../services/api'
import TopBar from '../components/TopBar'
import BottomNav from '../components/BottomNav'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import QuantitySelector from '../components/QuantitySelector'
import { ROUTES } from '../constants'
import { formatPrice, formatTime } from '../utils'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function DietaryTag({ label, color }) {
  return (
    <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full ${color}`}>
      {label}
    </span>
  )
}

function buildDietaryTags(dietary) {
  const tags = []
  if (dietary?.vegan)            tags.push({ label: '🌱 Vegan',        color: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' })
  else if (dietary?.vegetarian)  tags.push({ label: '🌿 Vegetarian',    color: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' })
  if (dietary?.glutenFree)       tags.push({ label: '🌾 Gluten-Free',   color: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400' })
  if (dietary?.spicy === 1)      tags.push({ label: '🌶️ Mild',          color: 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400' })
  if (dietary?.spicy === 2)      tags.push({ label: '🌶️🌶️ Medium',      color: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400' })
  if (dietary?.spicy >= 3)       tags.push({ label: '🌶️🌶️🌶️ Hot',       color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' })
  return tags
}

const CAT_COLORS = {
  breakfast: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
  starters:  'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400',
  mains:     'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400',
  desserts:  'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400',
  beverages: 'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400',
}

const FILTERS = [
  { id: 'all',        label: 'All'           },
  { id: 'vegetarian', label: '🌿 Vegetarian'  },
  { id: 'vegan',      label: '🌱 Vegan'       },
  { id: 'glutenFree', label: '🌾 Gluten-Free' },
  { id: 'spicy',      label: '🌶️ Spicy'       },
]

// Sticky sub-bar that sits just below TopBar (top-14 = h of TopBar)
function InnerHeader({ title, onBack, right }) {
  return (
    <div className="sticky top-14 z-20 bg-white/95 dark:bg-stone-900/95 backdrop-blur-md border-b border-stone-100 dark:border-stone-800">
      <div className="flex items-center h-11 px-3 gap-2">
        <button
          onClick={onBack}
          className="p-1.5 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors text-stone-600 dark:text-stone-400 shrink-0"
        >
          <ChevronLeft size={20} />
        </button>
        <p className="flex-1 font-semibold text-sm text-stone-900 dark:text-stone-100 truncate">{title}</p>
        {right}
      </div>
    </div>
  )
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function RoomServiceScreen() {
  const { cart, addToCart, updateCartQty, clearCart, addActiveOrder, navigate } = useApp()

  // View state machine
  const [view,          setView]         = useState('categories') // 'categories' | 'items' | 'detail'
  const [selectedCatId, setSelectedCatId] = useState(null)
  const [selectedItem,  setSelectedItem]  = useState(null)
  const [search,        setSearch]        = useState('')
  const [filter,        setFilter]        = useState('all')
  const [itemQty,       setItemQty]       = useState(1)

  // Cart + order modal
  const [showCart,       setShowCart]       = useState(false)
  const [specialRequest, setSpecialRequest] = useState('')
  const [orderSuccess,   setOrderSuccess]   = useState(null)

  const { data: menu, loading, error } = useFetch(menuApi.getMenu, [])
  const { mutate: placeOrder, loading: ordering, error: orderError } = useMutation(menuApi.placeOrder)

  const categories = menu?.categories ?? []
  const currentCat = categories.find((c) => c.id === selectedCatId)

  // All items flattened for global search
  const allItems = useMemo(
    () => categories.flatMap((cat) =>
      cat.items.map((item) => ({ ...item, catId: cat.id, catName: cat.name })),
    ),
    [categories],
  )

  // Cart helpers
  const cartTotal = cart.reduce((s, i) => s + i.price * i.quantity, 0)
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0)
  const getQty    = (id) => cart.find((i) => i.id === id)?.quantity ?? 0

  // Filtered items for current category
  const filteredItems = useMemo(() => {
    if (!currentCat) return []
    let items = currentCat.items
    if (search) {
      const q = search.toLowerCase()
      items = items.filter((i) =>
        i.name.toLowerCase().includes(q) ||
        i.shortDescription.toLowerCase().includes(q),
      )
    }
    if (filter !== 'all') {
      items = filter === 'spicy'
        ? items.filter((i) => (i.dietary?.spicy ?? 0) > 0)
        : items.filter((i) => i.dietary?.[filter])
    }
    return items
  }, [currentCat, search, filter])

  // Global search results (only in categories view)
  const globalResults = useMemo(() => {
    if (!search || view !== 'categories') return []
    const q = search.toLowerCase()
    return allItems.filter((i) =>
      i.name.toLowerCase().includes(q) ||
      i.shortDescription.toLowerCase().includes(q),
    )
  }, [search, allItems, view])

  // ── Event handlers ─────────────────────────────────────────────────────────
  const openCategory = (catId) => {
    setSelectedCatId(catId)
    setSearch('')
    setFilter('all')
    setView('items')
  }

  const openItem = (item, catId) => {
    if (catId) setSelectedCatId(catId)
    setSelectedItem(item)
    setItemQty(Math.max(1, getQty(item.id)))
    setView('detail')
  }

  const handleAddToCart = () => {
    if (!selectedItem) return
    const existing = getQty(selectedItem.id)
    if (existing > 0) {
      updateCartQty(selectedItem.id, existing + itemQty)
    } else {
      addToCart(selectedItem)
      if (itemQty > 1) updateCartQty(selectedItem.id, itemQty)
    }
    setView('items')
  }

  const handlePlaceOrder = async () => {
    try {
      const result = await placeOrder({ items: cart, specialRequest })
      addActiveOrder(result)
      clearCart()
      setShowCart(false)
      setOrderSuccess(result)
    } catch { /* error shown inline */ }
  }

  // ── States: loading / error / order success ────────────────────────────────
  if (loading) return (
    <div className="flex flex-col min-h-dvh bg-stone-50 dark:bg-stone-950">
      <TopBar title="Restaurant Menu" backRoute={ROUTES.HOME} />
      <Spinner className="flex-1" size={32} />
      <BottomNav />
    </div>
  )

  if (error) return (
    <div className="flex flex-col min-h-dvh bg-stone-50 dark:bg-stone-950">
      <TopBar title="Restaurant Menu" backRoute={ROUTES.HOME} />
      <EmptyState icon={AlertCircle} title="Failed to load menu" description={error} className="flex-1" />
      <BottomNav />
    </div>
  )

  if (orderSuccess) return (
    <div className="flex flex-col min-h-dvh bg-stone-50 dark:bg-stone-950">
      <TopBar title="Order Placed" backRoute={ROUTES.HOME} />
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center pb-24">
        <div className="w-20 h-20 rounded-3xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-5">
          <CheckCircle2 size={40} className="text-emerald-600 dark:text-emerald-400" />
        </div>
        <h2 className="text-xl font-bold text-stone-900 dark:text-stone-100">Order Confirmed!</h2>
        <p className="text-stone-500 dark:text-stone-400 mt-2 text-sm">Order #{orderSuccess.orderId}</p>
        <div className="flex items-center gap-2 mt-4 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800">
          <Clock size={16} className="text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Estimated delivery: <strong>{formatTime(orderSuccess.estimatedDelivery)}</strong>
          </p>
        </div>
        <p className="text-sm text-stone-500 mt-3">
          Total: <strong>{formatPrice(orderSuccess.totalAmount)}</strong>
        </p>
        <p className="text-xs text-stone-400 mt-1">
          Your order has been sent to the hotel team and appears in Management immediately.
        </p>
        <Button className="mt-8" onClick={() => { setOrderSuccess(null); setView('categories') }}>
          Back to Menu
        </Button>
      </div>
      <BottomNav />
    </div>
  )

  // ── View: Detail ───────────────────────────────────────────────────────────
  const tags        = selectedItem ? buildDietaryTags(selectedItem.dietary) : []
  const catColorCls = CAT_COLORS[selectedCatId] ?? CAT_COLORS.mains

  const detailContent = view === 'detail' && selectedItem && (
    <>
      <InnerHeader title={selectedItem.name} onBack={() => setView('items')} />

      <div className="px-4 pt-6 pb-8">
        {/* Hero emoji */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-28 h-28 rounded-3xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-6xl shadow-sm mb-3">
            {selectedItem.emoji}
          </div>
          {selectedItem.special && (
            <span className="inline-flex items-center text-xs font-bold px-3 py-1 rounded-full bg-[#c9a84c]/15 text-[#c9a84c]">
              ★ Chef's Special
            </span>
          )}
        </div>

        {/* Name + price */}
        <div className="flex items-start justify-between gap-3 mb-1">
          <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100 leading-tight">
            {selectedItem.name}
          </h1>
          <p className="text-xl font-bold text-[#1a3a2a] dark:text-[#7ab89a] shrink-0 pt-0.5">
            {formatPrice(selectedItem.price)}
          </p>
        </div>

        {/* Meta: category · prep time */}
        <div className="flex items-center gap-2 text-xs text-stone-400 dark:text-stone-500 mb-5 flex-wrap">
          <span className={`px-2 py-0.5 rounded-full ${catColorCls} font-medium`}>
            {currentCat?.name}
          </span>
          <span>·</span>
          <span className="flex items-center gap-1">
            <Clock size={11} /> {selectedItem.prepTime} min prep
          </span>
          {!selectedItem.available && (
            <>
              <span>·</span>
              <span className="text-red-500 font-medium">Currently unavailable</span>
            </>
          )}
        </div>

        {/* Full description */}
        <div className="bg-white dark:bg-stone-900 rounded-2xl p-4 border border-stone-100 dark:border-stone-800 mb-4">
          <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
            {selectedItem.fullDescription}
          </p>
        </div>

        {/* Dietary */}
        {tags.length > 0 && (
          <div className="bg-white dark:bg-stone-900 rounded-2xl p-4 border border-stone-100 dark:border-stone-800 mb-4">
            <p className="text-[11px] font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wider mb-2.5">
              Dietary
            </p>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => <DietaryTag key={t.label} {...t} />)}
            </div>
          </div>
        )}

        {/* Allergens */}
        <div className="bg-white dark:bg-stone-900 rounded-2xl p-4 border border-stone-100 dark:border-stone-800 mb-6">
          <p className="text-[11px] font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wider mb-2">
            Allergens
          </p>
          {selectedItem.allergens?.length > 0
            ? <p className="text-sm text-stone-600 dark:text-stone-400">{selectedItem.allergens.join(', ')}</p>
            : <p className="text-sm text-emerald-600 dark:text-emerald-400">No major allergens</p>
          }
        </div>

        {/* Add to order */}
        {selectedItem.available && (
          <div className="flex items-center gap-3">
            <QuantitySelector value={itemQty} onChange={setItemQty} min={1} max={10} />
            <Button fullWidth onClick={handleAddToCart}>
              Add to Order · {formatPrice(selectedItem.price * itemQty)}
            </Button>
          </div>
        )}
      </div>
    </>
  )

  // ── View: Items list ───────────────────────────────────────────────────────
  const itemsContent = view === 'items' && currentCat && (
    <>
      <InnerHeader
        title={`${currentCat.emoji} ${currentCat.name}`}
        onBack={() => { setView('categories'); setSearch('') }}
        right={
          <span className="text-[11px] text-stone-400 dark:text-stone-500 shrink-0 pr-1">
            {currentCat.availableFrom}–{currentCat.availableTo}
          </span>
        }
      />

      {/* Sticky search + filters — top-[6.25rem] = TopBar (56px) + InnerHeader (44px) */}
      <div className="sticky top-[6.25rem] z-10 bg-stone-50/95 dark:bg-stone-950/95 backdrop-blur-sm px-4 pt-3 pb-2 border-b border-stone-100/60 dark:border-stone-800/60">
        <div className="relative mb-2">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
          <input
            type="text"
            placeholder={`Search ${currentCat.name.toLowerCase()}…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-2 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#c9a84c]/40"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filter pills */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={[
                'shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors',
                filter === f.id
                  ? 'bg-[#1a3a2a] text-white'
                  : 'bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-500 dark:text-stone-400',
              ].join(' ')}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Item rows */}
      <div className="px-4">
        {filteredItems.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-4xl mb-3">🍽️</p>
            <p className="text-sm font-medium text-stone-500 dark:text-stone-400">
              No items match your filters
            </p>
            <button
              onClick={() => { setSearch(''); setFilter('all') }}
              className="text-xs text-[#c9a84c] mt-2 hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="divide-y divide-stone-100 dark:divide-stone-800/60">
            {filteredItems.map((item) => {
              const qty  = getQty(item.id)
              const tags = buildDietaryTags(item.dietary)
              return (
                <button
                  key={item.id}
                  onClick={() => openItem(item)}
                  className="group w-full flex items-start gap-3 py-4 text-left"
                >
                  {/* Emoji tile */}
                  <div className="w-16 h-16 rounded-xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-3xl shrink-0">
                    {item.emoji}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-semibold text-stone-900 dark:text-stone-100 leading-tight">
                            {item.name}
                          </span>
                          {item.special && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#c9a84c]/10 text-[#c9a84c] shrink-0">
                              ★
                            </span>
                          )}
                          {!item.available && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-400 shrink-0">
                              Unavailable
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5 leading-snug line-clamp-2">
                          {item.shortDescription}
                        </p>
                        {tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {tags.slice(0, 2).map((t) => <DietaryTag key={t.label} {...t} />)}
                          </div>
                        )}
                      </div>

                      <div className="text-right shrink-0 pl-1">
                        <p className="text-sm font-semibold text-[#1a3a2a] dark:text-[#7ab89a]">
                          {formatPrice(item.price)}
                        </p>
                        {qty > 0 && (
                          <p className="text-[10px] font-bold text-[#c9a84c]">{qty} in cart</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <ChevronRight
                    size={15}
                    className="text-stone-300 dark:text-stone-600 mt-1 shrink-0 group-hover:translate-x-0.5 transition-transform"
                  />
                </button>
              )
            })}
          </div>
        )}
      </div>
    </>
  )

  // ── View: Category list ────────────────────────────────────────────────────
  const categoriesContent = view === 'categories' && (
    <div className="px-4 pt-4">
      {/* Global search */}
      <div className="relative mb-5">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Search all dishes & drinks…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-9 py-3 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#c9a84c]/40 shadow-sm"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* Global search results */}
      {search ? (
        <div>
          <p className="text-xs font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wider mb-3">
            {globalResults.length} result{globalResults.length !== 1 ? 's' : ''} for "{search}"
          </p>
          {globalResults.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-3xl mb-3">🔍</p>
              <p className="text-sm text-stone-400 dark:text-stone-500">Nothing found for "{search}"</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 pb-4">
              {globalResults.map((i) => (
                <button
                  key={i.id}
                  onClick={() => openItem(i, i.catId)}
                  className="group flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 hover:border-stone-200 dark:hover:border-stone-700 active:scale-[0.98] transition-all text-left"
                >
                  <div className="w-10 h-10 rounded-lg bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-xl shrink-0">
                    {i.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate">{i.name}</p>
                    <p className="text-xs text-stone-400 dark:text-stone-500">{i.catName} · {formatPrice(i.price)}</p>
                  </div>
                  {i.special && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#c9a84c]/10 text-[#c9a84c] shrink-0">
                      ★
                    </span>
                  )}
                  <ChevronRight
                    size={14}
                    className="text-stone-300 dark:text-stone-600 shrink-0 group-hover:translate-x-0.5 transition-transform"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Category cards */
        <>
          <p className="text-xs font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-widest mb-3">
            Browse by category
          </p>
          <div className="flex flex-col gap-3 pb-4">
            {categories.map((cat) => {
              const colorCls     = CAT_COLORS[cat.id] ?? CAT_COLORS.mains
              const availCount   = cat.items.filter((i) => i.available).length
              const specialCount = cat.items.filter((i) => i.special).length
              return (
                <button
                  key={cat.id}
                  onClick={() => openCategory(cat.id)}
                  className="group flex items-center gap-4 p-4 rounded-2xl bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 shadow-sm hover:shadow-md hover:border-stone-200 dark:hover:border-stone-700 active:scale-[0.98] transition-all duration-150 text-left"
                >
                  <div className={`w-14 h-14 rounded-xl ${colorCls} flex items-center justify-center text-3xl shrink-0`}>
                    {cat.emoji}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-stone-900 dark:text-stone-100">{cat.name}</p>
                    <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">{cat.description}</p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${colorCls}`}>
                        {availCount} items
                      </span>
                      {specialCount > 0 && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#c9a84c]/10 text-[#c9a84c]">
                          {specialCount} special{specialCount > 1 ? 's' : ''}
                        </span>
                      )}
                      <span className="text-[11px] text-stone-400 dark:text-stone-500">
                        {cat.availableFrom}–{cat.availableTo}
                      </span>
                    </div>
                  </div>

                  <ChevronRight
                    size={18}
                    className="text-stone-300 dark:text-stone-600 shrink-0 group-hover:translate-x-0.5 transition-transform"
                  />
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-dvh bg-stone-50 dark:bg-stone-950">
      <TopBar title="Restaurant Menu" backRoute={ROUTES.HOME} showCart />

      <main className="flex-1 overflow-y-auto pb-24">
        {detailContent}
        {itemsContent}
        {categoriesContent}
      </main>

      {/* Floating cart CTA */}
      {cartCount > 0 && (
        <div className="fixed bottom-20 inset-x-0 flex justify-center px-4 z-30 pointer-events-none">
          <button
            onClick={() => setShowCart(true)}
            className="pointer-events-auto flex items-center gap-3 bg-[#1a3a2a] text-white px-5 py-3.5 rounded-2xl shadow-2xl shadow-[#1a3a2a]/40 active:scale-[0.98] transition-transform"
          >
            <ShoppingCart size={18} />
            <span className="font-semibold text-sm">View Order · {formatPrice(cartTotal)}</span>
            <span className="bg-[#c9a84c] text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
              {cartCount}
            </span>
          </button>
        </div>
      )}

      {/* Cart modal */}
      <Modal open={showCart} onClose={() => setShowCart(false)} title="Your Order">
        {cart.length === 0 ? (
          <EmptyState icon={ShoppingCart} title="Cart is empty" />
        ) : (
          <div className="flex flex-col gap-4">
            {cart.map((ci) => (
              <div key={ci.id} className="flex items-center gap-3">
                <span className="text-2xl w-9 text-center shrink-0">{ci.emoji ?? '🍽️'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-stone-900 dark:text-stone-100 truncate">{ci.name}</p>
                  <p className="text-xs text-stone-400">{formatPrice(ci.price)} each</p>
                </div>
                <QuantitySelector
                  size="sm"
                  value={ci.quantity}
                  onChange={(q) => updateCartQty(ci.id, q)}
                />
                <p className="text-sm font-semibold text-[#1a3a2a] dark:text-[#7ab89a] w-16 text-right shrink-0">
                  {formatPrice(ci.price * ci.quantity)}
                </p>
              </div>
            ))}

            <div className="border-t border-stone-100 dark:border-stone-800 pt-3">
              <div className="flex justify-between text-sm font-semibold text-stone-900 dark:text-stone-100">
                <span>Total</span>
                <span>{formatPrice(cartTotal)}</span>
              </div>
              <p className="text-xs text-stone-400 mt-1">
                Sent as a room-service request. Billing is confirmed by the hotel team at checkout where applicable.
              </p>
            </div>

            {orderError && (
              <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
                {orderError}
              </p>
            )}

            <textarea
              placeholder="Special requests (allergies, timing…)"
              rows={2}
              value={specialRequest}
              onChange={(e) => setSpecialRequest(e.target.value)}
              className="w-full rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-sm p-3 resize-none focus:outline-none focus:ring-2 focus:ring-[#c9a84c] text-stone-900 dark:text-stone-100 placeholder:text-stone-400"
            />

            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => { clearCart(); setShowCart(false) }}
                icon={Trash2}
              >
                Clear
              </Button>
              <Button fullWidth loading={ordering} onClick={handlePlaceOrder}>
                Place Order
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <BottomNav />
    </div>
  )
}
