"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/shared/stat-card";
import { Loading } from "@/components/shared/loading";
import { formatNumber } from "@/lib/utils";
import { Heart, Users, Star, Award } from "lucide-react";

interface LoyaltyData {
  total_members: number;
  active_members: number;
  points_redeemed_this_month: number;
  tier_distribution: Array<{
    tier: string;
    count: number;
  }>;
}

const TIER_COLORS: Record<string, string> = {
  bronze: "bg-emerald-100 text-emerald-800",
  silver: "bg-gray-200 text-gray-700",
  gold: "bg-yellow-100 text-yellow-800",
  platinum: "bg-purple-100 text-purple-800",
};

export default function LoyaltyPage() {
  const { data, isLoading } = useQuery<LoyaltyData>({
    queryKey: ["guests-loyalty"],
    queryFn: async () => {
      const { data } = await api.get("/guests/loyalty");
      return data;
    },
  });

  if (isLoading) return <Loading className="py-20" size="lg" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Loyalty Program</h1>
        <p className="text-sm text-muted-foreground">Member tiers and rewards overview</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          title="Total Members"
          value={formatNumber(data?.total_members ?? 0)}
          icon={Users}
        />
        <StatCard
          title="Active Members"
          value={formatNumber(data?.active_members ?? 0)}
          icon={Heart}
        />
        <StatCard
          title="Points Redeemed"
          value={formatNumber(data?.points_redeemed_this_month ?? 0)}
          icon={Star}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tier Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted mb-6">
            <p className="text-sm text-muted-foreground">Tier distribution chart placeholder</p>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {(data?.tier_distribution ?? []).map((tier) => (
              <div
                key={tier.tier}
                className={`rounded-lg p-4 text-center ${TIER_COLORS[tier.tier] ?? "bg-muted text-muted-foreground"}`}
              >
                <Award className="mx-auto h-6 w-6 mb-2" />
                <p className="text-lg font-bold">{tier.count}</p>
                <p className="text-xs font-medium capitalize">{tier.tier}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
