"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

export type RightPanelType =
  | "invoice.detail"
  | "reservation.workspace"
  | "reservation.create"
  | "reservation.edit"
  | "guest.details"
  | "room.notes"
  | "payments"
  | "tasks";

export type RightPanelPayloadMap = {
  "invoice.detail": {
    invoiceId: string;
    focus?: "overview" | "payment" | "documents";
  };
  "reservation.workspace": {
    reservationId: string;
  };
  "reservation.create": {
    propertyId: string;
    date?: string;
    roomId?: string;
    roomCategoryId?: string;
  };
  "reservation.edit": {
    reservationId: string;
  };
  "guest.details": {
    contactId: string;
  };
  "room.notes": {
    roomId: string;
    roomNumber?: string;
    noteDate?: string;
  };
  payments: {
    reservationId?: string;
    invoiceId?: string;
  };
  tasks: {
    reservationId?: string;
    roomId?: string;
    taskId?: string;
  };
};

export type RightPanelInstance<T extends RightPanelType = RightPanelType> = {
  id: string;
  type: T;
  data: RightPanelPayloadMap[T];
  title?: string;
  dirty?: boolean;
};

type SubmitHandler = () => Promise<boolean | void> | boolean | void;

export type RightPanelContextValue = {
  panels: RightPanelInstance[];
  activePanel: RightPanelInstance | null;
  pendingClosePanel: RightPanelInstance | null;
  openPanel: <T extends RightPanelType>(panel: {
    type: T;
    data: RightPanelPayloadMap[T];
    title?: string;
  }) => void;
  replacePanel: <T extends RightPanelType>(panel: {
    type: T;
    data: RightPanelPayloadMap[T];
    title?: string;
  }) => void;
  closePanel: (panelId?: string) => void;
  setDirty: (panelId: string, dirty: boolean) => void;
  registerSubmitHandler: (panelId: string, handler: SubmitHandler | null) => void;
  discardPendingClose: () => void;
  cancelPendingClose: () => void;
  savePendingClose: () => Promise<void>;
};

const RightPanelContext = createContext<RightPanelContextValue | null>(null);

function createPanelId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `panel-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function RightPanelProvider({ children }: { children: React.ReactNode }) {
  const [panels, setPanels] = useState<RightPanelInstance[]>([]);
  const [pendingClosePanelId, setPendingClosePanelId] = useState<string | null>(null);
  const submitHandlers = useRef(new Map<string, SubmitHandler>());

  const activePanel = panels.length ? panels[panels.length - 1] : null;
  const pendingClosePanel = panels.find((panel) => panel.id === pendingClosePanelId) ?? null;

  const openPanel = useCallback<RightPanelContextValue["openPanel"]>((panel) => {
    setPanels((current) => [
      ...current,
      {
        id: createPanelId(),
        type: panel.type,
        data: panel.data,
        title: panel.title,
        dirty: false,
      },
    ]);
  }, []);

  const replacePanel = useCallback<RightPanelContextValue["replacePanel"]>((panel) => {
    setPanels((current) => {
      const next = current.slice(0, -1);
      next.push({
        id: createPanelId(),
        type: panel.type,
        data: panel.data,
        title: panel.title,
        dirty: false,
      });
      return next;
    });
  }, []);

  const removePanel = useCallback((panelId: string) => {
    submitHandlers.current.delete(panelId);
    setPanels((current) => current.filter((panel) => panel.id !== panelId));
    setPendingClosePanelId((current) => (current === panelId ? null : current));
  }, []);

  const closePanel = useCallback<RightPanelContextValue["closePanel"]>(
    (panelId) => {
      const targetPanel = panels.find((panel) => panel.id === (panelId ?? activePanel?.id));
      if (!targetPanel) {
        return;
      }
      if (targetPanel.dirty) {
        setPendingClosePanelId(targetPanel.id);
        return;
      }
      removePanel(targetPanel.id);
    },
    [activePanel?.id, panels, removePanel],
  );

  const setDirty = useCallback<RightPanelContextValue["setDirty"]>((panelId, dirty) => {
    setPanels((current) =>
      current.map((panel) => (panel.id === panelId ? { ...panel, dirty } : panel)),
    );
  }, []);

  const registerSubmitHandler = useCallback<RightPanelContextValue["registerSubmitHandler"]>(
    (panelId, handler) => {
      if (handler) {
        submitHandlers.current.set(panelId, handler);
      } else {
        submitHandlers.current.delete(panelId);
      }
    },
    [],
  );

  const discardPendingClose = useCallback(() => {
    if (!pendingClosePanelId) {
      return;
    }
    removePanel(pendingClosePanelId);
  }, [pendingClosePanelId, removePanel]);

  const cancelPendingClose = useCallback(() => {
    setPendingClosePanelId(null);
  }, []);

  const savePendingClose = useCallback(async () => {
    if (!pendingClosePanelId) {
      return;
    }
    const handler = submitHandlers.current.get(pendingClosePanelId);
    if (!handler) {
      removePanel(pendingClosePanelId);
      return;
    }
    const result = await handler();
    if (result !== false) {
      removePanel(pendingClosePanelId);
    }
  }, [pendingClosePanelId, removePanel]);

  const value = useMemo<RightPanelContextValue>(
    () => ({
      panels,
      activePanel,
      pendingClosePanel,
      openPanel,
      replacePanel,
      closePanel,
      setDirty,
      registerSubmitHandler,
      discardPendingClose,
      cancelPendingClose,
      savePendingClose,
    }),
    [
      activePanel,
      cancelPendingClose,
      closePanel,
      discardPendingClose,
      openPanel,
      panels,
      pendingClosePanel,
      registerSubmitHandler,
      replacePanel,
      savePendingClose,
      setDirty,
    ],
  );

  return <RightPanelContext.Provider value={value}>{children}</RightPanelContext.Provider>;
}

export function useRightPanelContext() {
  const context = useContext(RightPanelContext);
  if (!context) {
    throw new Error("useRightPanel must be used within RightPanelProvider");
  }
  return context;
}
