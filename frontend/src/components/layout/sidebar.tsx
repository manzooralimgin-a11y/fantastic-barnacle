"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, X, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";
import { hasRoleAccess, navSections } from "@/lib/navigation";
import { motion, AnimatePresence } from "framer-motion";

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const userRole = useAuthStore((s) => s.user?.role);
  const userName = useAuthStore((s) => s.user?.full_name);
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  const initials = userName
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase() || "U";

  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {open && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            type="button"
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
            aria-label="Close navigation menu"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col transition-all duration-300 ease-standard",
          "glass border-r border-border",
          // Desktop: collapsed (72px) or expanded (260px)
          collapsed ? "md:w-[72px]" : "md:w-[260px]",
          "md:translate-x-0",
          // Mobile: full width slide-in
          open ? "translate-x-0 w-[280px]" : "-translate-x-full w-[280px]",
        )}
      >
        {/* ── Logo area ── */}
        <div className={cn(
          "flex py-4 items-center shrink-0 border-b border-border",
          collapsed ? "justify-center px-0 h-20" : "justify-center px-5 flex-col gap-2 h-32 relative"
        )}>
          <Link href="/" className="flex flex-col items-center justify-center gap-1.5" onClick={onClose}>
            {/* DAS ELB Logo */}
            <div className={cn("relative flex items-center justify-center bg-white rounded-xl p-1.5 shadow-glow-sm shrink-0", collapsed ? "h-10 w-10" : "h-14 w-14")}>
              <img src="/das-elb-logo.png" alt="DAS ELB" className="w-full h-auto object-contain" />
            </div>
            <AnimatePresence mode="wait">
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="text-sm font-bold text-foreground tracking-[0.2em] uppercase"
                >
                  DAS ELB
                </motion.span>
              )}
            </AnimatePresence>
          </Link>

          {/* Close — mobile only */}
          <button
            onClick={onClose}
            type="button"
            aria-label="Close sidebar"
            className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-foreground/[0.06] md:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Navigation ── */}
        <nav className={cn(
          "flex-1 overflow-y-auto py-4",
          collapsed ? "px-2" : "px-3"
        )}>
          {navSections.map((section, sectionIdx) => {
            const visibleItems = section.items.filter((item) =>
              hasRoleAccess(userRole, item.minRole)
            );
            if (visibleItems.length === 0) return null;

            return (
              <div key={section.title} className="mb-4">
                {/* Section divider (not on first) */}
                {sectionIdx > 0 && (
                  <div className={cn("glow-divider mb-4", collapsed ? "mx-1" : "mx-2")} />
                )}

                {/* Section title */}
                <AnimatePresence mode="wait">
                  {!collapsed && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.1 }}
                      className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/60"
                    >
                      {section.title}
                    </motion.p>
                  )}
                </AnimatePresence>

                {/* Items */}
                <ul className="space-y-0.5">
                  {visibleItems.map((item) => {
                    const isActive =
                      pathname === item.href ||
                      (item.href !== "/" && pathname.startsWith(item.href));
                    const Icon = item.icon;

                    return (
                      <li key={item.href} className="relative group">
                        <Link
                          href={item.href}
                          onClick={onClose}
                          className={cn(
                            "flex items-center rounded-lg text-sm font-medium transition-all duration-200",
                            collapsed
                              ? "justify-center h-10 w-full"
                              : "gap-3 px-3 py-2",
                            isActive
                              ? "bg-primary/10 text-primary nav-active-bar"
                              : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"
                          )}
                        >
                          <Icon
                            className={cn(
                              "shrink-0 transition-colors duration-200",
                              collapsed ? "h-[18px] w-[18px]" : "h-4 w-4",
                              isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                            )}
                          />

                          {/* Label */}
                          <AnimatePresence mode="wait">
                            {!collapsed && (
                              <motion.span
                                initial={{ opacity: 0, x: -6 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -6 }}
                                transition={{ duration: 0.12 }}
                              >
                                {item.label}
                              </motion.span>
                            )}
                          </AnimatePresence>

                          {/* Active glow dot — collapsed only */}
                          {collapsed && isActive && (
                            <span className="absolute right-1.5 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_6px_hsl(var(--glow-primary)/0.6)]" />
                          )}
                        </Link>

                        {/* Tooltip — collapsed only */}
                        {collapsed && (
                          <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1.5 rounded-lg glass text-xs text-foreground font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-[60] shadow-raised">
                            {item.label}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        {/* ── Bottom zone ── */}
        <div className={cn(
          "shrink-0 border-t border-border py-3",
          collapsed ? "px-2" : "px-3"
        )}>
          {/* Settings link */}
          <Link
            href="/settings"
            onClick={onClose}
            className={cn(
              "flex items-center rounded-lg text-sm font-medium text-muted-foreground transition-all duration-200 hover:bg-foreground/[0.04] hover:text-foreground mb-2",
              collapsed ? "justify-center h-10" : "gap-3 px-3 py-2"
            )}
          >
            <Settings className={cn("shrink-0", collapsed ? "h-[18px] w-[18px]" : "h-4 w-4")} />
            <AnimatePresence mode="wait">
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -6 }}
                  transition={{ duration: 0.12 }}
                >
                  Settings
                </motion.span>
              )}
            </AnimatePresence>
          </Link>

          {/* User + collapse toggle */}
          <div className={cn(
            "flex items-center",
            collapsed ? "flex-col gap-2" : "justify-between px-2"
          )}>
            {/* User avatar */}
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500/80 to-emerald-600/80 text-xs font-semibold text-white ring-2 ring-emerald-500/20 shrink-0">
              {initials}
            </div>

            {/* Expand / Collapse — desktop only */}
            <button
              onClick={toggleSidebar}
              type="button"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="hidden md:flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground transition-colors"
            >
              {collapsed ? (
                <ChevronRight className="h-3.5 w-3.5" />
              ) : (
                <ChevronLeft className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
