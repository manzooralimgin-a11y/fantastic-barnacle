"use client";

import { useEffect, useMemo, useState } from "react";
import { useRightPanel } from "@/features/hms/pms/components/right-panel/useRightPanel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/components/shared/api-error";
import {
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Loader2,
  Plus,
  Sparkles,
  Wrench,
} from "lucide-react";
import {
  createHousekeepingTask,
  fetchHmsHousekeepingOverview,
  type HousekeepingOverview,
  type HousekeepingTask,
  updateHousekeepingRoomStatus,
  updateHousekeepingTask,
} from "@/lib/hms";
import { cn } from "@/lib/utils";

const filterTabs = ["All", "pending", "in_progress", "done"] as const;

const priorityColors: Record<string, string> = {
  urgent: "bg-red-500/10 text-red-600",
  high: "bg-orange-500/10 text-orange-600",
  normal: "bg-primary/10 text-primary",
  low: "bg-foreground/10 text-foreground-muted",
};

const statusColors: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-600",
  in_progress: "bg-blue-500/10 text-blue-600",
  done: "bg-emerald-500/10 text-emerald-600",
  cancelled: "bg-foreground/10 text-foreground-muted",
};

type TaskFormState = {
  roomId: string;
  taskType: string;
  title: string;
  priority: string;
  assignedTo: string;
  dueDate: string;
};

const defaultTaskForm: TaskFormState = {
  roomId: "",
  taskType: "cleaning",
  title: "",
  priority: "normal",
  assignedTo: "",
  dueDate: "",
};

function formatTaskStatus(status: string) {
  return status.replace(/_/g, " ");
}

