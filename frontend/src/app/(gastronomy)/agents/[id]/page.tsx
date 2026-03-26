import { AgentDetailClient } from "./agent-detail-client";

export const dynamicParams = false;

export function generateStaticParams() {
  const agents = [
    "manager", "finance", "inventory", "labor", "quality", "guest", "supply", "energy", "marketing"
  ];
  return agents.map((agent) => ({
    id: agent,
  }));
}

import { use } from "react";

export default function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = use(params);
  const id = unwrappedParams.id;
  return <AgentDetailClient agentName={id} />;
}
