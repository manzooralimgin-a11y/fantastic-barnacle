"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/shared/stat-card";
import { Loading } from "@/components/shared/loading";
import { formatDateTime } from "@/lib/utils";
import { ShieldCheck, Thermometer, ClipboardCheck } from "lucide-react";

interface ComplianceScore {
  overall_score: number;
  food_safety_score: number;
  hygiene_score: number;
  temperature_compliance: number;
}

interface HACCPEntry {
  id: number;
  checkpoint: string;
  status: string;
  temperature: number;
  recorded_by: string;
  recorded_at: string;
  notes: string;
}

export default function SafetyPage() {
  const { data: score, isLoading: scoreLoading } = useQuery<ComplianceScore>({
    queryKey: ["safety-compliance"],
    queryFn: async () => {
      const { data } = await api.get("/safety/compliance-score");
      return data;
    },
  });

  const { data: haccp, isLoading: haccpLoading } = useQuery<HACCPEntry[]>({
    queryKey: ["safety-haccp"],
    queryFn: async () => {
      const { data } = await api.get("/safety/haccp");
      return data;
    },
  });

  if (scoreLoading && haccpLoading) return <Loading className="py-20" size="lg" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Safety & Compliance</h1>
        <p className="text-sm text-muted-foreground">HACCP monitoring and compliance tracking</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <Card className="lg:col-span-1">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <div className="relative mb-3">
              <svg className="h-32 w-32" viewBox="0 0 100 100">
                <circle
                  className="text-muted"
                  strokeWidth="8"
                  stroke="currentColor"
                  fill="transparent"
                  r="42"
                  cx="50"
                  cy="50"
                />
                <circle
                  className="text-brand-500"
                  strokeWidth="8"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="transparent"
                  r="42"
                  cx="50"
                  cy="50"
                  strokeDasharray={`${(score?.overall_score ?? 0) * 2.64} 264`}
                  transform="rotate(-90 50 50)"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-3xl font-bold text-foreground">
                  {score?.overall_score ?? 0}%
                </span>
              </div>
            </div>
            <p className="text-sm font-medium text-muted-foreground">Compliance Score</p>
          </CardContent>
        </Card>

        <div className="lg:col-span-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            title="Food Safety"
            value={`${score?.food_safety_score ?? 0}%`}
            icon={ShieldCheck}
          />
          <StatCard
            title="Hygiene Score"
            value={`${score?.hygiene_score ?? 0}%`}
            icon={ClipboardCheck}
          />
          <StatCard
            title="Temperature Compliance"
            value={`${score?.temperature_compliance ?? 0}%`}
            icon={Thermometer}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent HACCP Logs</CardTitle>
        </CardHeader>
        <CardContent>
          {haccpLoading ? (
            <Loading className="py-8" />
          ) : (haccp ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No HACCP entries</p>
          ) : (
            <div className="space-y-2">
              {(haccp ?? []).slice(0, 10).map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between rounded-lg border border-border p-3"
                >
                  <div className="flex items-center gap-3">
                    <Badge
                      variant={
                        entry.status === "pass"
                          ? "success"
                          : entry.status === "warning"
                          ? "warning"
                          : "destructive"
                      }
                    >
                      {entry.status}
                    </Badge>
                    <div>
                      <p className="text-sm font-medium text-foreground">{entry.checkpoint}</p>
                      <p className="text-xs text-muted-foreground">
                        {entry.recorded_by} &middot; {formatDateTime(entry.recorded_at)}
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-mono text-muted-foreground">
                    {entry.temperature}&deg;F
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
