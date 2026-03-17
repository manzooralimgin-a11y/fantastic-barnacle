import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import {
  Search,
  MapPin,
  UtensilsCrossed,
  ChevronRight,
  Clock,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Modular Imports
import {
  NAVY_BG,
  GOLD_GRADIENT,
  BURGUNDY,
  HOME_HERO_IMAGE,
  MENU_DATA
} from './data';
import Logo from './components/Logo';
import BottomDock from './components/Navbar';
import BookingFlow from './pages/BookingFlow';
import { InfoModal, GuestSelectorModal } from './components/BookingModal';
import MenuCard from './components/MenuCard';
import { fetchMenu, getTableInfo, submitOrder } from './lib/api';

// --- Screen Components ---

const ScreenHome = ({ setActiveTab }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="h-full flex flex-col"
  >
    <div className="w-full h-[80vh] md:h-[88vh] relative overflow-hidden border-b border-white/5 mb-4 shadow-[0_20px_50px_rgba(0,0,0,0.8)] rounded-b-[50px] md:rounded-b-[80px] flex flex-col">
      <div className="absolute inset-0 z-10 bg-gradient-to-b from-black/80 via-transparent to-transparent h-48 pointer-events-none" />
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover z-0"
      >
        <source src="/daselb-promo.mp4" type="video/mp4" />
      </video>
      <div className="absolute inset-0 z-0 bg-gradient-to-t from-[#000C1D] via-transparent to-[#000C1D]/60" />

      <div className="relative z-30 flex flex-col h-full w-full">
        <div className="shrink-0">
          <Logo variant="home" />
        </div>
        <div className="flex-1 flex flex-col items-center justify-end pb-20 px-8 text-center text-white">
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.8 }}
            className="flex flex-col items-center"
          >
            <h2 className="text-5xl md:text-6xl font-serif font-black italic tracking-tight leading-[0.95] mb-4 mt-[8vh]"
              style={{ background: GOLD_GRADIENT, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'contrast(1.3)' }}>
              Die Kunst<br />des Geschmacks
            </h2>
            <div className="w-24 h-[1px] bg-[#FBF5B7]/40 mb-6" />
            <p className="text-white/90 text-[13px] tracking-[0.2em] font-light uppercase mb-10 max-w-xs mx-auto leading-relaxed font-serif">
              Das Elb Hotel und Restaurant in Magdeburg
            </p>
            <motion.button
              whileHover={{ scale: 1.05, backgroundColor: 'rgba(255, 255, 255, 0.1)' }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setActiveTab('menu')}
              className="px-10 py-4 border border-[#BF953F] rounded-full backdrop-blur-md bg-white/5 shadow-2xl transition-all"
            >
              <span className="text-white text-[12px] font-bold tracking-[0.3em] uppercase font-serif">
                Zur Speisekarte
              </span>
            </motion.button>
          </motion.div>
        </div>
      </div>
    </div>
  </motion.div>
);

