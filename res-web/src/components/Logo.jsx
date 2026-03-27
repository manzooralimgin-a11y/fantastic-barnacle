import React from 'react';
import { motion } from 'framer-motion';
import { LOGO_URL } from '../data';

const Logo = ({ variant = 'default' }) => (
    <div className={`flex flex-col items-center w-full z-20 pointer-events-none transition-all duration-300 ${variant === 'home' ? 'pt-[calc(env(safe-area-inset-top)+2rem)]' : 'pt-[env(safe-area-inset-top)] mt-2'}`}>
        {/* Image */}
        <div className={`relative flex items-center justify-center transition-all duration-500 ${variant === 'home' ? 'w-44 h-14' : 'w-24 h-10'}`}>
            <img
                src={LOGO_URL}
                alt="DAS ELB Logo"
                className="max-w-full max-h-full object-contain filter drop-shadow-[0_4px_16px_rgba(191,149,63,0.5)]"
                style={{ filter: 'brightness(1.1) contrast(1.2)' }}
            />
        </div>
        
        {/* New focused branding under logo */}
        <div className="mt-2 flex flex-col items-center">
            <span className="text-[#FBF5B7] text-[12px] font-serif font-bold tracking-[0.2em] uppercase italic">
                Das Elb
            </span>
        </div>

    </div>
);

export default Logo;
