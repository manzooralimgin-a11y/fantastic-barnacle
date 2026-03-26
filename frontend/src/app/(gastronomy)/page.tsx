"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BellRing,
  CalendarDays,
  Package,
  ReceiptText,
  Sparkles,
  Activity,
  Clock,
} from "lucide-react";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { useDashboardStore } from "@/stores/dashboard-store";
import { LiveMetrics } from "@/components/dashboard/live-metrics";
import { AgentActivityFeed } from "@/components/dashboard/agent-activity";
import { AlertsPanel } from "@/components/dashboard/alerts-panel";
import { AiChat } from "@/components/dashboard/ai-chat";
import { ExceptionInbox } from "@/components/dashboard/exception-inbox";
import { ExplainableAICards } from "@/components/dashboard/explainable-ai-cards";
import { AuditTimeline } from "@/components/dashboard/audit-timeline";
import { hasRoleAccess } from "@/lib/navigation";
import {
  MotionStagger,
  ScrollReveal,
  AnimatedCounter,
  StatusDot,
  staggerItem,
} from "@/components/ui/motion";
import { motion } from "framer-motion";

/* ── Types ── */
interface TodayStripData {
  reservationsToday: number | null;
  openOrders: number | null;
  lowStockItems: number | null;
  criticalAlerts: number;
}

interface FocusCard {
  title: string;
  description: string;
  href: string;
}

