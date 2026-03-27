import React from 'react';
import { motion } from 'framer-motion';
import { Home, UtensilsCrossed, Search, CalendarDays } from 'lucide-react';
import { GOLD_GRADIENT, LOGO_URL } from '../data';

const BottomDock = ({ activeTab, setActiveTab, onOpenInfo }) => (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[92%] sm:w-auto sm:min-w-[400px] h-16 bg-black/40 backdrop-blur-3xl border border-white/5 rounded-full flex items-center justify-between px-8 sm:px-10 z-50 shadow-2xl transition-all">
        <button
            onClick={() => setActiveTab('home')}
            data-nav="home"
            className={`relative p-2 rounded-full transition-all ${activeTab === 'home' ? 'text-gold' : 'text-white/30 hover:text-white/60'}`}
        >
            <Home size={22} />
            {activeTab === 'home' && (
                <motion.div layoutId="nav-pill" className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-gold rounded-full" />
            )}
        </button>

        <button
            onClick={() => setActiveTab('menu')}
            data-nav="menu"
            className={`relative p-2 rounded-full transition-all ${activeTab === 'menu' ? 'text-gold' : 'text-white/30 hover:text-white/60'}`}
        >
            <UtensilsCrossed size={22} />
            {activeTab === 'menu' && (
                <motion.div layoutId="nav-pill" className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-gold rounded-full" />
            )}
        </button>

        {/* Central Action Button */}
        <motion.button
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setActiveTab('bookingflow')}
            data-nav="booking"
            className="h-14 w-14 rounded-2xl -mt-10 flex items-center justify-center shadow-[0_8px_20px_rgba(245,197,24,0.3)] z-50 transition-all border border-white/10"
            style={{ background: GOLD_GRADIENT }}
        >
            <CalendarDays size={24} className="text-navy-900" />
        </motion.button>

        <button
            onClick={() => setActiveTab('search')}
            data-nav="order"
            className={`relative p-2 rounded-full transition-all ${activeTab === 'search' ? 'text-gold' : 'text-white/30 hover:text-white/60'}`}
        >
            <Search size={22} />
            {activeTab === 'search' && (
                <motion.div layoutId="nav-pill" className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-gold rounded-full" />
            )}
        </button>

        <button
            onClick={onOpenInfo}
            className="relative p-2 group"
        >
            <div className="w-6 h-6 flex items-center justify-center opacity-40 group-hover:opacity-100 transition-all">
                <img src={LOGO_URL} alt="DAS ELB" className="w-full h-full object-contain" />
            </div>
        </button>
    </div>
);

export default BottomDock;
