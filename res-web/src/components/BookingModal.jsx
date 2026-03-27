import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, MapPin, Phone, Clock, Minus, Plus } from 'lucide-react';
import { LOGO_URL, GOLD_GRADIENT } from '../data';

// --- Info Modal Component ---
export const InfoModal = ({ onClose }) => {
    useEffect(() => {
        // Prevent scrolling when modal is open
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, []);

    return (
        <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-[100] flex flex-col backdrop-blur-md md:max-w-2xl md:mx-auto md:h-[90vh] md:top-1/2 md:-translate-y-1/2 md:rounded-[40px] md:overflow-hidden md:shadow-2xl"
            style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
        >
            {/* Close Button */}
            <button
                onClick={onClose}
                className="absolute top-6 right-6 z-20 bg-white/10 p-2 rounded-full backdrop-blur-md text-white border border-white/20 active:scale-90 transition-all pt-[env(safe-area-inset-top)]"
            >
                <X size={24} />
            </button>

            {/* Section A: Map */}
            <div className="h-[40%] w-full relative rounded-b-[40px] overflow-hidden shadow-2xl z-10">
                <iframe
                    title="Google Maps"
                    src="https://maps.google.com/maps?q=Seilerweg%2019,%2039114%20Magdeburg&t=&z=15&ie=UTF8&iwloc=&output=embed"
                    width="100%"
                    height="100%"
                    style={{ border: 0 }}
                    allowFullScreen=""
                    loading="lazy"
                    className="grayscale invert brightness-75 contrast-125"
                ></iframe>
                <div className="absolute inset-0 pointer-events-none border-b border-white/10 rounded-b-[40px] shadow-[inset_0_-20px_40px_rgba(0,0,0,0.8)]" />
            </div>

            {/* Section B: Details */}
            <div className="flex-1 p-8 flex flex-col justify-start pt-12 gap-8 overflow-y-auto">

                {/* Header */}
                <div>
                    <h2 className="text-3xl font-serif font-black italic tracking-tighter uppercase mb-2" style={{ color: '#FBF5B7' }}>
                        DAS ELB MAGDEBURG
                    </h2>
                    <p className="text-white/50 text-xs tracking-[0.3em] uppercase">Das Elb Hotel und Restaurant</p>
                </div>

                {/* Info Grid */}
                <div className="flex flex-col gap-8">

                    {/* Address */}
                    <div className="flex gap-5 items-start">
                        <div className="bg-[#BF953F]/10 p-3 rounded-2xl border border-[#BF953F]/20 shrink-0">
                            <MapPin className="text-[#BF953F]" size={24} />
                        </div>
                        <div>
                            <h3 className="text-[#FBF5B7] text-xs font-bold uppercase tracking-widest mb-1">Adresse</h3>
                            <p className="text-white font-medium leading-relaxed">
                                Seilerweg 19<br />
                                39114 Magdeburg
                            </p>
                        </div>
                    </div>

                    {/* Phone */}
                    <a href="tel:+493915632660" className="flex gap-5 items-start active:opacity-70 transition-opacity">
                        <div className="bg-[#BF953F]/10 p-3 rounded-2xl border border-[#BF953F]/20 shrink-0">
                            <Phone className="text-[#BF953F]" size={24} />
                        </div>
                        <div>
                            <h3 className="text-[#FBF5B7] text-xs font-bold uppercase tracking-widest mb-1">Telefon</h3>
                            <p className="text-white font-medium text-lg decoration-[#BF953F] decoration-1 underline-offset-4 underline">
                                0391 5632660
                            </p>
                        </div>
                    </a>

                    {/* Hours */}
                    <div className="flex gap-5 items-start">
                        <div className="bg-[#BF953F]/10 p-3 rounded-2xl border border-[#BF953F]/20 shrink-0">
                            <Clock className="text-[#BF953F]" size={24} />
                        </div>
                        <div>
                            <h3 className="text-[#FBF5B7] text-xs font-bold uppercase tracking-widest mb-1">Öffnungszeiten</h3>
                            <div className="text-white font-medium">
                                <div className="flex justify-between w-full gap-8">
                                    <span>Mo - So</span>
                                    <span>11:00 - 22:30</span>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>

                {/* Decorative Element */}
                <div className="mt-auto flex justify-center opacity-30">
                    <img src={LOGO_URL} alt="Das Elb Logo Watermark" className="w-24 opacity-50 grayscale" />
                </div>
            </div>
        </motion.div>
    );
};

// --- Guest Selector Modal Component ---
export const GuestSelectorModal = ({ guests, setGuests, onClose }) => (
    <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
        onClick={onClose}
    >
        <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            className="bg-[#001B3D] border border-white/10 p-6 rounded-3xl w-full max-w-xs shadow-2xl relative overflow-hidden"
            onClick={(e) => e.stopPropagation()}
        >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#BF953F] to-transparent opacity-50" />

            <h3 className="text-center text-[#FBF5B7] text-lg font-bold uppercase tracking-widest mb-8">Gästezahl</h3>

            <div className="flex items-center justify-between mb-8">
                <button
                    onClick={() => setGuests(Math.max(1, guests - 1))}
                    className="w-12 h-12 rounded-full border border-white/20 flex items-center justify-center text-white hover:bg-white/10 active:scale-95 transition-all"
                >
                    <Minus size={20} />
                </button>

                <span className="text-4xl font-black text-white">{guests}</span>

                <button
                    onClick={() => setGuests(Math.min(20, guests + 1))}
                    className="w-12 h-12 rounded-full border border-white/20 flex items-center justify-center text-white hover:bg-white/10 active:scale-95 transition-all"
                >
                    <Plus size={20} />
                </button>
            </div>

            <button
                onClick={onClose}
                className="w-full py-4 rounded-xl font-bold uppercase tracking-[0.2em] text-[10px] text-black shadow-lg active:scale-95 transition-all"
                style={{ background: GOLD_GRADIENT }}
            >
                Übernehmen
            </button>
        </motion.div>
    </motion.div>
);
