import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Flame, Leaf } from 'lucide-react';

function formatPrice(value) {
    if (typeof value === 'string') {
        return value;
    }
    return new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: 'EUR',
    }).format(Number(value || 0));
}

const MenuCard = ({
    item,
    idx,
    quantity = 0,
    onAdd,
    onIncrease,
    onDecrease,
}) => {
    const [selectedVar, setSelectedVar] = useState(item.variations ? item.variations[0] : null);
    const displayPrice = selectedVar ? selectedVar.price : (item.price || "€0.00");
    const isSpicy = item.isSpicy || idx % 3 === 0;
    const isVegetarian = item.isVeg ?? item.dietary_tags?.includes('vegetarian') ?? true;
    const disabled = item.is_available === false;

    return (
        <motion.div
            whileTap={{ scale: 0.98 }}
            className="group relative flex flex-col bg-[#0F1115] rounded-[2rem] overflow-hidden shadow-2xl transition-all duration-500 hover:shadow-gold/5 flex-shrink-0
                       w-[85vw] md:w-full h-[420px] scroll-snap-align-center"
            data-menu-item={item.id}
        >
            {/* Image Container */}
            <div className="relative h-[60%] w-full overflow-hidden shrink-0">
                <img
                    src={item.image_url || item.img || '/daselb-logo.png'}
                    alt={item.name}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    loading="lazy"
                />
                
                {/* Spicy Icon */}
                {isSpicy && (
                    <div className="absolute top-4 left-4 z-10 bg-red-600 rounded-full w-8 h-8 flex items-center justify-center shadow-lg">
                        <Flame size={16} color="white" fill="white" />
                    </div>
                )}

                <div className="absolute inset-0 bg-gradient-to-t from-[#0F1115] via-transparent to-transparent opacity-60" />
            </div>

            {/* Content Container */}
            <div className="flex-1 p-5 md:p-6 flex flex-col justify-between">
                <div>
                    {/* Title */}
                    <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-serif italic font-bold text-2xl text-[#FBF5B7] leading-tight">
                            {item.name}
                        </h4>
                        {isVegetarian && <Leaf size={16} className="text-green-500 fill-green-500" />}
                    </div>

                    {/* Description */}
                    <p className="text-white/40 text-xs md:text-sm line-clamp-2 leading-relaxed">
                        {item.desc}
                    </p>
                </div>

                {/* Variants */}
                {item.variations && (
                    <div className="flex flex-wrap gap-2 my-4">
                        {item.variations.map((v) => (
                            <button
                                key={v.name}
                                onClick={(e) => { e.stopPropagation(); setSelectedVar(v); }}
                                className={`px-3 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-wider transition-all border
                                    ${selectedVar?.name === v.name 
                                        ? 'bg-gold border-gold text-navy-900' 
                                        : 'bg-white/5 border-white/10 text-white/40 hover:border-white/20'}`}
                            >
                                {v.name}
                            </button>
                        ))}
                    </div>
                )}

                {/* Footer */}
                <div className="pt-4 border-t border-white/5 flex justify-between items-end mt-auto">
                    <div>
                        <div className="text-[9px] uppercase tracking-[0.2em] text-white/30 font-bold mb-1">Preis</div>
                        <div className="text-gold text-xl font-bold font-serif">{formatPrice(displayPrice)}</div>
                    </div>
                    {quantity > 0 ? (
                        <div className="flex items-center gap-2 rounded-full border border-gold/40 bg-white/5 px-2 py-1.5">
                            <button
                                type="button"
                                data-cart-action="decrease"
                                data-item-id={item.id}
                                onClick={() => onDecrease?.(item)}
                                className="h-8 w-8 rounded-full border border-white/10 text-white hover:border-gold/50"
                            >
                                -
                            </button>
                            <span className="min-w-6 text-center text-sm font-bold text-white">{quantity}</span>
                            <button
                                type="button"
                                data-cart-action="increase"
                                data-item-id={item.id}
                                onClick={() => onIncrease?.(item)}
                                className="h-8 w-8 rounded-full border border-white/10 text-white hover:border-gold/50"
                            >
                                +
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            data-cart-action="add"
                            data-item-id={item.id}
                            onClick={() => onAdd?.(item)}
                            disabled={disabled}
                            className="group/btn relative px-5 py-2.5 bg-transparent border border-gold/40 rounded-full text-[10px] font-bold text-white uppercase tracking-widest overflow-hidden transition-all hover:border-gold hover:pr-10 disabled:border-white/10 disabled:text-white/20 disabled:hover:pr-5"
                        >
                            <span className="relative z-10">{disabled ? 'Ausverkauft' : 'Wählen'}</span>
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 bg-gold rounded-full w-5 h-5 flex items-center justify-center opacity-0 -translate-x-2 transition-all group-hover/btn:opacity-100 group-hover/btn:translate-x-0">
                                <Plus size={10} color="black" />
                            </div>
                        </button>
                    )}
                </div>
            </div>
        </motion.div>
    );
};

export default MenuCard;