function formatToday() {
  return new Date().toISOString().slice(0, 10);
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 6) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function getTimeString() {
  return new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ── Component ── */
export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const role = user?.role;
  const alerts = useDashboardStore((s) => s.alerts);
  const setKPIs = useDashboardStore((s) => s.setKPIs);
  const setAlerts = useDashboardStore((s) => s.setAlerts);
  const setAgentActivity = useDashboardStore((s) => s.setAgentActivity);
  const setExceptions = useDashboardStore((s) => s.setExceptions);
  const setRecommendations = useDashboardStore((s) => s.setRecommendations);
  const setAuditTimeline = useDashboardStore((s) => s.setAuditTimeline);
  const [time, setTime] = useState(getTimeString());
  const [todayStrip, setTodayStrip] = useState<TodayStripData>({
    reservationsToday: null,
    openOrders: null,
    lowStockItems: null,
    criticalAlerts: 0,
  });

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setTime(getTimeString()), 30000);
    return () => clearInterval(t);
  }, []);

  // Fetch dashboard data — guard with token so we never fire unauthenticated
  // requests that would generate 401s and trigger the redirect interceptor.
  useEffect(() => {
    if (!token) return;
    api.get("/dashboard/kpis").then(({ data }) => setKPIs(data)).catch(() => {});
    api.get("/dashboard/alerts").then(({ data }) => setAlerts(data)).catch(() => {});
    api.get("/dashboard/activity").then(({ data }) => setAgentActivity(data)).catch(() => {});
    api.get("/dashboard/exceptions").then(({ data }) => setExceptions(data)).catch(() => {});
    api.get("/dashboard/recommendations").then(({ data }) => setRecommendations(data)).catch(() => {});
    api.get("/dashboard/audit-timeline").then(({ data }) => setAuditTimeline(data)).catch(() => {});
  }, [token, setKPIs, setAlerts, setAgentActivity, setExceptions, setRecommendations, setAuditTimeline]);

  useEffect(() => {
    setTodayStrip((prev) => ({
      ...prev,
      criticalAlerts: alerts.filter((a) => a.severity === "critical" && !a.is_read).length,
    }));
  }, [alerts]);

  useEffect(() => {
    if (!token) return;
    api.get("/reservations", { params: { reservation_date: formatToday() } })
      .then(({ data }) => setTodayStrip((p) => ({ ...p, reservationsToday: Array.isArray(data) ? data.length : 0 })))
      .catch(() => setTodayStrip((p) => ({ ...p, reservationsToday: null })));

    api.get("/billing/orders")
      .then(({ data }) => setTodayStrip((p) => ({ ...p, openOrders: Array.isArray(data) ? data.length : 0 })))
      .catch(() => setTodayStrip((p) => ({ ...p, openOrders: null })));

    if (hasRoleAccess(role, "manager")) {
      api.get("/inventory/low-stock")
        .then(({ data }) => setTodayStrip((p) => ({ ...p, lowStockItems: Array.isArray(data) ? data.length : 0 })))
        .catch(() => setTodayStrip((p) => ({ ...p, lowStockItems: null })));
    }
  }, [token, role]);

  const focusCards = useMemo<FocusCard[]>(() => {
    if (role === "admin") {
      return [
        { title: "Financial Control", description: "Track top line, margin risk, and exceptions.", href: "/reports" },
        { title: "Agent Oversight", description: "Review agent actions and approve sensitive changes.", href: "/agents" },
        { title: "Franchise Intelligence", description: "Compare locations and replication opportunities.", href: "/franchise" },
      ];
    }
    if (role === "manager") {
      return [
        { title: "Service Operations", description: "Seat, pace, and close service faster.", href: "/reservations" },
        { title: "Inventory Action", description: "Review low stock and raise purchase orders.", href: "/inventory" },
        { title: "Guest Retention", description: "Find churn-risk guests and trigger recovery.", href: "/guests" },
      ];
    }
    return [
      { title: "Live Floor View", description: "Reservations, walk-ins, and table status.", href: "/reservations" },
      { title: "Open Orders", description: "Track active bills and close checks.", href: "/billing" },
      { title: "Kitchen Queue", description: "Prep status and handoff timing.", href: "/kitchen" },
    ];
  }, [role]);

  const systemHealthy = todayStrip.criticalAlerts === 0;
  const firstName = user?.full_name?.split(" ")[0] || "there";

  return (
    <div className="space-y-12 lg:space-y-16">
      {/* ═══ Hero Section — Editorial, dramatic ═══ */}
      <ScrollReveal>
        <div className="relative pt-4 lg:pt-8">
          <div className="flex items-end justify-between">
            <div className="space-y-3">
              <h1 className="text-4xl md:text-5xl lg:text-7xl font-editorial font-normal text-foreground tracking-tight leading-[0.95]">
                {getGreeting()},
                <br />
                <span className="text-gold-shimmer font-normal">{firstName}</span>
              </h1>
              <div className="flex items-center gap-4 text-sm font-body text-foreground-muted pt-2">
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-foreground-dim" />
                  {time}
                </span>
                <span className="text-foreground-dim">·</span>
                <span className="flex items-center gap-1.5">
                  <StatusDot status={systemHealthy ? "success" : "warning"} pulse={!systemHealthy} />
                  {systemHealthy ? "All systems nominal" : `${todayStrip.criticalAlerts} alert${todayStrip.criticalAlerts > 1 ? "s" : ""}`}
                </span>
              </div>
            </div>
            <div className="hidden lg:flex items-center gap-2 text-xs font-body text-foreground-dim uppercase tracking-[0.15em]">
              <Activity className="h-3 w-3" />
              <span>Command Center</span>
            </div>
          </div>

          {/* Editorial divider */}
          <div className="divider-gold mt-8" />
        </div>
      </ScrollReveal>

      {/* ═══ Metric Strip — Asymmetric: first card 2-col, rest single ═══ */}
      <MotionStagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-12">
        {/* Reservations — spans 2 cols on xl, featured glass */}
        <motion.div variants={staggerItem} className="xl:col-span-5">
          <div className="glass-card-featured p-6 h-full">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[rgba(106,173,207,0.08)] border border-[rgba(106,173,207,0.12)]">
                <CalendarDays className="h-5 w-5 text-status-info" />
              </div>
              <span className="text-xs font-body font-semibold text-foreground-muted uppercase tracking-[0.1em]">Reservations Today</span>
            </div>
            <AnimatedCounter
              value={todayStrip.reservationsToday}
              className="text-4xl font-editorial font-normal text-gold"
            />
          </div>
        </motion.div>

        {/* Open Orders */}
        <motion.div variants={staggerItem} className="xl:col-span-3">
          <div className="glass-card p-5 h-full">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[rgba(82,183,136,0.08)] border border-[rgba(82,183,136,0.12)]">
                <ReceiptText className="h-4 w-4 text-emerald" />
              </div>
              <span className="text-xs font-body font-semibold text-foreground-muted uppercase tracking-[0.1em]">Open Orders</span>
            </div>
            <AnimatedCounter
              value={todayStrip.openOrders}
              className="text-2xl font-editorial font-normal text-foreground"
            />
          </div>
        </motion.div>

        {/* Low Stock */}
        <motion.div variants={staggerItem} className="xl:col-span-2">
          <div className="glass-card p-5 h-full">
            <div className="flex items-center gap-2 mb-2">
              <Package className="h-4 w-4 text-foreground-dim" />
              <span className="text-[10px] font-body font-semibold text-foreground-dim uppercase tracking-[0.1em]">Low Stock</span>
            </div>
            <AnimatedCounter
              value={todayStrip.lowStockItems}
              className="text-2xl font-editorial font-normal text-foreground"
            />
          </div>
        </motion.div>

        {/* Critical Alerts */}
        <motion.div variants={staggerItem} className="xl:col-span-2">
          <div className={`glass-card p-5 h-full ${todayStrip.criticalAlerts > 0 ? "border-status-danger/30" : ""}`}>
            <div className="flex items-center gap-2 mb-2">
              <BellRing className={`h-4 w-4 ${todayStrip.criticalAlerts > 0 ? "text-status-danger" : "text-foreground-dim"}`} />
              <span className="text-[10px] font-body font-semibold text-foreground-dim uppercase tracking-[0.1em]">Alerts</span>
            </div>
            <AnimatedCounter
              value={todayStrip.criticalAlerts}
              className={`text-2xl font-editorial font-normal ${todayStrip.criticalAlerts > 0 ? "text-status-danger" : "text-foreground"}`}
            />
          </div>
        </motion.div>
      </MotionStagger>

      {/* ═══ AI Focus Cards — Asymmetric 5/4/3 split ═══ */}
      <MotionStagger className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {focusCards.map((card, i) => (
          <motion.div
            key={card.title}
            variants={staggerItem}
            className={i === 0 ? "lg:col-span-5" : i === 1 ? "lg:col-span-4" : "lg:col-span-3"}
          >
            <Link href={card.href} className="block group h-full">
              <div className="glass-card-featured p-6 h-full transition-all duration-300">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="h-3.5 w-3.5 text-gold-dim" />
                  <span className="text-[10px] font-body font-semibold uppercase tracking-[0.15em] text-gold-dim">
                    AI Recommended
                  </span>
                </div>
                <h3 className="text-xl font-editorial font-semibold text-foreground mb-2">{card.title}</h3>
                <p className="text-sm font-body text-foreground-muted leading-relaxed">{card.description}</p>
                <div className="mt-5 flex items-center gap-1.5 text-sm font-body font-medium text-gold">
                  <span>Explore</span>
                  <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1.5" />
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
      </MotionStagger>

      {/* ═══ Live Metrics ═══ */}
      <ScrollReveal delay={0.1}>
        <LiveMetrics />
      </ScrollReveal>

      {/* ═══ Activity + Alerts — Asymmetric 7/5 split ═══ */}
      <ScrollReveal delay={0.1} className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <AgentActivityFeed />
        </div>
        <div className="lg:col-span-5">
          <AlertsPanel />
        </div>
      </ScrollReveal>

      {/* ═══ Exceptions + AI + Audit — Asymmetric 5/4/3 split ═══ */}
      <ScrollReveal delay={0.1} className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="xl:col-span-5">
          <ExceptionInbox />
        </div>
        <div className="xl:col-span-4">
          <ExplainableAICards />
        </div>
        <div className="xl:col-span-3">
          <AuditTimeline />
        </div>
      </ScrollReveal>

      {/* ═══ AI Chat ═══ */}
      <ScrollReveal delay={0.1}>
        <AiChat />
      </ScrollReveal>
    </div>
  );
}
