"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/shared/loading";
import { FlaskConical, Plus } from "lucide-react";

interface Scenario {
  id: number;
  name: string;
  type: string;
  description: string;
  last_run_status: string;
  last_run_at: string;
  created_at: string;
}

const STATUS_VARIANT: Record<string, "success" | "destructive" | "warning" | "secondary"> = {
  completed: "success",
  failed: "destructive",
  running: "warning",
  pending: "secondary",
};

export default function SimulationPage() {
  const { data: scenarios, isLoading } = useQuery<Scenario[]>({
    queryKey: ["simulation-scenarios"],
    queryFn: async () => {
      const { data } = await api.get("/simulation/scenarios");
      return data;
    },
  });

  if (isLoading) return <Loading className="py-20" size="lg" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Simulation</h1>
          <p className="text-sm text-muted-foreground">What-if scenario builder and analysis</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          New Scenario
        </Button>
      </div>

      {(scenarios ?? []).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FlaskConical className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold text-foreground">No scenarios yet</h3>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              Create your first simulation scenario to test business decisions before implementing them.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(scenarios ?? []).map((scenario) => (
            <Card key={scenario.id} className="cursor-pointer transition-shadow hover:shadow-md">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{scenario.name}</CardTitle>
                  <Badge variant={STATUS_VARIANT[scenario.last_run_status] ?? "secondary"}>
                    {scenario.last_run_status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-sm text-muted-foreground">{scenario.description}</p>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <Badge variant="outline">{scenario.type}</Badge>
                  <span>Last run: {scenario.last_run_at ?? "Never"}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
