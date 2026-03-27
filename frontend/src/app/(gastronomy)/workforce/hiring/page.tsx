"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loading } from "@/components/shared/loading";
import { ApiError } from "@/components/shared/api-error";

interface Candidate {
  id: number;
  name: string;
  position: string;
  stage: string;
  applied_date: string;
}

const STAGES = ["new", "screening", "interview", "offer", "hired"];

const STAGE_COLORS: Record<string, string> = {
  new: "bg-blue-50 border-blue-200",
  screening: "bg-yellow-50 border-yellow-200",
  interview: "bg-purple-50 border-purple-200",
  offer: "bg-green-50 border-green-200",
  hired: "bg-brand-50 border-brand-200",
};

const STAGE_LABELS: Record<string, string> = {
  new: "New",
  screening: "Screening",
  interview: "Interview",
  offer: "Offer",
  hired: "Hired",
};

export default function HiringPage() {
  const { data: candidates, isLoading, isError, refetch } = useQuery<Candidate[]>({
    queryKey: ["workforce-hiring"],
    queryFn: async () => {
      const { data } = await api.get("/workforce/hiring");
      return (Array.isArray(data) ? data : []).map((candidate: Record<string, unknown>) => ({
        id: Number(candidate.id),
        name: String(candidate.name || ""),
        position: String(candidate.position || ""),
        stage: String(candidate.status || "new"),
        applied_date: candidate.created_at
          ? new Date(String(candidate.created_at)).toLocaleDateString("de-DE")
          : "",
      }));
    },
    retry: false,
  });

  if (isLoading) return <Loading className="py-20" size="lg" />;
  if (isError) {
    return (
      <ApiError
        message="Failed to load hiring pipeline."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  const grouped = STAGES.reduce<Record<string, Candidate[]>>((acc, stage) => {
    acc[stage] = (candidates ?? []).filter((c) => c.stage === stage);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Hiring Pipeline</h1>
        <p className="text-sm text-muted-foreground">Track candidates through the hiring process</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {STAGES.map((stage) => (
          <div key={stage} className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-muted-foreground">
                {STAGE_LABELS[stage]}
              </h3>
              <Badge variant="secondary">{grouped[stage].length}</Badge>
            </div>
            <div className="space-y-2">
              {grouped[stage].length === 0 ? (
                <div className="rounded-lg border-2 border-dashed border-border p-4 text-center">
                  <p className="text-xs text-muted-foreground">No candidates</p>
                </div>
              ) : (
                grouped[stage].map((candidate) => (
                  <Card
                    key={candidate.id}
                    className={`${STAGE_COLORS[stage] ?? ""}`}
                  >
                    <CardContent className="p-3">
                      <p className="text-sm font-medium text-foreground">
                        {candidate.name}
                      </p>
                      <p className="text-xs text-muted-foreground">{candidate.position}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Applied: {candidate.applied_date}
                      </p>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