export default function HousekeepingPage() {
  const { openPanel } = useRightPanel();
  const [overview, setOverview] = useState<HousekeepingOverview | null>(null);
  const [taskFilter, setTaskFilter] = useState<(typeof filterTabs)[number]>("All");
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingTaskId, setSavingTaskId] = useState<number | null>(null);
  const [savingRoomId, setSavingRoomId] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [taskForm, setTaskForm] = useState<TaskFormState>(defaultTaskForm);

  async function loadOverview() {
    try {
      setLoading(true);
      const nextOverview = await fetchHmsHousekeepingOverview();
      setOverview(nextOverview);
      setFetchError(null);
    } catch (error) {
      console.error("Failed to load housekeeping overview", error);
      setFetchError("Failed to load housekeeping data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOverview();
  }, []);

  const rooms = overview?.rooms ?? [];
  const tasks = overview?.tasks ?? [];

  const filteredTasks = useMemo(() => {
    if (taskFilter === "All") {
      return tasks;
    }
    return tasks.filter((task) => task.status === taskFilter);
  }, [taskFilter, tasks]);

  const stats = [
    {
      label: "Clean Rooms",
      value: rooms.filter((room) => room.housekeeping_status === "clean").length,
      icon: Sparkles,
    },
    {
      label: "Dirty Rooms",
      value: rooms.filter((room) => room.housekeeping_status === "dirty").length,
      icon: Clock,
    },
    {
      label: "Out of Order",
      value: rooms.filter((room) => room.housekeeping_status === "out_of_order").length,
      icon: Wrench,
    },
    {
      label: "Open Tasks",
      value: tasks.filter((task) => task.status !== "done").length,
      icon: ClipboardCheck,
    },
  ];

  async function handleTaskStatusChange(taskId: number, status: string) {
    try {
      setSavingTaskId(taskId);
      await updateHousekeepingTask(taskId, { status });
      await loadOverview();
    } catch (error) {
      console.error("Failed to update housekeeping task", error);
      setFetchError("Failed to update housekeeping task.");
    } finally {
      setSavingTaskId(null);
    }
  }

  async function handleRoomStatusChange(roomId: number, status: string) {
    try {
      setSavingRoomId(roomId);
      await updateHousekeepingRoomStatus(roomId, { status });
      await loadOverview();
    } catch (error) {
      console.error("Failed to update housekeeping room status", error);
      setFetchError("Failed to update room housekeeping status.");
    } finally {
      setSavingRoomId(null);
    }
  }

  async function handleCreateTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    if (!taskForm.roomId || !taskForm.title.trim()) {
      setFormError("Room and task title are required.");
      return;
    }

    try {
      await createHousekeepingTask({
        room_id: Number(taskForm.roomId),
        task_type: taskForm.taskType,
        title: taskForm.title.trim(),
        priority: taskForm.priority,
        assigned_to_name: taskForm.assignedTo || null,
        due_date: taskForm.dueDate || null,
      });
      setTaskForm({
        ...defaultTaskForm,
        roomId: taskForm.roomId,
      });
      await loadOverview();
    } catch (error) {
      console.error("Failed to create housekeeping task", error);
      setFormError("Failed to create housekeeping task.");
    }
  }

  function openRoomNotePanel(roomId: number, roomNumber: string) {
    openPanel({
      type: "room.notes",
      data: {
        roomId: String(roomId),
        roomNumber,
        noteDate: new Date().toISOString().slice(0, 10),
      },
      title: `Room ${roomNumber} Notes`,
    });
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div>
        <h1 className="text-4xl font-editorial font-bold text-foreground tracking-tight">
          Housekeeping
        </h1>
        <p className="text-foreground-muted mt-1">
          Live room cleanliness and housekeeping operations.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="bg-card shadow-[var(--shadow-soft)] border-none">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">
                  {label}
                </p>
                <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                  <Icon className="w-5 h-5" />
                </div>
              </div>
              <h3 className="text-4xl font-editorial font-bold text-foreground">{value}</h3>
            </CardContent>
          </Card>
        ))}
      </div>

      {fetchError && <ApiError message={fetchError} dismissible={false} />}

      <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_1fr] gap-6">
        <Card className="bg-card shadow-[var(--shadow-soft)] border-none overflow-hidden">
          <CardHeader className="border-b border-foreground/10 bg-foreground/[0.02] px-6 py-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <CardTitle className="text-lg font-editorial text-foreground">
                Housekeeping Tasks
              </CardTitle>
              <div className="flex bg-background rounded-xl p-1 border border-foreground/10 w-fit">
                {filterTabs.map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setTaskFilter(tab)}
                    className={cn(
                      "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                      taskFilter === tab
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground-muted hover:text-foreground",
                    )}
                  >
                    {tab === "All" ? tab : formatTaskStatus(tab)}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 flex items-center gap-3 text-foreground-muted">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading housekeeping tasks...
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="p-8 text-sm text-foreground-muted">
                No housekeeping tasks found for this filter.
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="text-[10px] uppercase tracking-widest text-foreground-muted font-bold bg-foreground/[0.01]">
                  <tr>
                    <th className="px-6 py-4">Room</th>
                    <th className="px-6 py-4">Task</th>
                    <th className="px-6 py-4">Priority</th>
                    <th className="px-6 py-4">Assigned</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Due</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-foreground/10">
                  {filteredTasks.map((task) => (
                    <tr key={task.id} className="hover:bg-foreground/[0.01] transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-mono font-bold text-foreground">{task.room_number}</div>
                        <div className="text-xs text-foreground-muted">
                          {task.room_type_name ?? "Unknown room type"}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-foreground">{task.title}</div>
                        <div className="text-xs text-foreground-muted">{task.task_type}</div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge
                          variant="secondary"
                          className={cn(
                            "capitalize text-[10px] font-bold border-transparent rounded-full",
                            priorityColors[task.priority] ?? priorityColors.normal,
                          )}
                        >
                          {task.priority}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-foreground-muted">
                        {task.assigned_to_name || "Unassigned"}
                      </td>
                      <td className="px-6 py-4">
                        <Badge
                          variant="secondary"
                          className={cn(
                            "capitalize text-[10px] font-bold border-transparent rounded-full",
                            statusColors[task.status] ?? "bg-foreground/10 text-foreground-muted",
                          )}
                        >
                          {formatTaskStatus(task.status)}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-foreground-muted">
                        {task.due_date
                          ? new Date(task.due_date).toLocaleDateString("de-DE")
                          : "No due date"}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {task.status === "pending" && (
                            <button
                              type="button"
                              onClick={() => void handleTaskStatusChange(task.id, "in_progress")}
                              className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                              disabled={savingTaskId === task.id}
                            >
                              Start
                            </button>
                          )}
                          {task.status === "in_progress" && (
                            <button
                              type="button"
                              onClick={() => void handleTaskStatusChange(task.id, "done")}
                              className="text-xs font-medium text-emerald-600 hover:underline disabled:opacity-50"
                              disabled={savingTaskId === task.id}
                            >
                              Complete
                            </button>
                          )}
                          {savingTaskId === task.id && (
                            <Loader2 className="w-4 h-4 animate-spin text-foreground-muted" />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="bg-card shadow-[var(--shadow-soft)] border-none">
            <CardHeader className="border-b border-foreground/10 bg-foreground/[0.02] px-6 py-5">
              <CardTitle className="text-lg font-editorial text-foreground">
                Create Housekeeping Task
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <form className="space-y-4" onSubmit={handleCreateTask}>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-foreground-muted">
                    Room
                  </label>
                  <select
                    value={taskForm.roomId}
                    onChange={(event) =>
                      setTaskForm((current) => ({ ...current, roomId: event.target.value }))
                    }
                    className="w-full bg-background border border-foreground/10 rounded-xl px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="">Select room</option>
                    {rooms.map((room) => (
                      <option key={room.room_id} value={room.room_id}>
                        {room.room_number} · {room.room_type_name ?? "Room"}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-foreground-muted">
                      Type
                    </label>
                    <select
                      value={taskForm.taskType}
                      onChange={(event) =>
                        setTaskForm((current) => ({ ...current, taskType: event.target.value }))
                      }
                      className="w-full bg-background border border-foreground/10 rounded-xl px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      <option value="cleaning">Cleaning</option>
                      <option value="inspection">Inspection</option>
                      <option value="maintenance_followup">Maintenance Follow-up</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-foreground-muted">
                      Priority
                    </label>
                    <select
                      value={taskForm.priority}
                      onChange={(event) =>
                        setTaskForm((current) => ({ ...current, priority: event.target.value }))
                      }
                      className="w-full bg-background border border-foreground/10 rounded-xl px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      <option value="low">Low</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-foreground-muted">
                    Title
                  </label>
                  <input
                    value={taskForm.title}
                    onChange={(event) =>
                      setTaskForm((current) => ({ ...current, title: event.target.value }))
                    }
                    className="w-full bg-background border border-foreground/10 rounded-xl px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="Prepare room for arrival"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-foreground-muted">
                      Assigned To
                    </label>
                    <input
                      value={taskForm.assignedTo}
                      onChange={(event) =>
                        setTaskForm((current) => ({ ...current, assignedTo: event.target.value }))
                      }
                      className="w-full bg-background border border-foreground/10 rounded-xl px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="Housekeeping team"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-foreground-muted">
                      Due Date
                    </label>
                    <input
                      type="date"
                      value={taskForm.dueDate}
                      onChange={(event) =>
                        setTaskForm((current) => ({ ...current, dueDate: event.target.value }))
                      }
                      className="w-full bg-background border border-foreground/10 rounded-xl px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>
                {formError && <ApiError message={formError} dismissible={false} />}
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.01]"
                >
                  <Plus className="w-4 h-4" />
                  Add Task
                </button>
              </form>
            </CardContent>
          </Card>

          <Card className="bg-card shadow-[var(--shadow-soft)] border-none overflow-hidden">
            <CardHeader className="border-b border-foreground/10 bg-foreground/[0.02] px-6 py-5">
              <CardTitle className="text-lg font-editorial text-foreground">
                Room Status
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-8 flex items-center gap-3 text-foreground-muted">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading room statuses...
                </div>
              ) : (
                <div className="divide-y divide-foreground/10">
                  {rooms.map((room) => (
                    <div key={room.room_id} className="px-6 py-4 space-y-3">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="font-medium text-foreground">
                            Room {room.room_number}
                          </div>
                          <div className="text-xs text-foreground-muted">
                            {room.room_type_name ?? "Room"} · {room.open_task_count} open tasks
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="secondary"
                            className="border-transparent rounded-full bg-primary/10 text-primary"
                          >
                            {formatTaskStatus(room.housekeeping_status)}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { value: "clean", label: "Mark clean" },
                          { value: "dirty", label: "Mark dirty" },
                          { value: "out_of_order", label: "Out of order" },
                        ].map((action) => (
                          <button
                            key={action.value}
                            type="button"
                            onClick={() => void handleRoomStatusChange(room.room_id, action.value)}
                            disabled={savingRoomId === room.room_id}
                            className="rounded-full border border-foreground/10 px-3 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:border-primary/30 hover:text-foreground disabled:opacity-50"
                          >
                            {action.label}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => openRoomNotePanel(room.room_id, room.room_number)}
                          className="rounded-full border border-foreground/10 px-3 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:border-primary/30 hover:text-foreground"
                        >
                          Room note
                        </button>
                        {savingRoomId === room.room_id && (
                          <Loader2 className="w-4 h-4 animate-spin text-foreground-muted" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
