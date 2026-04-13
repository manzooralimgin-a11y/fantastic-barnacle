"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Sparkles, Smartphone } from "lucide-react";
import { ApiError } from "@/components/shared/api-error";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchPmsTaskOverview, fetchPmsTasks } from "@/features/hms/pms/api/tasks";
import { useRightPanel } from "@/features/hms/pms/components/right-panel/useRightPanel";

const statusFilters = [
  { value: "all",           label: "All" },
  { value: "open",          label: "Open" },
  { value: "in_progress",   label: "In Progress" },
  { value: "done",          label: "Done" },
  { value: "guest_request", label: "Guest Requests" },
];

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "bg-red-500/15 text-red-400 border border-red-500/25",
  normal: "bg-stone-700/40 text-stone-400 border border-stone-600/30",
  low:    "bg-stone-700/20 text-stone-500 border border-stone-700/30",
};

const STATUS_COLORS: Record<string, string> = {
  pending:     "bg-amber-500/15 text-amber-400",
  open:        "bg-amber-500/15 text-amber-400",
  in_progress: "bg-violet-500/15 text-violet-400",
  done:        "bg-emerald-500/15 text-emerald-400",
  inspecting:  "bg-blue-500/15 text-blue-400",
  cancelled:   "bg-stone-700/30 text-stone-500",
};

