import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Flame, Leaf } from 'lucide-react';

const MenuCard = ({ item, idx, addToCart, preload = false }) => {
    const [selectedVar, setSelectedVar] = useState(item.variations ? item.variations[0] : null);
    const displayPrice = selectedVar ? selectedVar.price : (item.price || "€0.00");
    const isSpicy = item.isSpicy || idx % 3 === 0;
    const isVegetarian = item.isVeg || true;

    return (
        <motion.div
            whileTap={{ scale: 0.98 }}
            className="force-menu-card" // <--- Global CSS Hook
            style={{
                // 1. Main Card Container
                display: 'flex',
                flexDirection: 'column',
                height: '420px', // <--- REDUCED
                width: '85vw',
                minWidth: '85vw', // <--- Ensure min-width
                maxWidth: '85vw',
                position: 'relative',
                backgroundColor: '#0F1115',
                borderRadius: '24px',
                overflow: 'hidden',
                scrollSnapAlign: 'center',
                flexShrink: 0,
                boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                margin: '0', // <--- RESET MARGIN

                // Strict Overrides
                cssText: 'display: flex !important; flex-direction: column !important; height: 420px !important; width: 85vw !important; min-width: 85vw !important; max-width: 85vw !important; flex-shrink: 0 !important; margin: 0 !important;'
            }}
            // Using ref to set precise styles if React style object keeps stripping !important
            ref={el => {
                if (el) {
                    el.style.setProperty('display', 'flex', 'important');
                    el.style.setProperty('flex-direction', 'column', 'important');
                    el.style.setProperty('height', '420px', 'important'); // <--- REDUCED
                    el.style.setProperty('width', '85vw', 'important');
                    el.style.setProperty('min-width', '85vw', 'important');
                    el.style.setProperty('max-width', '85vw', 'important');
                    el.style.setProperty('flex-shrink', '0', 'important');
                    el.style.setProperty('margin', '0', 'important'); // <--- RESET
                }
            }}
        >
            {/* 2. Image Container */}
            <div
                style={{
                    width: '100%',
                    height: '60%',
                    position: 'relative',
                    flexShrink: 0
                }}
                ref={el => {
                    if (el) {
                        el.style.setProperty('width', '100%', 'important');
                        el.style.setProperty('height', '60%', 'important');
                        el.style.setProperty('position', 'relative', 'important');
                        el.style.setProperty('flex-shrink', '0', 'important');
                    }
                }}
            >
                {/* 3. Image */}
                <img
                    src={item.img}
                    alt={item.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />

                {/* 4. Spicy Icon */}
                {isSpicy && (
                    <div
                        style={{
                            position: 'absolute',
                            top: '16px',
                            left: '16px',
                            zIndex: 10,
                            background: '#DC2626',
                            borderRadius: '50%',
                            width: '32px',
                            height: '32px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                        ref={el => {
                            if (el) {
                                el.style.setProperty('position', 'absolute', 'important');
                                el.style.setProperty('top', '16px', 'important');
                                el.style.setProperty('left', '16px', 'important');
                            }
                        }}
                    >
                        <Flame size={16} color="white" fill="white" />
                    </div>
                )}
            </div>

            {/* 5. Content Container */}
            <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column' }}>

                {/* Title */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <h4 style={{ fontFamily: 'serif', fontStyle: 'italic', fontWeight: 'bold', fontSize: '24px', color: '#FBF5B7', margin: 0 }}>
                        {item.name}
                    </h4>
                    {isVegetarian && <Leaf size={18} color="#22c55e" fill="#22c55e" />}
                </div>

                {/* Description */}
                <p style={{ color: '#9ca3af', fontSize: '14px', margin: 0, flex: 1 }}>
                    {item.desc}
                </p>

                {/* Variants */}
                {item.variations && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px', marginBottom: '12px' }}>
                        {item.variations.map((v) => (
                            <button
                                key={v.name}
                                onClick={(e) => { e.stopPropagation(); setSelectedVar(v); }}
                                style={{
                                    padding: '4px 12px',
                                    borderRadius: '999px',
                                    fontSize: '10px',
                                    fontWeight: 'bold',
                                    textTransform: 'uppercase',
                                    border: selectedVar?.name === v.name ? '1px solid #C5A059' : '1px solid rgba(255,255,255,0.2)',
                                    background: selectedVar?.name === v.name ? '#C5A059' : 'transparent',
                                    color: selectedVar?.name === v.name ? 'black' : 'rgba(255,255,255,0.6)',
                                }}
                            >
                                {v.name}
                            </button>
                        ))}
                    </div>
                )}

                {/* Footer */}
                <div style={{ paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto' }}>
                    <div>
                        <div style={{ fontSize: '10px', textTransform: 'uppercase', color: '#6b7280' }}>PREIS</div>
                        <div style={{ color: '#C5A059', fontSize: '20px', fontWeight: 'bold', fontFamily: 'serif' }}>{displayPrice}</div>
                    </div>
                    <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            addToCart(item);
                        }}
                        style={{ background: 'transparent', border: '1px solid #C5A059', color: 'white', padding: '8px 16px', borderRadius: '50px', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        WÄHLEN <div style={{ background: '#C5A059', borderRadius: '50%', width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={10} color="black" /></div>
                    </button>
                </div>
            </div>
        </motion.div>
    );
};

export default MenuCard;
