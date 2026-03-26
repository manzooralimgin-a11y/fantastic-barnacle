"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loading } from "@/components/shared/loading";
import { DataTable } from "@/components/shared/data-table";
import { formatDateTime } from "@/lib/utils";

interface AgentDetail {
    name: string;
    display_name: string;
    autonomy_level: string;
    is_active: boolean;
    description: string;
    config: Record<string, unknown>;
}

interface AgentAction {
    id: number;
    action_type: string;
    description: string;
    status: string;
    created_at: string;
}

export function AgentDetailClient({ agentName }: { agentName: string }) {
    const { data: agent, isLoading: agentLoading } = useQuery<AgentDetail>({
        queryKey: ["agent", agentName],
        queryFn: async () => {
            const { data } = await api.get(`/agents/${agentName}`);
            return data;
        },
    });

    const { data: actions, isLoading: actionsLoading } = useQuery<AgentAction[]>({
        queryKey: ["agent-actions", agentName],
        queryFn: async () => {
            const { data } = await api.get(`/agents/${agentName}/actions`);
            return data;
        },
    });

    if (agentLoading) return <Loading className="py-20" size="lg" />;

    const actionColumns = [
        { key: "action_type", header: "Type" },
        { key: "description", header: "Description" },
        {
            key: "status",
            header: "Status",
            render: (row: AgentAction) => (
                <Badge variant={row.status === "completed" ? "success" : row.status === "failed" ? "destructive" : "warning"}>
                    {row.status}
                </Badge>
            ),
        },
        {
            key: "created_at",
            header: "Time",
            render: (row: AgentAction) => formatDateTime(row.created_at),
        },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-foreground">{agent?.display_name ?? agentName}</h1>
                <p className="text-sm text-muted-foreground">{agent?.description}</p>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Configuration</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Status</span>
                            <Badge variant={agent?.is_active ? "success" : "secondary"}>
                                {agent?.is_active ? "Active" : "Inactive"}
                            </Badge>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Autonomy Level</span>
                            <Badge>{agent?.autonomy_level}</Badge>
                        </div>
                        {agent?.config && Object.entries(agent.config).map(([key, value]) => (
                            <div key={key} className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">{key.replace(/_/g, " ")}</span>
                                <span className="text-sm font-medium text-muted-foreground">{String(value)}</span>
                            </div>
                        ))}
                    </CardContent>
                </Card>

                <div className="lg:col-span-2">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Recent Actions</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <DataTable
                                columns={actionColumns}
                                data={(actions ?? []) as unknown as Record<string, unknown>[]}
                                loading={actionsLoading}
                            />
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