export default function HotelTasksPage() {
  const { openPanel } = useRightPanel();
  const [status, setStatus] = useState("all");

  const overviewQuery = useQuery({
    queryKey: ["pms", "tasks", "overview"],
    queryFn: () => fetchPmsTaskOverview(),
  });

  const tasksQuery = useQuery({
    queryKey: ["pms", "tasks", status],
    queryFn: () => fetchPmsTasks(
      undefined,
      status === "all" || status === "guest_request" ? undefined : status,
    ),
  });

  const displayedTasks = useMemo(() => {
    const tasks = tasksQuery.data ?? [];
    if (status === "guest_request") {
      return tasks.filter((t) => t.task_source === "guest_request");
    }
    return tasks;
  }, [tasksQuery.data, status]);

  const stats = useMemo(() => {
    const tasks = tasksQuery.data ?? [];
    return {
      total:        tasks.length,
      open:         tasks.filter((t) => t.status === "open" || t.status === "pending").length,
      inProgress:   tasks.filter((t) => t.status === "in_progress").length,
      done:         tasks.filter((t) => t.status === "done").length,
      roomsInScope: overviewQuery.data?.rooms.length ?? 0,
      guestRequests: tasks.filter((t) => t.task_source === "guest_request").length,
    };
  }, [overviewQuery.data?.rooms.length, tasksQuery.data]);

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-editorial font-bold text-foreground tracking-tight">Tasks</h1>
          <p className="text-foreground-muted mt-1">
            PMS operations queue — staff tasks and guest requests in one view.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-foreground/10 bg-card p-1">
          {statusFilters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setStatus(filter.value)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                status === filter.value
                  ? filter.value === "guest_request"
                    ? "bg-[#D4AF37] text-stone-950"
                    : "bg-primary text-primary-foreground"
                  : "text-foreground-muted hover:text-foreground"
              }`}
            >
              {filter.label}
              {filter.value === "guest_request" && stats.guestRequests > 0 && (
                <span className="ml-1.5 rounded-full bg-[#D4AF37]/20 px-1.5 py-0.5 text-[10px] font-bold text-[#D4AF37]">
                  {stats.guestRequests}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {(overviewQuery.error || tasksQuery.error) && (
        <ApiError
          message="Failed to load PMS task data."
          onRetry={() => {
            void overviewQuery.refetch();
            void tasksQuery.refetch();
          }}
          dismissible={false}
        />
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-6">
        {[
          { label: "Visible Tasks",    value: stats.total },
          { label: "Open",             value: stats.open },
          { label: "In Progress",      value: stats.inProgress },
          { label: "Done",             value: stats.done },
          { label: "Rooms in Scope",   value: stats.roomsInScope },
          { label: "Guest Requests",   value: stats.guestRequests, highlight: true },
        ].map((item) => (
          <Card
            key={item.label}
            className={`shadow-[var(--shadow-soft)] border-none ${
              item.highlight && item.value > 0
                ? "bg-[#D4AF37]/8 border border-[#D4AF37]/20"
                : "bg-card"
            }`}
          >
            <CardContent className="p-6">
              <p className={`text-[10px] font-bold uppercase tracking-widest ${
                item.highlight ? "text-[#D4AF37]/70" : "text-foreground-muted"
              }`}>
                {item.label}
              </p>
              <h3 className={`mt-3 text-4xl font-editorial font-bold ${
                item.highlight && item.value > 0 ? "text-[#D4AF37]" : "text-foreground"
              }`}>
                {item.value}
              </h3>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-card shadow-[var(--shadow-soft)] border-none overflow-hidden">
        <CardHeader className="border-b border-foreground/10 bg-foreground/[0.02] px-6 py-5">
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="text-lg font-editorial text-foreground">Operational Queue</CardTitle>
            <div className="flex items-center gap-3">
              {stats.guestRequests > 0 && (
                <span className="flex items-center gap-1.5 rounded-full border border-[#D4AF37]/25 bg-[#D4AF37]/10 px-3 py-1 text-[11px] font-semibold text-[#D4AF37]">
                  <Smartphone className="h-3 w-3" />
                  {stats.guestRequests} via guest app
                </span>
              )}
              <span className="text-xs uppercase tracking-[0.2em] text-foreground-muted">Right panel enabled</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {tasksQuery.isLoading ? (
            <div className="flex items-center gap-3 p-8 text-sm text-foreground-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading tasks...
            </div>
          ) : !displayedTasks.length ? (
            <div className="p-8 text-sm text-foreground-muted">
              {status === "guest_request"
                ? "No guest requests received yet. Guests submit requests via the das elb guest app."
                : "No tasks match the current filter."}
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-foreground/[0.01] text-[10px] font-bold uppercase tracking-widest text-foreground-muted">
                <tr>
                  <th className="px-6 py-4">Task</th>
                  <th className="px-6 py-4">Room</th>
                  <th className="px-6 py-4">Source</th>
                  <th className="px-6 py-4">Priority</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/10">
                {displayedTasks.map((task) => {
                  const isGuest = task.task_source === "guest_request";
                  return (
                    <tr
                      key={task.id}
                      className={`hover:bg-foreground/[0.01] ${isGuest ? "bg-[#D4AF37]/[0.02]" : ""}`}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">{task.title}</span>
                          {isGuest && (
                            <span className="flex items-center gap-1 rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#D4AF37]">
                              <Smartphone className="h-2.5 w-2.5" />
                              Guest
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-foreground-muted mt-0.5">
                          {task.description || task.task_type}
                        </div>
                        {task.guest_booking_ref && (
                          <div className="text-[10px] text-foreground-muted/60 mt-0.5 font-mono">
                            Booking: {task.guest_booking_ref}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-foreground-muted">
                        {task.room_number} · {task.room_type_name || "Room"}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                          isGuest
                            ? "bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20"
                            : "bg-foreground/5 text-foreground-muted"
                        }`}>
                          {isGuest ? "Guest App" : "Staff"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider border ${
                          PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.normal
                        }`}>
                          {task.priority}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                          STATUS_COLORS[task.status] ?? "bg-foreground/5 text-foreground-muted"
                        }`}>
                          {task.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            openPanel({
                              type: "tasks",
                              data: {
                                taskId: String(task.id),
                                roomId: String(task.room_id),
                              },
                              title: isGuest ? `Guest Request · ${task.room_number}` : "Task Details",
                            })
                          }
                          className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                            isGuest
                              ? "border-[#D4AF37]/20 text-[#D4AF37]/70 hover:bg-[#D4AF37]/5"
                              : "border-foreground/10 text-foreground hover:bg-foreground/[0.03]"
                          }`}
                        >
                          Open panel
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card shadow-[var(--shadow-soft)] border-none">
        <CardContent className="flex items-start gap-4 p-6">
          <div className="rounded-2xl bg-[#D4AF37]/10 p-3 text-[#D4AF37]">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-editorial text-foreground">Guest App Integration</h3>
            <p className="mt-1 text-sm text-foreground-muted">
              Requests submitted via the das elb guest app appear here instantly with a{" "}
              <span className="font-semibold text-[#D4AF37]">Guest</span> badge. Use the{" "}
              <span className="font-semibold">Guest Requests</span> filter to isolate them.
              Status updates you make in the panel are reflected live in the guest's app.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
