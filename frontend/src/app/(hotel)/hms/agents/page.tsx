"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bot, TrendingUp, Users, Sparkles, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

const agents = [
  { name: "Revenue Optimizer", description: "Dynamic pricing and yield management powered by market data", status: "active" as const, tasks_today: 24, accuracy: 94, icon: TrendingUp },
  { name: "Guest Concierge", description: "AI-powered guest assistance and recommendation engine", status: "active" as const, tasks_today: 18, accuracy: 91, icon: Users },
  { name: "Housekeeping Scheduler", description: "Optimal room cleaning schedules based on occupancy patterns", status: "active" as const, tasks_today: 12, accuracy: 97, icon: Sparkles },
  { name: "Pricing Engine", description: "Competitor analysis and real-time rate adjustment", status: "paused" as const, tasks_today: 0, accuracy: 89, icon: Bot },
  { name: "Review Responder", description: "Automated guest review analysis and response drafting", status: "learning" as const, tasks_today: 6, accuracy: 82, icon: MessageSquare },
];

const statusColors: Record<string, string> = { active: "bg-emerald-500/10 text-emerald-600", paused: "bg-amber-500/10 text-amber-600", learning: "bg-blue-500/10 text-blue-600" };

export default function AgentsPage() {
  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div><h1 className="text-4xl font-editorial font-bold text-foreground tracking-tight">AI Agents</h1><p className="text-foreground-muted mt-1">Intelligent automation for hotel operations</p></div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {agents.map(a => (
          <Card key={a.name} className="bg-card shadow-[var(--shadow-soft)] border-none hover:translate-y-[-2px] transition-all duration-300">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div className="p-3 rounded-xl bg-primary/10 text-primary"><a.icon className="w-6 h-6" /></div>
                <Badge variant="secondary" className={cn("capitalize text-[10px] font-bold border-transparent rounded-full", statusColors[a.status])}>{a.status}</Badge>
              </div>
              <div>
                <h3 className="text-lg font-editorial font-bold text-foreground">{a.name}</h3>
                <p className="text-xs text-foreground-muted mt-1">{a.description}</p>
              </div>
              <div className="flex justify-between text-xs border-t border-foreground/10 pt-3">
                <span className="text-foreground-muted">Tasks today: <span className="font-mono text-foreground">{a.tasks_today}</span></span>
                <span className="text-foreground-muted">Accuracy: <span className="font-mono text-foreground">{a.accuracy}%</span></span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
