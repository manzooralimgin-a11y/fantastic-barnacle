import React, { useEffect, useRef, useState } from 'react';
import {
  Search,
  MapPin,
  UtensilsCrossed,
  Clock,
  ShoppingBag,
  ChefHat,
  RefreshCcw,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import {
  GOLD_GRADIENT,
  BURGUNDY,
} from './data';
import Logo from './components/Logo';
import BottomDock from './components/Navbar';
import BookingFlow from './pages/BookingFlow';
import { InfoModal } from './components/BookingModal';
import MenuCard from './components/MenuCard';
import {
  apiRequest,
  buildPublicMenuPath,
  buildRestaurantOrderPayload,
  createIdempotencyKey,
  normalizeMenuCategories,
  readRuntimeConfig,
  summarizeOrderStatus,
} from './lib/restaurantClient';

const STORAGE_KEYS = {
  guestName: 'res-web.guest-name',
  tableCode: 'res-web.table-code',
  currentOrder: 'res-web.current-order',
};

function formatCurrency(value) {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(Number(value || 0));
}

function formatMenuStatus(tableContext) {
  if (!tableContext) {
    return 'Live menu connected to the gastronomy backend.';
  }
  return `Live menu scoped to table ${tableContext.table_number} in ${tableContext.section_name}.`;
}

function readStoredOrder() {
  if (typeof window === 'undefined') {
    return null;
  }
  const raw = window.localStorage.getItem(STORAGE_KEYS.currentOrder);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    window.localStorage.removeItem(STORAGE_KEYS.currentOrder);
    return null;
  }
}

