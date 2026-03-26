"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loading } from "@/components/shared/loading";
import { Bot } from "lucide-react";

interface AgentConfig {
  id: number;
  agent_name: string;
  autonomy_level: string;
  thresholds_json: {
    display_name?: string;
    description?: string;
  } | null;
  is_active: boolean;
}

const AUTONOMY_VARIANT: Record<string, "default" | "warning" | "secondary"> = {
  full: "default",
  supervised: "warning",
  manual: "secondary",
};

function formatAgentName(name: string): string {
  return name.replace(/Agent$/, " Agent").replace(/([a-z])([A-Z])/g, "$1 $2");
}

export default function AgentsPage() {
  const { data: agents, isLoading, error } = useQuery<AgentConfig[]>({
    queryKey: ["agents"],
    queryFn: async () => {
      const { data } = await api.get("/agents");
      return data;
    },
  });

  if (isLoading) return <Loading className="py-20" size="lg" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Agent Fleet</h1>
        <p className="text-sm text-muted-foreground">Monitor and manage your AI agents</p>
      </div>

      {error ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-red-500">
            Failed to load agents. Please try again.
          </CardContent>
        </Card>
      ) : agents && agents.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No agents configured yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {(agents ?? []).map((agent) => {
            const displayName = agent.thresholds_json?.display_name || formatAgentName(agent.agent_name);
            const description = agent.thresholds_json?.description || "AI agent";

            return (
              <Link key={agent.agent_name} href={`/agents/${agent.agent_name}`}>
                <Card className="cursor-pointer transition-shadow hover:shadow-md">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Bot className="h-5 w-5 text-brand-500" />
                        {displayName}
                      </CardTitle>
                      <div
                        className={`h-2.5 w-2.5 rounded-full ${
                          agent.is_active ? "bg-green-500" : "bg-muted-foreground"
                        }`}
                      />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="mb-3 text-sm text-muted-foreground">{description}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant={AUTONOMY_VARIANT[agent.autonomy_level] ?? "secondary"}>
                        {agent.autonomy_level}
                      </Badge>
                      <Badge variant={agent.is_active ? "default" : "secondary"}>
                        {agent.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
