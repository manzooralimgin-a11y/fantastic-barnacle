"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { fetchPmsTasks } from "@/features/hms/pms/api/tasks";
import { useRightPanel } from "@/features/hms/pms/components/right-panel/useRightPanel";
import type { RightPanelInstance } from "@/features/hms/pms/components/right-panel/RightPanelProvider";

type Props = {
  panel: RightPanelInstance<"tasks">;
};

export function TasksPanel({ panel }: Props) {
  const { closePanel } = useRightPanel();
  const query = useQuery({
    queryKey: ["pms", "tasks-panel", panel.data.roomId],
    queryFn: () => fetchPmsTasks(),
  });

  const tasks = useMemo(() => {
    if (!panel.data.roomId) {
      return query.data || [];
    }
    return (query.data || []).filter((task) => String(task.room_id) === String(panel.data.roomId));
  }, [panel.data.roomId, query.data]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-editorial font-bold text-foreground">Tasks</h2>
        <p className="text-sm text-foreground-muted mt-1">Housekeeping and operational tasks linked to this stay or room.</p>
      </div>
      {query.isLoading ? (
        <div className="flex items-center gap-3 text-sm text-foreground-muted">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading tasks...
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <div key={task.id} className="rounded-2xl border border-foreground/10 bg-background p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-foreground">{task.title}</div>
                  <div className="text-xs text-foreground-muted">{task.room_number} · {task.task_type}</div>
                </div>
                <div className="text-xs uppercase tracking-wider text-foreground-muted">{task.status}</div>
              </div>
            </div>
          ))}
          {!tasks.length && <p className="text-sm text-foreground-muted">No tasks found for this context.</p>}
        </div>
      )}
      <div className="flex justify-end">
        <button type="button" onClick={() => closePanel(panel.id)} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-foreground-muted hover:bg-foreground/5 transition-colors">Close</button>
      </div>
    </div>
  );
}

