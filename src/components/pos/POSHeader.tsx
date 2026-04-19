'use client';

import { Bell, Search, ChevronRight, Wifi } from 'lucide-react';
import type { POSPhase, Table } from './types';

const BREADCRUMB: Record<POSPhase, string[]> = {
  'table-map': ['Floor Plan'],
  'order-builder': ['Floor Plan', 'Order Builder'],
  'order-tracker': ['Floor Plan', 'Order Tracker'],
};

interface POSHeaderProps {
  phase: POSPhase;
  selectedTable?: Table | null;
  unreadCount?: number;
  onBackToMap?: () => void;
}

export function POSHeader({ phase, selectedTable, unreadCount = 3, onBackToMap }: POSHeaderProps) {
  const crumbs = BREADCRUMB[phase];

  return (
    <header
      className="flex items-center gap-4 h-[64px] px-5 shrink-0 z-10"
      style={{
        background: 'rgba(8, 20, 14, 0.85)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 flex-1 min-w-0">
        {crumbs.map((crumb, i) => (
          <span key={crumb} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight size={12} className="text-white/25 shrink-0" />}
            <button
              onClick={i === 0 && phase !== 'table-map' ? onBackToMap : undefined}
              className={`text-sm font-medium transition-colors whitespace-nowrap ${
                i === crumbs.length - 1
                  ? 'text-white/90'
                  : 'text-white/40 hover:text-white/70 cursor-pointer'
              }`}
            >
              {crumb}
            </button>
          </span>
        ))}
        {selectedTable && phase !== 'table-map' && (
          <>
            <ChevronRight size={12} className="text-white/25 shrink-0" />
            <span className="text-sm font-semibold text-accent whitespace-nowrap">
              Table {selectedTable.number}
            </span>
          </>
        )}
      </nav>

      {/* Search */}
      <div
        className="flex items-center gap-2 px-3 h-9 rounded-lg w-52"
        style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <Search size={14} className="text-white/30 shrink-0" />
        <input
          type="text"
          placeholder="Search menu…"
          className="bg-transparent text-sm text-white/70 placeholder:text-white/25 outline-none w-full min-w-0"
        />
      </div>

      {/* Status dot */}
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}>
        <Wifi size={12} className="text-emerald-400" />
        <span className="text-emerald-400 text-xs font-medium">Live</span>
      </div>

      {/* Notifications */}
      <button className="relative w-9 h-9 flex items-center justify-center rounded-lg transition-all hover:bg-white/5 min-w-[44px] min-h-[44px]">
        <Bell size={18} className="text-white/60" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center text-[10px] font-bold text-white leading-none shadow-[0_0_8px_rgba(239,68,68,0.6)]">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Staff avatar */}
      <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-accent border border-accent/30 shrink-0" style={{ background: 'rgba(200,169,81,0.15)' }}>
        AK
      </div>
    </header>
  );
}
