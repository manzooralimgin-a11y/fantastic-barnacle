'use client';

import { motion } from 'framer-motion';
import { Clock, ChefHat, Users } from 'lucide-react';
import type { Table, TableStatus } from './types';
import { TABLE_STATUS_CONFIG } from './types';
import { MOCK_TABLES } from './mockData';

function formatMinutes(m: number) {
  if (m === 0) return null;
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

interface TableCardProps {
  table: Table;
  onSelect: (table: Table) => void;
}

function TableCard({ table, onSelect }: TableCardProps) {
  const cfg = TABLE_STATUS_CONFIG[table.status];
  const isInteractive = table.status === 'available' || table.status === 'occupied';
  const elapsed = formatMinutes(table.elapsed_minutes);

  return (
    <motion.button
      layout
      onClick={() => isInteractive && onSelect(table)}
      whileHover={isInteractive ? { scale: 1.06 } : {}}
      whileTap={isInteractive ? { scale: 0.97 } : {}}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      className={`absolute flex flex-col items-center justify-center select-none focus:outline-none ${
        isInteractive ? 'cursor-pointer' : 'cursor-default'
      }`}
      style={{
        left: `${table.x}%`,
        top: `${table.y}%`,
        transform: 'translate(-50%, -50%)',
        width: table.seats > 4 ? 80 : 66,
        height: table.seats > 4 ? 80 : 66,
      }}
    >
      {/* Table body */}
      <div
        className={`relative flex flex-col items-center justify-center w-full h-full ring-2 transition-all ${
          table.shape === 'round' ? 'rounded-full' : 'rounded-xl'
        } ${cfg.bg} ${cfg.ring} ${cfg.glow}`}
        style={{
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          background: `rgba(10,26,20,0.6)`,
          border: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <span className="text-white/90 font-bold text-sm leading-none">{table.label}</span>
        <span className={`text-[10px] font-medium mt-0.5 ${cfg.color}`}>
          {TABLE_STATUS_CONFIG[table.status].label}
        </span>

        {/* Chair dots */}
        <div className="absolute -bottom-1.5 flex gap-0.5">
          {Array.from({ length: Math.min(table.seats, 6) }).map((_, i) => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-white/20" />
          ))}
        </div>
      </div>

      {/* Badges */}
      {elapsed && (
        <div
          className="absolute -top-2 -right-2 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.5)]"
          style={{ background: 'rgba(245,158,11,0.2)', border: '1px solid rgba(245,158,11,0.35)' }}
        >
          <Clock size={9} strokeWidth={2.5} />
          {elapsed}
        </div>
      )}
      {table.ready_item_count > 0 && (
        <div
          className="absolute -top-2 -left-2 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold text-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
          style={{ background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.35)' }}
        >
          <ChefHat size={9} strokeWidth={2.5} />
          {table.ready_item_count}
        </div>
      )}
    </motion.button>
  );
}

function Legend() {
  return (
    <div
      className="absolute bottom-4 left-4 flex flex-wrap gap-2 p-2.5 rounded-xl"
      style={{
        background: 'rgba(8,20,14,0.8)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      {(Object.entries(TABLE_STATUS_CONFIG) as [TableStatus, typeof TABLE_STATUS_CONFIG[TableStatus]][]).map(([key, cfg]) => (
        <div key={key} className="flex items-center gap-1.5">
          <div className={`w-2.5 h-2.5 rounded-full ${cfg.bg} ring-1 ${cfg.ring}`} />
          <span className="text-[11px] text-white/50">{cfg.label}</span>
        </div>
      ))}
    </div>
  );
}

function SummaryBar({ tables }: { tables: Table[] }) {
  const counts = tables.reduce(
    (acc, t) => ({ ...acc, [t.status]: (acc[t.status as keyof typeof acc] ?? 0) + 1 }),
    {} as Record<TableStatus, number>
  );

  return (
    <div className="flex items-center gap-3 px-5 py-2 shrink-0 border-b border-white/5">
      <Users size={14} className="text-white/30" />
      <span className="text-xs text-white/40 font-medium">Floor summary:</span>
      {(Object.entries(counts) as [TableStatus, number][]).map(([status, count]) => {
        const cfg = TABLE_STATUS_CONFIG[status];
        return (
          <div key={status} className={`flex items-center gap-1 text-xs font-medium ${cfg.color}`}>
            <span className="font-bold">{count}</span>
            <span className="opacity-70">{cfg.label}</span>
          </div>
        );
      })}
    </div>
  );
}

interface TableMapViewProps {
  onSelectTable: (table: Table) => void;
}

export function TableMapView({ onSelectTable }: TableMapViewProps) {
  const tables = MOCK_TABLES;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <SummaryBar tables={tables} />

      {/* Map canvas */}
      <div className="relative flex-1 min-h-0 mx-4 mb-4 rounded-2xl overflow-hidden"
        style={{
          background: 'rgba(10,20,15,0.5)',
          backdropFilter: 'blur(4px)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {/* Grid overlay */}
        <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
          <div
            className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
          />
        </div>

        {/* Room labels */}
        <div className="absolute top-3 left-4 text-[11px] font-semibold uppercase tracking-widest text-white/15">
          Main Dining
        </div>
        <div className="absolute bottom-12 left-4 text-[11px] font-semibold uppercase tracking-widest text-white/15">
          Terrace
        </div>

        {/* Decorative bar (window) */}
        <div className="absolute top-0 left-0 right-0 h-0.5 opacity-20"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(200,169,81,0.6), transparent)' }}
        />

        {/* Tables — inner padding so edge badges don't clip */}
        <div className="absolute inset-0" style={{ padding: '20px 24px 56px 24px' }}>
          <div className="relative w-full h-full">
            {tables.map((table) => (
              <TableCard key={table.id} table={table} onSelect={onSelectTable} />
            ))}
          </div>
        </div>

        <Legend />
      </div>
    </div>
  );
}