const ScreenMenu = ({ menuData, cart, addToCart }) => {
  const [activeCategory, setActiveCategory] = useState("");
  const categories = menuData.map(c => c.name);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (categories.length > 0 && !activeCategory) {
      setActiveCategory(categories[0]);
    }
  }, [categories, activeCategory]);

  const activeItems = menuData.find(c => c.name === activeCategory)?.items || [];

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.style.scrollSnapType = 'none';
      el.style.overflow = 'hidden';
      el.scrollLeft = 0;
      requestAnimationFrame(() => {
        el.style.scrollSnapType = 'x mandatory';
        el.style.overflow = '';
      });
    }
  }, [activeCategory]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-full flex flex-col pt-[env(safe-area-inset-top)]"
    >
      <Logo variant="minimized" />
      <div className="px-4 mt-4 mb-4 shrink-0 z-20">
        <div className="flex gap-4 overflow-x-auto no-scrollbar py-2 px-4">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`whitespace-nowrap px-6 py-2 rounded-full border text-[11px] font-bold tracking-[0.3em] transition-all uppercase ${activeCategory === cat
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
        className="no-scrollbar flex-1 overflow-x-auto flex flex-row items-start"
        style={{
          scrollSnapType: 'x mandatory',
          scrollBehavior: 'smooth',
          gap: '20px',
          padding: '24px 20px 100px 20px',
          width: '100%',
          scrollbarWidth: 'none',
        }}
      >
        {activeItems.map((item, index) => (
          <MenuCard 
            key={item.id} 
            item={{
              ...item,
              img: item.image_url || "https://images.unsplash.com/photo-1546173159-315724a31696?q=80&w=800",
              desc: item.description
            }} 
            idx={index} 
            addToCart={addToCart}
          />
        ))}
        <div style={{ minWidth: '20px', flexShrink: 0 }} />
      </div>
    </motion.div>
  );
};

const ScreenCart = ({ cart, tableInfo, onSubmit, setActiveTab }) => {
  const total = cart.reduce((sum, item) => sum + (item.price || 0), 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="h-full flex flex-col pt-[env(safe-area-inset-top)] px-8 pb-32 overflow-y-auto"
    >
      <Logo variant="minimized" />
      <div className="mt-8 mb-6">
        <h3 className="text-white font-serif text-3xl font-bold tracking-tight mb-1">Deine Bestellung</h3>
        <p className="text-gold text-[10px] font-bold uppercase tracking-[0.3em]">
          {tableInfo ? `Tisch ${tableInfo.table_number} • ${tableInfo.section_name}` : "Kein Tisch gewählt"}
        </p>
      </div>

      <div className="space-y-4 flex-1">
        {cart.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-white/20 text-sm italic">Dein Warenkorb ist leer</p>
            <button 
              onClick={() => setActiveTab('menu')}
              className="mt-4 text-gold text-xs font-bold uppercase tracking-widest"
            >
              Zur Speisekarte
            </button>
          </div>
        ) : (
          <>
            {cart.map((item, i) => (
              <div key={i} className="flex justify-between items-center py-4 border-b border-white/5">
                <div className="flex gap-4 items-center">
                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-white/5">
                    <img src={item.img} className="w-full h-full object-cover" alt="" />
                  </div>
                  <div>
                    <p className="text-white font-bold text-sm">{item.name}</p>
                    <p className="text-white/40 text-[10px]">{item.category_name}</p>
                  </div>
                </div>
                <p className="text-gold font-serif font-bold">€{Number(item.price).toFixed(2)}</p>
              </div>
            ))}
            
            <div className="mt-8 pt-6 border-t border-white/10">
              <div className="flex justify-between items-end mb-8">
                <span className="text-white/40 text-[10px] uppercase font-bold tracking-widest">Gesamtbetrag</span>
                <span className="text-white text-3xl font-serif font-bold italic">€{total.toFixed(2)}</span>
              </div>

              <button
                disabled={!tableInfo || cart.length === 0}
                onClick={onSubmit}
                className={`w-full py-5 rounded-2xl text-[12px] font-black tracking-[0.3em] uppercase transition-all shadow-2xl ${
                  tableInfo && cart.length > 0 
                  ? 'bg-gold text-navy-900 shadow-gold/20' 
                  : 'bg-white/5 text-white/20 shadow-none'
                }`}
              >
                Bestellung Aufgeben
              </button>
              {!tableInfo && (
                <p className="mt-4 text-center text-burgundy text-[10px] font-bold uppercase tracking-widest">
                  Bitte scanne einen QR-Code am Tisch
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
};

const ScreenBooking = () => {
  const [selected, setSelected] = useState(null);
  const [guests, setGuests] = useState(2);
  const [showGuestModal, setShowGuestModal] = useState(false);
  const defaultDate = new Date();
  defaultDate.setHours(20, 0, 0, 0);
  const [bookingDate, setBookingDate] = useState(defaultDate.toISOString().slice(0, 16));

  const tables = [
    { id: 1, pos: [60, 40], type: 'booth' },
    { id: 2, pos: [30, 80], occupied: true },
    { id: 3, pos: [100, 110], type: 'booth' },
    { id: 4, pos: [140, 60], type: 'table' },
    { id: 5, pos: [180, 100], occupied: true },
    { id: 6, pos: [210, 30], type: 'booth' },
  ];

  const getFormattedDate = (isoString) => {
    const date = new Date(isoString);
    const today = new Date();
    const isToday = date.getDate() === today.getDate() && date.getMonth() === today.getMonth();
    const timeStr = date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    if (isToday) return `Heute, ${timeStr}`;
    return `${date.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })}, ${timeStr}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-full flex flex-col pt-[env(safe-area-inset-top)] overflow-y-auto"
      style={{ paddingBottom: '150px' }}
    >
      <Logo variant="minimized" />
      <div className="px-8 mt-4 max-w-2xl mx-auto w-full relative z-20">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-white font-bold text-xl tracking-tight">Reservierung</h3>
          <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40"><MapPin size={14} /></div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-8">
          <div className="relative bg-white/5 border border-white/10 rounded-3xl overflow-hidden group p-4">
            <input
              type="datetime-local"
              value={bookingDate}
              onChange={(e) => setBookingDate(e.target.value)}
              className="absolute inset-0 w-full h-full opacity-0 z-20 cursor-pointer text-white bg-transparent"
              style={{ colorScheme: 'dark' }}
            />
            <div className="relative z-10 pointer-events-none">
              <p className="text-white/40 text-[9px] uppercase tracking-widest mb-1">Datum</p>
              <p className="text-white text-xs font-bold truncate">{getFormattedDate(bookingDate)}</p>
            </div>
          </div>
          <button
            onClick={() => setShowGuestModal(true)}
            className="bg-white/5 border border-white/10 p-4 rounded-3xl text-left relative group active:scale-95 transition-transform"
          >
            <p className="text-white/40 text-[9px] uppercase tracking-widest mb-1">Personen</p>
            <p className="text-white text-xs font-bold">{guests} {guests === 1 ? 'Person' : 'Personen'}</p>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showGuestModal && (
          <GuestSelectorModal
            guests={guests}
            setGuests={setGuests}
            onClose={() => setShowGuestModal(false)}
          />
        )}
      </AnimatePresence>

      <motion.div
        className="flex-1 bg-white/5 backdrop-blur-3xl border-t border-white/10 rounded-t-[50px] relative overflow-hidden p-8"
        initial={{ y: 200 }} animate={{ y: 0 }}
      >
        <div className="absolute top-0 left-0 right-0 h-1" style={{ background: `linear-gradient(90deg, transparent, ${BURGUNDY}, transparent)` }} />
        <h3 className="text-[10px] font-black tracking-[0.4em] mb-10 text-center opacity-70" style={{ color: '#FBF5B7' }}>ZONE WÄHLEN</h3>

        <div className="relative h-64 flex items-center justify-center">
          <div className="w-full h-full relative" style={{ transform: 'rotateX(55deg) rotateZ(-25deg)', transformStyle: 'preserve-3d' }}>
            {tables.map((table) => (
              <motion.div
                key={table.id}
                onClick={() => !table.occupied && setSelected(table.id)}
                style={{
                  left: table.pos[0], top: table.pos[1],
                  backgroundColor: table.occupied ? '#001B3D' : (selected === table.id ? '#FBF5B7' : 'rgba(251, 245, 183, 0.15)'),
                }}
                className={`absolute w-10 h-10 rounded-xl cursor-pointer flex items-center justify-center border transition-colors ${table.occupied ? 'border-white/5' : 'border-[#FBF5B7]/30'}`}
              >
                <UtensilsCrossed size={14} className={table.occupied ? "text-white/5" : (selected === table.id ? "text-black" : "text-white/40")} />
              </motion.div>
            ))}
          </div>
        </div>

        <div className="mt-8 space-y-4">
          <div className="flex justify-between items-center px-4">
            <span className="text-white/40 text-[10px] uppercase tracking-widest font-mono">
              Auswahl: <span className="text-white font-bold ml-1">{selected ? `Tisch #${selected}` : '--'}</span>
            </span>
          </div>
          <button
            disabled={!selected}
            className={`w-full py-5 rounded-2xl text-[12px] font-black tracking-[0.3em] uppercase transition-all ${selected ? 'bg-burgundy text-white' : 'bg-white/5 text-white/20'}`}
          >
            Platz Bestätigen
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [showInfo, setShowInfo] = useState(false);
  const [menuData, setMenuData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState([]);
  const [tableInfo, setTableInfo] = useState(null);

  useEffect(() => {
    async function init() {
      const data = await fetchMenu();
      if (data) setMenuData(data);
      setLoading(false);

      // Check for table code in URL
      const params = new URLSearchParams(window.location.search);
      const code = params.get('table');
      if (code) {
        const info = await getTableInfo(code);
        if (info) setTableInfo({ ...info, code });
      }
    }
    init();
  }, []);

  const addToCart = (item) => {
    setCart(prev => [...prev, item]);
    // Optional: auto-switch to cart or show notification?
  };

  const submitOrderHandler = async () => {
    if (!tableInfo || cart.length === 0) return;
    
    const payload = {
        restaurant_id: 1, // Default for ELB
        table_number: tableInfo.table_number,
        items: cart.map(item => ({
            menu_item_id: item.id,
            quantity: 1,
            notes: ""
        })),
        order_type: "dine_in"
    };

    try {
        const data = await submitOrder(payload);
        if (!data) throw new Error("Order failed");
        alert("Bestellung erfolgreich aufgegeben!");
        setCart([]);
        setActiveTab('home');
    } catch (err) {
        alert("Fehler bei der Bestellung: " + err.message);
    }
  };

  return (
    <div className="fixed inset-0 w-screen h-[100dvh] overflow-hidden bg-navy-900 font-sans">
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[10%] -left-[5%] w-[70%] h-[70%] bg-[#000C1D] rounded-full blur-[140px] opacity-[0.2]" />
        <div className="absolute bottom-[10%] -right-[5%] w-[60%] h-[60%] bg-[#800020] rounded-full blur-[180px] opacity-[0.2]" />
      </div>

      <div className="relative z-10 w-full h-full flex flex-col justify-between pb-[env(safe-area-inset-bottom)]">
        <AnimatePresence mode="wait">
          {activeTab === 'home' && <ScreenHome key="home" setActiveTab={setActiveTab} />}
          {activeTab === 'menu' && <ScreenMenu key="menu" menuData={menuData} cart={cart} addToCart={addToCart} />}
          {activeTab === 'booking' && <ScreenBooking key="booking" />}
          {activeTab === 'search' && <ScreenMenu key="search" menuData={menuData} cart={cart} addToCart={addToCart} />}
          {activeTab === 'bookingflow' && <BookingFlow key="bookingflow" />}
          {activeTab === 'cart' && <ScreenCart key="cart" cart={cart} tableInfo={tableInfo} onSubmit={submitOrderHandler} setActiveTab={setActiveTab} />}
        </AnimatePresence>

        <AnimatePresence>
          {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}
        </AnimatePresence>

        <BottomDock
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onOpenInfo={() => setShowInfo(true)}
          cartCount={cart.length}
        />
      </div>

      <div className="fixed bottom-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-white/10 rounded-full z-[60] pointer-events-none mb-[env(safe-area-inset-bottom)]" />
    </div>
  );
}
