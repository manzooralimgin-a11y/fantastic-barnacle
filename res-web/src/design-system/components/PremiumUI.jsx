import React from 'react';

export const Input = ({ label, error, ...props }) => (
    <div className="flex flex-col space-y-1.5 w-full">
        {label && (
            <label className="text-hospitality-muted text-xs uppercase tracking-widest font-bold px-1">
                {label}
            </label>
        )}
        <input
            {...props}
            className={`w-full bg-white/5 border ${error ? 'border-red-500' : 'border-white/10'} 
      focus:border-gold focus:ring-1 focus:ring-gold text-white rounded-xl px-4 py-3 
      transition-all outline-none placeholder:text-white/20`}
        />
        {error && <span className="text-red-500 text-[10px] px-1">{error}</span>}
    </div>
);

export const Select = ({ label, options, error, ...props }) => (
    <div className="flex flex-col space-y-1.5 w-full">
        {label && (
            <label className="text-hospitality-muted text-xs uppercase tracking-widest font-bold px-1">
                {label}
            </label>
        )}
        <div className="relative">
            <select
                {...props}
                className={`w-full bg-white/5 border ${error ? 'border-red-500' : 'border-white/10'} 
        focus:border-gold focus:ring-1 focus:ring-gold text-white rounded-xl px-4 py-3 
        appearance-none transition-all outline-none cursor-pointer`}
            >
                {options.map(opt => (
                    <option key={opt.value} value={opt.value} className="bg-navy-900 text-white">
                        {opt.label}
                    </option>
                ))}
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-white/40">
                <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
                    <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </div>
        </div>
        {error && <span className="text-red-500 text-[10px] px-1">{error}</span>}
    </div>
);

export const Avatar = ({ src, name, size = 'md' }) => {
    const sizes = {
        sm: 'w-8 h-8',
        md: 'w-12 h-12',
        lg: 'w-16 h-16',
    };

    return (
        <div className={`${sizes[size]} rounded-full border border-white/10 overflow-hidden bg-white/5 flex items-center justify-center shrink-0`}>
            {src ? (
                <img src={src} alt={name} className="w-full h-full object-cover" />
            ) : (
                <span className="text-white/40 font-bold uppercase">{name?.charAt(0) || '?'}</span>
            )}
        </div>
    );
};

export const Toast = ({ message, type = 'info', onClose }) => {
    const colors = {
        info: 'bg-navy-900/90 border-white/10',
        success: 'bg-emerald-900/90 border-emerald-500/30',
        error: 'bg-rose-900/90 border-rose-500/30',
        warning: 'bg-amber-900/90 border-amber-500/30',
    };

    return (
        <div
            className={`fixed bottom-24 left-4 right-4 md:left-auto md:right-8 md:w-80 p-4 rounded-2xl border backdrop-blur-xl shadow-2xl z-[100] flex justify-between items-center ${colors[type]}`}
        >
            <p className="text-white text-sm font-medium">{message}</p>
            <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>
        </div>
    );
};

export const ProgressBar = ({ progress }) => (
    <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden">
        <div
            className="bg-gold h-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
        />
    </div>
);
