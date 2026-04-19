'use client';

import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  UtensilsCrossed,
  BarChart3,
  Settings,
  Users,
  CalendarDays,
  ClipboardList,
  LogOut,
} from 'lucide-react';
import { usePOSStore } from './posStore';

const GASTRO_NAV = [
  { icon: LayoutGrid, label: 'Floor Plan', active: true },
  { icon: UtensilsCrossed, label: 'Orders', active: false },
  { icon: ClipboardList, label: 'Menu', active: false },
  { icon: CalendarDays, label: 'Reservations', active: false },
];

const MGMT_NAV = [
  { icon: BarChart3, label: 'Analytics', active: false },
  { icon: Users, label: 'Staff', active: false },
  { icon: Settings, label: 'Settings', active: false },
];

export function POSSidebar() {
  const { sidebarCollapsed, toggleSidebar, activeDomain, setActiveDomain } = usePOSStore();

  return (
    <motion.aside
      animate={{ width: sidebarCollapsed ? 72 : 260 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="relative flex flex-col h-full shrink-0 z-20"
      style={{
        background: 'rgba(8, 20, 14, 0.75)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderRight: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      {/* Logo */}
      <div className="flex items-center h-[64px] px-4 shrink-0 border-b border-white/5">
        <div className="w-9 h-9 rounded-xl bg-accent/20 border border-accent/40 flex items-center justify-center shrink-0">
          <span className="text-accent font-heading font-bold text-base">E</span>
        </div>
        <AnimatePresence>
          {!sidebarCollapsed && (
            <motion.span
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.15 }}
              className="ml-3 text-text-primary-dark font-heading font-semibold text-base whitespace-nowrap overflow-hidden"
            >
              Das Elb
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Domain toggle pill */}
      <div className="px-3 py-3 border-b border-white/5">
        <div
          className="relative flex rounded-lg overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.06)', padding: '3px' }}
        >
          {sidebarCollapsed ? (
            <div className="flex flex-col gap-1 w-full">
              {(['gastronomy', 'management'] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setActiveDomain(d)}
                  className={`w-full h-8 rounded-md flex items-center justify-center text-xs font-bold transition-all ${
                    activeDomain === d
                      ? 'bg-accent/25 text-accent'
                      : 'text-white/40 hover:text-white/70'
                  }`}
                >
                  {d === 'gastronomy' ? 'G' : 'M'}
                </button>
              ))}
            </div>
          ) : (
            <>
              <motion.div
                className="absolute top-[3px] bottom-[3px] rounded-md bg-accent/20"
                animate={{ left: activeDomain === 'gastronomy' ? 3 : '50%' }}
                style={{ width: 'calc(50% - 3px)' }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
              {(['gastronomy', 'management'] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setActiveDomain(d)}
                  className={`relative z-10 flex-1 h-8 rounded-md text-xs font-semibold transition-colors ${
                    activeDomain === d ? 'text-accent' : 'text-white/40 hover:text-white/70'
                  }`}
                >
                  {d === 'gastronomy' ? 'Gastronomy' : 'Management'}
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {(activeDomain === 'gastronomy' ? GASTRO_NAV : MGMT_NAV).map(({ icon: Icon, label, active }) => (
          <button
            key={label}
            className={`w-full flex items-center gap-3 px-2.5 py-2.5 rounded-lg transition-all group min-h-[44px] ${
              active
                ? 'bg-accent/15 text-accent'
                : 'text-white/50 hover:bg-white/5 hover:text-white/80'
            }`}
          >
            <Icon size={18} className="shrink-0" />
            <AnimatePresence>
              {!sidebarCollapsed && (
                <motion.span
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -6 }}
                  transition={{ duration: 0.12 }}
                  className="text-sm font-medium whitespace-nowrap overflow-hidden"
                >
                  {label}
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        ))}
      </nav>

      {/* Bottom: logout */}
      <div className="px-2 pb-4 border-t border-white/5 pt-3">
        <button className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-lg text-white/30 hover:text-red-400/70 hover:bg-red-500/5 transition-all min-h-[44px]">
          <LogOut size={18} className="shrink-0" />
          <AnimatePresence>
            {!sidebarCollapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-sm whitespace-nowrap"
              >
                Sign Out
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={toggleSidebar}
        className="absolute -right-3 top-[84px] z-30 w-6 h-6 rounded-full flex items-center justify-center transition-all hover:scale-110"
        style={{
          background: 'rgba(14,30,22,0.9)',
          border: '1px solid rgba(255,255,255,0.12)',
          backdropFilter: 'blur(8px)',
        }}
      >
        {sidebarCollapsed ? (
          <ChevronRight size={12} className="text-white/60" />
        ) : (
          <ChevronLeft size={12} className="text-white/60" />
        )}
      </button>
    </motion.aside>
  );
}
