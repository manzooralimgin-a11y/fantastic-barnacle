"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { RightPanelInstance } from "@/features/hms/pms/components/right-panel/RightPanelProvider";
import { useRightPanel } from "@/features/hms/pms/components/right-panel/useRightPanel";
import { GuestDetailsPanel } from "@/features/hms/pms/panels/GuestDetailsPanel";
import { InvoiceDetailPanel } from "@/features/hms/pms/panels/InvoiceDetailPanel";
import { PaymentsPanel } from "@/features/hms/pms/panels/PaymentsPanel";
import { ReservationCreatePanel } from "@/features/hms/pms/panels/ReservationCreatePanel";
import { ReservationEditPanel } from "@/features/hms/pms/panels/ReservationEditPanel";
import { ReservationWorkspacePanel } from "@/features/hms/pms/panels/ReservationWorkspacePanel";
import { RoomNotesPanel } from "@/features/hms/pms/panels/RoomNotesPanel";
import { TasksPanel } from "@/features/hms/pms/panels/TasksPanel";

type PanelComponent = (props: { panel: RightPanelInstance }) => React.ReactNode;

const PANEL_COMPONENTS: Record<string, PanelComponent> = {
  "invoice.detail": InvoiceDetailPanel as PanelComponent,
  "reservation.workspace": ReservationWorkspacePanel as PanelComponent,
  "reservation.create": ReservationCreatePanel as PanelComponent,
  "reservation.edit": ReservationEditPanel as PanelComponent,
  "guest.details": GuestDetailsPanel as PanelComponent,
  "room.notes": RoomNotesPanel as PanelComponent,
  payments: PaymentsPanel as PanelComponent,
  tasks: TasksPanel as PanelComponent,
};

function RightPanelHostInner() {
  const {
    activePanel,
    cancelPendingClose,
    closePanel,
    discardPendingClose,
    pendingClosePanel,
    savePendingClose,
  } = useRightPanel();

  const ActiveComponent = activePanel ? PANEL_COMPONENTS[activePanel.type] : null;

  return (
    <>
      <Dialog open={Boolean(activePanel)} onOpenChange={(open) => !open && closePanel()}>
        {activePanel && ActiveComponent && (
          <DialogContent className="left-auto right-0 top-0 h-screen max-w-[720px] translate-x-0 translate-y-0 rounded-none border-l border-foreground/10 bg-card p-0 sm:rounded-none">
            <DialogHeader className="border-b border-foreground/10 bg-foreground/[0.02] px-6 py-5">
              <DialogTitle className="font-editorial text-foreground">
                {activePanel.title || "Workspace"}
              </DialogTitle>
            </DialogHeader>
            <div className="h-[calc(100vh-78px)] overflow-y-auto p-6">
              <ActiveComponent panel={activePanel} />
            </div>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={Boolean(pendingClosePanel)} onOpenChange={(open) => !open && cancelPendingClose()}>
        {pendingClosePanel && (
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="font-editorial">Unsaved changes</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-foreground-muted">
                This panel has unsaved changes. Save them before closing or discard them.
              </p>
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={cancelPendingClose}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold text-foreground-muted hover:bg-foreground/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={discardPendingClose}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold text-foreground hover:bg-foreground/5 transition-colors"
                >
                  Discard changes
                </button>
                <button
                  type="button"
                  onClick={() => void savePendingClose()}
                  className="bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity"
                >
                  Save changes
                </button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

export function RightPanelHost() {
  return <RightPanelHostInner />;
}