function ScreenHome({ setActiveTab }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-full flex flex-col"
    >
      <div className="w-full h-[80vh] md:h-screen relative overflow-hidden border-b border-white/5 mb-4 shadow-[0_20px_50px_rgba(0,0,0,0.8)] md:rounded-b-none flex flex-col">
        <div className="absolute inset-0 z-10 bg-gradient-to-b from-black/80 via-transparent to-transparent h-48 pointer-events-none" />
        <video
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          className="absolute inset-0 w-full h-full object-cover z-0"
        >
          <source src="/daselb-promo.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 z-0 bg-gradient-to-t from-[#000C1D] via-transparent to-[#000C1D]/60" />

        <div className="relative z-30 flex flex-col h-full w-full max-w-[1400px] mx-auto">
          <div className="shrink-0">
            <Logo variant="home" />
          </div>
          <div className="flex-1 flex flex-col items-center justify-end pb-24 md:pb-32 px-8 text-center text-white">
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.8 }}
              className="flex flex-col items-center"
            >
              <h2
                className="text-fluid-h1 font-serif font-black italic tracking-tight mb-6"
                style={{ background: GOLD_GRADIENT, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'contrast(1.3)' }}
              >
                Die Kunst
                <br />
                des Geschmacks
              </h2>
              <div className="w-24 h-[1px] bg-[#FBF5B7]/40 mb-8" />
              <p className="text-white/90 text-[11px] md:text-sm tracking-[0.34em] font-light uppercase mb-12 max-w-sm mx-auto leading-relaxed font-serif">
                Premium Gastronomie & Hotellerie an der Elbe
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <motion.button
                  whileHover={{ scale: 1.05, backgroundColor: 'rgba(255, 255, 255, 0.1)' }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setActiveTab('menu')}
                  className="px-12 py-5 border border-[#BF953F] rounded-full backdrop-blur-md bg-white/5 shadow-2xl transition-all"
                >
                  <span className="text-white text-[11px] md:text-xs font-bold tracking-[0.4em] uppercase font-serif">
                    Zur Speisekarte
                  </span>
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05, backgroundColor: 'rgba(255, 255, 255, 0.08)' }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setActiveTab('bookingflow')}
                  className="px-12 py-5 border border-white/10 rounded-full backdrop-blur-md bg-black/20 shadow-2xl transition-all"
                >
                  <span className="text-white text-[11px] md:text-xs font-bold tracking-[0.4em] uppercase font-serif">
                    Reservieren
                  </span>
                </motion.button>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function ScreenMenu({
  menuCategories,
  loading,
  errorMessage,
  tableContext,
  search,
  setSearch,
  selectedCategory,
  setSelectedCategory,
  cart,
  onAddToCart,
  onIncreaseItem,
  onDecreaseItem,
}) {
  const scrollRef = useRef(null);
  const categories = menuCategories.map((category) => category.name);

  const filteredCategories = menuCategories
    .map((category) => ({
      ...category,
      items: category.items.filter((item) => {
        const matchesCategory = !selectedCategory || category.name === selectedCategory;
        const query = search.trim().toLowerCase();
        const matchesSearch =
          !query ||
          item.name.toLowerCase().includes(query) ||
          String(item.description || '').toLowerCase().includes(query);
        return matchesCategory && matchesSearch;
      }),
    }))
    .filter((category) => category.items.length > 0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    el.style.scrollSnapType = 'none';
    el.style.overflow = 'hidden';
    el.scrollLeft = 0;
    requestAnimationFrame(() => {
      el.style.scrollSnapType = 'x mandatory';
      el.style.overflow = '';
    });
  }, [selectedCategory]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-full flex flex-col pt-[env(safe-area-inset-top)]"
    >
      <Logo variant="minimized" />
      <div className="px-4 mt-4 mb-4 shrink-0 z-20">
        <div className="px-4 py-3 rounded-3xl bg-white/5 border border-white/10 text-white/60 text-xs mb-4">
          {errorMessage || formatMenuStatus(tableContext)}
        </div>
        <div className="px-4 mb-4">
          <div className="rounded-3xl border border-white/10 bg-white/5 px-4 py-3 flex items-center gap-3">
            <Search size={16} className="text-white/30" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Gerichte suchen"
              className="w-full bg-transparent text-sm text-white placeholder:text-white/20 outline-none"
            />
          </div>
        </div>
        <div className="flex gap-4 overflow-x-auto no-scrollbar py-2 px-4">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat === selectedCategory ? '' : cat)}
              className={`whitespace-nowrap px-6 py-2 rounded-full border text-[11px] font-bold tracking-[0.3em] transition-all uppercase ${
                selectedCategory === cat
                  ? 'border-[#BF953F] bg-white/10 text-white'
                  : 'border-white/10 text-white/30 bg-white/5'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="no-scrollbar flex-1 overflow-x-auto md:overflow-y-auto flex md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 items-start gap-5 md:gap-8 p-6 md:p-12 pb-32 md:pb-28 max-w-[1600px] mx-auto w-full md:scroll-snap-none"
        style={{
          scrollSnapType: 'x mandatory',
          scrollBehavior: 'smooth',
          scrollbarWidth: 'none',
        }}
      >
        {loading ? (
          <div className="w-full md:col-span-2 xl:col-span-4 rounded-[2rem] border border-white/10 bg-white/5 p-8 text-white/60">
            Live gastronomic menu is loading from the backend.
          </div>
        ) : null}
        {!loading && filteredCategories.length === 0 ? (
          <div className="w-full md:col-span-2 xl:col-span-4 rounded-[2rem] border border-white/10 bg-white/5 p-8 text-white/60">
            No live menu items are available for the current filter.
          </div>
        ) : null}
        {!loading
          ? filteredCategories.flatMap((category) =>
              category.items.map((item, index) => {
                const cartEntry = cart.find((entry) => entry.menu_item_id === item.id);
                return (
                  <MenuCard
                    key={`${category.id}-${item.id}`}
                    item={item}
                    idx={index}
                    quantity={cartEntry?.quantity || 0}
                    onAdd={onAddToCart}
                    onIncrease={onIncreaseItem}
                    onDecrease={onDecreaseItem}
                  />
                );
              }),
            )
          : null}
      </div>
    </motion.div>
  );
}

function ScreenOrder({
  config,
  guestName,
  setGuestName,
  tableCode,
  setTableCode,
  tableContext,
  tableLoading,
  tableMessage,
  onLoadTableContext,
  cart,
  onIncreaseItem,
  onDecreaseItem,
  orderNotes,
  setOrderNotes,
  onSubmitOrder,
  submittingOrder,
  orderMessage,
  currentOrder,
  orderStatus,
  trackerMessage,
  onRefreshOrderStatus,
  refreshingOrderStatus,
}) {
  const total = cart.reduce((sum, item) => sum + Number(item.unit_price || 0) * Number(item.quantity || 0), 0);
  const publicStatus = orderStatus || (currentOrder ? { order_id: currentOrder.order_id, status: currentOrder.status, items: [] } : null);
  const summary = summarizeOrderStatus(publicStatus);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-full flex flex-col pt-[env(safe-area-inset-top)] overflow-y-auto pb-32"
    >
      <Logo variant="minimized" />
      <div className="px-6 mt-4 max-w-5xl mx-auto w-full grid gap-5 md:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
          <div className="flex items-center gap-3 mb-4">
            <MapPin className="text-[#FBF5B7]" size={18} />
            <h3 className="text-white font-bold text-lg tracking-tight">Table / Guest Context</h3>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-[10px] uppercase tracking-[0.3em] text-white/30">Guest Name</span>
              <input
                id="guest-name"
                value={guestName}
                onChange={(event) => setGuestName(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-[#BF953F]/60"
                placeholder="Guest name"
              />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-[0.3em] text-white/30">Table / QR Code</span>
              <div className="mt-2 flex gap-3">
                <input
                  id="table-code"
                  value={tableCode}
                  onChange={(event) => setTableCode(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-[#BF953F]/60"
                  placeholder="Paste table code"
                />
                <button
                  id="load-table"
                  type="button"
                  onClick={() => onLoadTableContext()}
                  disabled={tableLoading}
                  className="shrink-0 rounded-2xl border border-[#BF953F]/40 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.3em] text-white disabled:opacity-40"
                >
                  {tableLoading ? '...' : 'Load'}
                </button>
              </div>
            </label>
          </div>
          <div
            id="table-summary"
            className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/70"
          >
            {tableContext ? (
              <div className="flex flex-col gap-1">
                <strong className="text-white">Table {tableContext.table_number}</strong>
                <span>{tableContext.section_name} · capacity {tableContext.capacity}</span>
              </div>
            ) : (
              <strong className="text-white/60">No live table context loaded.</strong>
            )}
          </div>
          <p id="table-message" className="mt-3 text-sm text-white/50">
            {tableMessage || 'Load a table/QR code to send guest orders into the waiter and kitchen flow.'}
          </p>
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
          <div className="flex items-center gap-3 mb-4">
            <ShoppingBag className="text-[#FBF5B7]" size={18} />
            <h3 className="text-white font-bold text-lg tracking-tight">Live Cart</h3>
          </div>
          <div id="cart-items" className="space-y-3">
            {cart.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-5 text-sm text-white/50">
                Browse the menu and add dishes to build a live table order.
              </div>
            ) : (
              cart.map((item) => (
                <div key={item.menu_item_id} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 flex items-center justify-between gap-4">
                  <div>
                    <strong className="block text-white">{item.name}</strong>
                    <span className="text-white/40 text-xs">{formatCurrency(item.unit_price)} each</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      data-cart-action="decrease"
                      data-item-id={item.menu_item_id}
                      onClick={() => onDecreaseItem(item)}
                      className="h-8 w-8 rounded-full border border-white/10 text-white"
                    >
                      -
                    </button>
                    <span className="min-w-6 text-center text-white font-bold">{item.quantity}</span>
                    <button
                      type="button"
                      data-cart-action="increase"
                      data-item-id={item.menu_item_id}
                      onClick={() => onIncreaseItem(item)}
                      className="h-8 w-8 rounded-full border border-white/10 text-white"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          <label className="block mt-4">
            <span className="text-[10px] uppercase tracking-[0.3em] text-white/30">Order Notes</span>
            <textarea
              id="order-notes"
              value={orderNotes}
              onChange={(event) => setOrderNotes(event.target.value)}
              rows={3}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-[#BF953F]/60"
              placeholder="Allergies, pacing, special requests"
            />
          </label>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-white/40 text-xs uppercase tracking-[0.3em]">Cart Total</span>
            <strong id="cart-total" className="text-[#FBF5B7] text-xl font-serif">{formatCurrency(total)}</strong>
          </div>
          <button
            id="submit-order"
            type="button"
            onClick={onSubmitOrder}
            disabled={submittingOrder || cart.length === 0 || !tableContext}
            className="mt-4 w-full rounded-2xl px-5 py-4 text-[11px] font-black uppercase tracking-[0.35em] text-black disabled:bg-white/10 disabled:text-white/20"
            style={{ background: cart.length === 0 || !tableContext ? undefined : GOLD_GRADIENT }}
          >
            {submittingOrder ? 'Submitting…' : 'Send Live Order'}
          </button>
          <p id="order-message" className="mt-3 text-sm text-white/60">{orderMessage || 'Orders go into the backend waiter flow first, then into kitchen handling.'}</p>
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-white/5 p-6 md:col-span-2">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <ChefHat className="text-[#FBF5B7]" size={18} />
              <h3 className="text-white font-bold text-lg tracking-tight">Order Status / Service Flow</h3>
            </div>
            <button
              id="refresh-order-status"
              type="button"
              onClick={onRefreshOrderStatus}
              disabled={!currentOrder || refreshingOrderStatus}
              className="rounded-full border border-white/10 p-3 text-white/60 disabled:opacity-40"
            >
              <RefreshCcw size={16} />
            </button>
          </div>
          <p id="tracker-message" className="mb-4 text-sm text-white/50">
            {trackerMessage || 'Track the guest order here after submission. Waiter and kitchen views read the same backend order.'}
          </p>
          <div id="order-tracker" className="space-y-4">
            {!currentOrder ? (
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-5 text-sm text-white/50">
                Place a live order to track waiter and kitchen status here.
              </div>
            ) : (
              <>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.3em] text-white/30">Current Order</p>
                    <h3 className="text-white text-2xl font-serif">#{publicStatus?.order_id}</h3>
                    <p className="text-white/50 text-sm">{currentOrder.message || 'Guest order created successfully.'}</p>
                  </div>
                  <div className="rounded-full border border-[#BF953F]/30 bg-[#BF953F]/10 px-4 py-2 text-[10px] uppercase tracking-[0.3em] text-[#FBF5B7]">
                    {publicStatus?.status || currentOrder.status}
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    ['Pending', summary.pending],
                    ['Preparing', summary.preparing],
                    ['Ready', summary.ready],
                    ['Served', summary.served],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-center">
                      <div className="text-white text-xl font-serif">{value}</div>
                      <div className="text-[10px] uppercase tracking-[0.3em] text-white/30">{label}</div>
                    </div>
                  ))}
                </div>
                <div className="space-y-3">
                  {(publicStatus?.items || []).length > 0 ? (
                    publicStatus.items.map((item, index) => (
                      <div key={`${item.menu_item_id}-${index}`} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 flex items-center justify-between gap-4">
                        <span className="text-white">{item.quantity}× item #{item.menu_item_id}</span>
                        <strong className="text-[#FBF5B7] text-xs uppercase tracking-[0.25em]">{item.status}</strong>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-5 text-sm text-white/50">
                      Status detail becomes richer as waiter and kitchen actions update the backend order.
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </motion.div>
  );
}

export default function App() {
  const [config] = useState(() =>
    readRuntimeConfig(typeof window === 'undefined' ? {} : window, import.meta.env),
  );
  const [activeTab, setActiveTab] = useState('home');
  const [showInfo, setShowInfo] = useState(false);
  const [guestName, setGuestName] = useState(() =>
    typeof window === 'undefined' ? '' : window.localStorage.getItem(STORAGE_KEYS.guestName) || '',
  );
  const [tableCode, setTableCode] = useState(() =>
    typeof window === 'undefined'
      ? config.defaultTableCode || ''
      : config.defaultTableCode || window.localStorage.getItem(STORAGE_KEYS.tableCode) || '',
  );
  const [tableContext, setTableContext] = useState(null);
  const [tableLoading, setTableLoading] = useState(false);
  const [tableMessage, setTableMessage] = useState('');
  const [menuCategories, setMenuCategories] = useState([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuError, setMenuError] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [orderNotes, setOrderNotes] = useState('');
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [orderMessage, setOrderMessage] = useState('');
  const [currentOrder, setCurrentOrder] = useState(() => readStoredOrder());
  const [orderStatus, setOrderStatus] = useState(null);
  const [trackerMessage, setTrackerMessage] = useState('');
  const [refreshingOrderStatus, setRefreshingOrderStatus] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.guestName, guestName);
  }, [guestName]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.tableCode, tableCode);
  }, [tableCode]);

  useEffect(() => {
    if (currentOrder) {
      window.localStorage.setItem(STORAGE_KEYS.currentOrder, JSON.stringify(currentOrder));
      return;
    }
    window.localStorage.removeItem(STORAGE_KEYS.currentOrder);
  }, [currentOrder]);

  async function loadPublicMenu(code = '') {
    setMenuLoading(true);
    setMenuError('');
    try {
      if (code) {
        const data = await apiRequest(config, `/qr/menu/${encodeURIComponent(code)}`, {
          cache: 'no-store',
        });
        const categories = normalizeMenuCategories(data.categories || []);
        setMenuCategories(categories);
        setTableContext(data.table || null);
        setSelectedCategory((current) => current || categories[0]?.name || '');
        setMenuError('');
        setTableMessage('Table context connected. Orders will route into the gastronomy service and waiter queue.');
        return true;
      }

      const data = await apiRequest(config, buildPublicMenuPath(config), {
        cache: 'no-store',
      });
      const categories = normalizeMenuCategories(data.categories || []);
      setMenuCategories(categories);
      setSelectedCategory((current) => current || categories[0]?.name || '');
      setMenuError('');
      return true;
    } catch (error) {
      if (code) {
        setTableContext(null);
        setTableMessage(error.message);
      }
      setMenuCategories([]);
      setMenuError(error.message);
      return false;
    } finally {
      setMenuLoading(false);
    }
  }

  async function loadTableContext(codeOverride = '') {
    const liveCode = String(codeOverride || tableCode).trim();
    if (!liveCode) {
      setTableMessage('Enter a table or QR code first.');
      return;
    }

    setTableLoading(true);
    const connected = await loadPublicMenu(liveCode);
    if (connected) {
      setTableCode(liveCode);
    } else {
      await loadPublicMenu('');
    }
    setTableLoading(false);
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (config.defaultTableCode) {
        setTableLoading(true);
        try {
          const data = await apiRequest(config, `/qr/menu/${encodeURIComponent(config.defaultTableCode)}`, {
            cache: 'no-store',
          });
          if (cancelled) {
            return;
          }
          const categories = normalizeMenuCategories(data.categories || []);
          setMenuCategories(categories);
          setTableContext(data.table || null);
          setSelectedCategory(categories[0]?.name || '');
          setTableMessage('Table context connected. Orders will route into the gastronomy service and waiter queue.');
        } catch (error) {
          if (cancelled) {
            return;
          }
          setMenuError(error.message);
          await loadPublicMenu('');
        } finally {
          if (!cancelled) {
            setTableLoading(false);
          }
        }
        return;
      }
      await loadPublicMenu('');
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [config.apiBaseUrl, config.defaultTableCode]);

  useEffect(() => {
    if (!menuCategories.length) {
      return;
    }
    const names = menuCategories.map((category) => category.name);
    if (!selectedCategory || !names.includes(selectedCategory)) {
      setSelectedCategory(names[0]);
    }
  }, [menuCategories, selectedCategory]);

  useEffect(() => {
    if (!menuCategories.length) {
      return;
    }
    const validItemIds = new Set(
      menuCategories.flatMap((category) => category.items.map((item) => item.id)),
    );
    setCart((current) => {
      const next = current.filter((entry) => validItemIds.has(entry.menu_item_id));
      if (next.length !== current.length) {
        setOrderMessage('Cart refreshed to match the current live menu for this table.');
      }
      return next;
    });
  }, [menuCategories]);

  async function refreshOrderStatus() {
    if (!currentOrder?.order_id) {
      return;
    }

    setRefreshingOrderStatus(true);
    try {
      const status = await apiRequest(config, `/qr/order/${currentOrder.order_id}/status`);
      setOrderStatus(status);
      setTrackerMessage('Order status synced from the live backend.');
    } catch (error) {
      setTrackerMessage(error.message);
    } finally {
      setRefreshingOrderStatus(false);
    }
  }

  useEffect(() => {
    if (!currentOrder?.order_id) {
      return undefined;
    }

    void refreshOrderStatus();
    const handle = window.setInterval(() => {
      void refreshOrderStatus();
    }, 10000);

    return () => {
      window.clearInterval(handle);
    };
  }, [currentOrder?.order_id]);

  function changeCart(item, delta) {
    const menuItem = menuCategories
      .flatMap((category) => category.items)
      .find((entry) => entry.id === item.id || entry.id === item.menu_item_id);

    if (!menuItem) {
      return;
    }

    setCart((current) => {
      const existing = current.find((entry) => entry.menu_item_id === menuItem.id);
      if (!existing && delta > 0) {
        return [
          ...current,
          {
            menu_item_id: menuItem.id,
            name: menuItem.name,
            unit_price: Number(menuItem.price || 0),
            quantity: delta,
            notes: null,
          },
        ];
      }

      return current
        .map((entry) =>
          entry.menu_item_id === menuItem.id
            ? { ...entry, quantity: entry.quantity + delta }
            : entry,
        )
        .filter((entry) => entry.quantity > 0);
    });
  }

  async function submitOrder() {
    setSubmittingOrder(true);
    setOrderMessage('');
    try {
      const payload = buildRestaurantOrderPayload({
        tableCode,
        guestName,
        notes: orderNotes,
        items: cart,
      });
      const data = await apiRequest(config, '/public/restaurant/order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      setCurrentOrder(data);
      setOrderStatus(null);
      setCart([]);
      setOrderNotes('');
      setActiveTab('search');
      setOrderMessage(`Order #${data.order_id} created. Waiter flow can see it immediately and kitchen picks it up after service handoff.`);
    } catch (error) {
      setOrderMessage(error.message);
    } finally {
      setSubmittingOrder(false);
    }
  }

  const totalCartItems = cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

  return (
    <div className="fixed inset-0 w-screen h-[100dvh] overflow-hidden bg-navy-900 font-sans">
      <div className="sr-only">
        <span id="api-url">{config.apiBaseUrl}</span>
        <span id="restaurant-id">{config.restaurantId ? String(config.restaurantId) : 'missing'}</span>
      </div>
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[10%] -left-[5%] w-[70%] h-[70%] bg-[#000C1D] rounded-full blur-[140px] opacity-[0.2]" />
        <div className="absolute bottom-[10%] -right-[5%] w-[60%] h-[60%] bg-[#800020] rounded-full blur-[180px] opacity-[0.2]" />
      </div>

      <div className="relative z-10 w-full h-full flex flex-col justify-between pb-[env(safe-area-inset-bottom)]">
        <AnimatePresence mode="wait">
          {activeTab === 'home' ? <ScreenHome key="home" setActiveTab={setActiveTab} /> : null}
          {activeTab === 'menu' ? (
            <ScreenMenu
              key="menu"
              menuCategories={menuCategories}
              loading={menuLoading}
              errorMessage={menuError}
              tableContext={tableContext}
              search={search}
              setSearch={setSearch}
              selectedCategory={selectedCategory}
              setSelectedCategory={setSelectedCategory}
              cart={cart}
              onAddToCart={(item) => changeCart(item, 1)}
              onIncreaseItem={(item) => changeCart(item, 1)}
              onDecreaseItem={(item) => changeCart(item, -1)}
            />
          ) : null}
          {activeTab === 'search' ? (
            <ScreenOrder
              key="search"
              config={config}
              guestName={guestName}
              setGuestName={setGuestName}
              tableCode={tableCode}
              setTableCode={setTableCode}
              tableContext={tableContext}
              tableLoading={tableLoading}
              tableMessage={tableMessage}
              onLoadTableContext={loadTableContext}
              cart={cart}
              onIncreaseItem={(item) => changeCart(item, 1)}
              onDecreaseItem={(item) => changeCart(item, -1)}
              orderNotes={orderNotes}
              setOrderNotes={setOrderNotes}
              onSubmitOrder={submitOrder}
              submittingOrder={submittingOrder}
              orderMessage={orderMessage}
              currentOrder={currentOrder}
              orderStatus={orderStatus}
              trackerMessage={trackerMessage}
              onRefreshOrderStatus={refreshOrderStatus}
              refreshingOrderStatus={refreshingOrderStatus}
            />
          ) : null}
          {activeTab === 'bookingflow' ? (
            <BookingFlow
              key="bookingflow"
              config={config}
              defaultGuestName={guestName}
              onGuestNameChange={setGuestName}
              onReservationCreated={() => {
                setActiveTab('search');
              }}
              onClose={() => setActiveTab('home')}
            />
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {showInfo ? <InfoModal onClose={() => setShowInfo(false)} /> : null}
        </AnimatePresence>

        {activeTab !== 'bookingflow' && (totalCartItems > 0 || currentOrder) ? (
          <div className="fixed bottom-28 left-1/2 z-40 -translate-x-1/2 w-[92%] sm:w-auto">
            <button
              type="button"
              onClick={() => setActiveTab('search')}
              className="w-full rounded-full border border-[#BF953F]/30 bg-black/50 px-5 py-3 text-left text-white shadow-2xl backdrop-blur-2xl sm:min-w-[420px]"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.3em] text-white/30">Live Order Flow</div>
                  <div className="text-sm">
                    {totalCartItems > 0
                      ? `${totalCartItems} item${totalCartItems === 1 ? '' : 's'} ready for waiter queue`
                      : `Order #${currentOrder?.order_id} is active`}
                  </div>
                </div>
                <div className="rounded-full bg-[#BF953F]/15 px-4 py-2 text-[10px] uppercase tracking-[0.3em] text-[#FBF5B7]">
                  Open
                </div>
              </div>
            </button>
          </div>
        ) : null}

        {activeTab !== 'bookingflow' ? (
          <BottomDock
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            onOpenInfo={() => setShowInfo(true)}
          />
        ) : null}
      </div>

      {activeTab !== 'bookingflow' ? (
        <div className="fixed bottom-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-white/10 rounded-full z-[60] pointer-events-none mb-[env(safe-area-inset-bottom)]" />
      ) : null}
    </div>
  );
}
