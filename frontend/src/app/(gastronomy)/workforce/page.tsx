"use client";

import { Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/shared/stat-card";
import { Loading } from "@/components/shared/loading";
import { ApiError } from "@/components/shared/api-error";
import { Users, Clock, DollarSign } from "lucide-react";

interface WorkforceDashboardData {
  total_employees_today: number;
  labor_hours_today: number;
  labor_cost_today: number;
  shifts: Array<{
    id: number;
    employee_name: string;
    role: string;
    start_time: string;
    end_time: string;
    day: string;
  }>;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 14 }, (_, i) => i + 7);

export default function WorkforcePage() {
  const { data, isLoading, isError, refetch } = useQuery<WorkforceDashboardData>({
    queryKey: ["workforce-schedule"],
    queryFn: async () => {
      const [trackerResponse] = await Promise.all([
        api.get("/workforce/labor-tracker"),
        api.get("/workforce/schedule"),
      ]);
      return {
        total_employees_today: trackerResponse.data.active_employees ?? 0,
        labor_hours_today: trackerResponse.data.total_scheduled_hours ?? 0,
        labor_cost_today: trackerResponse.data.total_labor_cost ?? 0,
        shifts: [],
      };
    },
    retry: false,
  });

  if (isLoading) return <Loading className="py-20" size="lg" />;
  if (isError) {
    return (
      <ApiError
        message="Failed to load workforce schedule data."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Workforce</h1>
        <p className="text-sm text-muted-foreground">Schedule management and labor tracking</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          title="Employees Today"
          value={data?.total_employees_today ?? 0}
          icon={Users}
        />
        <StatCard
          title="Labor Hours"
          value={`${data?.labor_hours_today ?? 0}h`}
          icon={Clock}
        />
        <StatCard
          title="Labor Cost"
          value={`€${(data?.labor_cost_today ?? 0).toLocaleString()}`}
          icon={DollarSign}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Weekly Schedule</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="min-w-[700px]">
              <div className="grid grid-cols-8 gap-px bg-border rounded-lg overflow-hidden">
                <div className="bg-muted p-2 text-xs font-medium text-muted-foreground">Time</div>
                {DAYS.map((day) => (
                  <div key={day} className="bg-muted p-2 text-center text-xs font-medium text-muted-foreground">
                    {day}
                  </div>
                ))}
                {HOURS.map((hour) => (
                  <Fragment key={`hour-${hour}`}>
                    <div key={`h-${hour}`} className="bg-card p-2 text-xs text-muted-foreground">
                      {hour}:00
                    </div>
                    {DAYS.map((day) => (
                      <div
                        key={`${day}-${hour}`}
                        className="bg-card p-1 min-h-[32px]"
                      >
                        {(data?.shifts ?? [])
                          .filter(
                            (s) =>
                              s.day === day &&
                              parseInt(s.start_time) <= hour &&
                              parseInt(s.end_time) > hour
                          )
                          .map((s) => (
                            <div
                              key={s.id}
                              className="rounded bg-brand-500/10 px-1 py-0.5 text-[10px] text-brand-600 truncate"
                            >
                              {s.employee_name}
                            </div>
                        ))}
                      </div>
                    ))}
                  </Fragment>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
