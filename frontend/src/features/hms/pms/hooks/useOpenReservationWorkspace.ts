"use client";

import type { RightPanelInstance } from "@/features/hms/pms/components/right-panel/RightPanelProvider";
import { useRightPanel } from "@/features/hms/pms/components/right-panel/useRightPanel";

export function useOpenReservationWorkspace() {
  const { activePanel, openPanel, replacePanel } = useRightPanel();

  return (reservationId: string | number, title = "Reservation Workspace") => {
    const nextReservationId = String(reservationId);
    const activeWorkspacePanel =
      activePanel?.type === "reservation.workspace"
        ? (activePanel as RightPanelInstance<"reservation.workspace">)
        : null;

    if (activeWorkspacePanel?.data.reservationId === nextReservationId) {
      return;
    }

    const panel = {
      type: "reservation.workspace" as const,
      data: { reservationId: nextReservationId },
      title,
    };

    if (activeWorkspacePanel) {
      replacePanel(panel);
      return;
    }

    openPanel(panel);
  };
}
