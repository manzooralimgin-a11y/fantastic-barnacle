"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, X, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { normalizeDomain } from "@/lib/domain-config";
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";
import { hasRoleAccess, gastronomyNavSections, hotelNavSections } from "@/lib/navigation";
import { getDefaultDashboardRoute } from "@/lib/role-routing";
import { motion, AnimatePresence } from "framer-motion";

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const userRole = useAuthStore((s) => s.user?.role);
  const userName = useAuthStore((s) => s.user?.full_name);
  const activeSection = useAuthStore((s) => s.activeSection);
  const setActiveSection = useAuthStore((s) => s.setActiveSection);
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  const sections = activeSection === "management" ? hotelNavSections : gastronomyNavSections;

  const initials = userName
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase() || "U";

  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {activeSection === "gestronomy" && open && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            type="button"
            className="fixed inset-0 z-40 bg-[rgba(8,12,8,0.6)] backdrop-blur-sm md:hidden"
            aria-label="Close navigation menu"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col transition-all duration-300 ease-editorial",
          "bg-[var(--color-brand-green)] text-[var(--color-brand-cream)]",
          collapsed ? "md:w-[72px]" : "md:w-[260px]",
          "md:translate-x-0",
          open ? "translate-x-0 w-[280px]" : "-translate-x-full w-[280px]",
          "border-r border-[var(--color-brand-cream)]/10"
        )}
      >

        {/* Logo area */}
        <div className={cn(
          "flex py-4 items-center shrink-0 border-b border-[var(--color-brand-cream)]/10",
          collapsed ? "justify-center px-0 h-20" : "justify-center px-5 flex-col gap-2 h-32 relative"
        )}>

          <Link href="/" className="flex flex-col items-center justify-center gap-1.5" onClick={onClose}>
            <div className={cn(
              "relative flex items-center justify-center bg-[var(--color-brand-cream)]/5 rounded-xl p-1.5 border border-[var(--color-brand-cream)]/10 shrink-0 transition-all duration-200",
              "hover:border-[var(--color-brand-gold)]/30",
              collapsed ? "h-10 w-10" : "h-14 w-14"
            )}>
              <img src="/das-elb-logo.png" alt="DAS ELB" className="w-full h-auto object-contain brightness-0 invert" />
            </div>

            <AnimatePresence mode="wait">
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="text-sm font-editorial font-bold text-[var(--color-brand-cream)] tracking-[0.2em] uppercase"
                >
                  DAS ELB
                </motion.span>

              )}
            </AnimatePresence>
          </Link>

          {/* SECTION SWITCHER IN SIDEBAR */}
          {!collapsed && (
            <div className="flex p-0.5 bg-white/5 rounded-md border border-white/10 mt-2">
              <button 
                onClick={() => {
                   setActiveSection("gestronomy");
                   router.push(getDefaultDashboardRoute(userRole, normalizeDomain("gestronomy")));
                }}
                className={cn(
                  "px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded transition-all",
                  activeSection === "gestronomy" ? "bg-[var(--color-brand-gold)] text-[var(--color-brand-cream)]" : "text-[var(--color-brand-cream)]/60 hover:text-[var(--color-brand-cream)]"
                )}
              >
                G
              </button>
              <button 
                onClick={() => {
                   setActiveSection("management");
                   router.push(getDefaultDashboardRoute(userRole, normalizeDomain("management")));
                }}
                className={cn(
                  "px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded transition-all",
                  activeSection === "management" ? "bg-[var(--color-brand-gold)] text-[var(--color-brand-cream)]" : "text-[var(--color-brand-cream)]/60 hover:text-[var(--color-brand-cream)]"
                )}
              >
                M
              </button>
            </div>
          )}


          {/* Close — mobile only */}
          <button
            onClick={onClose}
            type="button"
            aria-label="Close sidebar"
            className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-brand-cream)]/60 hover:bg-white/5 hover:text-[var(--color-brand-cream)] transition-colors md:hidden"
          >
            <X className="h-4 w-4" />
          </button>

        </div>

        {/* Navigation */}
        <nav className={cn(
          "flex-1 overflow-y-auto py-4",
          collapsed ? "px-2" : "px-3"
        )}>
          {sections.map((section, sectionIdx) => {
            const visibleItems = section.items.filter((item) =>
              hasRoleAccess(userRole, item.minRole)
            );
            if (visibleItems.length === 0) return null;

            return (
              <div key={section.title} className="mb-4">
                {sectionIdx > 0 && (
                  <div className={cn("divider-gold mb-4", collapsed ? "mx-1" : "mx-2")} />
                )}

                <AnimatePresence mode="wait">
                  {!collapsed && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.1 }}
                      className="mb-2 px-3 text-[10px] font-body font-semibold uppercase tracking-[0.15em] text-[var(--color-brand-cream)]/40"
                    >
                      {section.title}
                    </motion.p>
                  )}
                </AnimatePresence>


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
                            "flex items-center rounded-lg text-sm font-body font-medium transition-all duration-200 ease-editorial",
                            collapsed
                              ? "justify-center h-10 w-full"
                              : "gap-3 px-3 py-2",
                            isActive
                              ? "bg-[var(--color-brand-gold)] text-[var(--color-brand-cream)] shadow-[0_4px_12px_rgba(197,160,89,0.2)]"
                              : "text-[var(--color-brand-cream)]/60 hover:bg-white/5 hover:text-[var(--color-brand-cream)]"
                          )}
                        >
                          <Icon
                            className={cn(
                              "shrink-0 transition-colors duration-200",
                              collapsed ? "h-[18px] w-[18px]" : "h-4 w-4",
                              isActive ? "text-[var(--color-brand-cream)]" : "text-[var(--color-brand-cream)]/60 group-hover:text-[var(--color-brand-cream)]"
                            )}
                          />

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

                          {collapsed && isActive && (
                            <span className="absolute right-1.5 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-[var(--color-brand-cream)]" />
                          )}
                        </Link>

                        {collapsed && (
                          <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1.5 rounded-lg bg-[var(--color-brand-green)] border border-[var(--color-brand-cream)]/10 text-xs text-[var(--color-brand-cream)] font-body font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-[60] shadow-xl">
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

        {/* Bottom zone */}
        <div className={cn(
          "shrink-0 border-t border-[var(--color-brand-cream)]/10 py-3",
          collapsed ? "px-2" : "px-3"
        )}>

          <Link
            href="/settings"
            onClick={onClose}
            className={cn(
              "flex items-center rounded-lg text-sm font-body font-medium text-[var(--color-brand-cream)]/60 transition-all duration-200 ease-editorial hover:bg-white/5 hover:text-[var(--color-brand-cream)] mb-2",
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


          <div className={cn(
            "flex items-center",
            collapsed ? "flex-col gap-2" : "justify-between px-2"
          )}>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgba(212,175,55,0.12)] border border-[rgba(212,175,55,0.2)] text-xs font-editorial font-semibold text-gold shrink-0">
              {initials}
            </div>

            <button
              onClick={toggleSidebar}
              type="button"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="hidden md:flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-brand-cream)]/40 hover:bg-white/5 hover:text-[var(--color-brand-cream)] transition-colors"
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
