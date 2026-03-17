"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loading } from "@/components/shared/loading";
import { BookOpen } from "lucide-react";

interface TrainingModule {
  id: number;
  title: string;
  description: string;
  category: string;
  duration_minutes: number;
  completion_rate: number;
  is_required: boolean;
}

export default function TrainingPage() {
  const { data: modules, isLoading } = useQuery<TrainingModule[]>({
    queryKey: ["workforce-training"],
    queryFn: async () => {
      const { data } = await api.get("/workforce/training");
      return data;
    },
  });

  if (isLoading) return <Loading className="py-20" size="lg" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Training</h1>
        <p className="text-sm text-muted-foreground">Learning management and training modules</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(modules ?? []).map((mod) => (
          <Card key={mod.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/10">
                    <BookOpen className="h-4 w-4 text-brand-500" />
                  </div>
                  <CardTitle className="text-base">{mod.title}</CardTitle>
                </div>
                {mod.is_required && (
                  <Badge variant="destructive">Required</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-sm text-muted-foreground">{mod.description}</p>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{mod.duration_minutes} min</span>
                <Badge variant="outline">{mod.category}</Badge>
              </div>
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Completion</span>
                  <span className="font-medium text-muted-foreground">{mod.completion_rate}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-brand-500"
                    style={{ width: `${mod.completion_rate}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
