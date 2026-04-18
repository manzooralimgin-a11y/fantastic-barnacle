import { create } from "zustand";
import {
  ApiError,
  authStore,
  waiterApi,
  type LiveOrderSummary,
  type WaiterMenuItem,
  type WaiterMenuModifier,
  type WaiterMenuCategory,
  type WaiterTable,
} from "./api";

export interface CartLine {
  id: string;
  item: WaiterMenuItem;
  quantity: number;
  notes: string;
  modifiers: WaiterMenuModifier[];
}

interface CartLineDraft {
  quantity?: number;
  notes?: string;
  modifierIds?: string[];
}

export interface AppState {
  authed: boolean;
  waiterId: string | null;
  waiterName: string | null;

  tables: WaiterTable[];
  menu: WaiterMenuCategory[];
  liveOrders: LiveOrderSummary[];
  refsLoaded: boolean;
  refsError: string | null;

  selectedTableId: string | null;

  carts: Record<string, CartLine[]>;
  orderNotes: Record<string, string>;
  guestCounts: Record<string, number>;

  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  loadReferenceData: () => Promise<void>;
  refreshTables: () => Promise<void>;
  refreshLiveOrders: () => Promise<void>;

  selectTable: (tableId: string | null) => void;
  addToCart: (item: WaiterMenuItem, draft?: CartLineDraft) => void;
  upsertCartLine: (
    tableId: string,
    payload: CartLineDraft & { item: WaiterMenuItem; lineId?: string }
  ) => void;
  updateCartQty: (tableId: string, menuItemId: string, delta: number) => void;
  updateCartLineQty: (tableId: string, lineId: string, delta: number) => void;
  updateCartLine: (
    tableId: string,
    lineId: string,
    payload: CartLineDraft & { item?: WaiterMenuItem }
  ) => void;
  removeCartLine: (tableId: string, menuItemId: string) => void;
  removeCartLineById: (tableId: string, lineId: string) => void;
  clearCart: (tableId: string) => void;
  setOrderNotes: (tableId: string, notes: string) => void;
  setGuestCount: (tableId: string, guestCount: number) => void;
}

function makeLineId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `line-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeNotes(notes?: string): string {
  return (notes ?? "").trim();
}

function defaultModifierIds(item: WaiterMenuItem): string[] {
  return item.modifiers.filter((modifier) => modifier.is_default).map((modifier) => modifier.id);
}

function selectedModifiers(item: WaiterMenuItem, modifierIds?: string[]): WaiterMenuModifier[] {
  const ids = new Set((modifierIds ?? defaultModifierIds(item)).map(String));
  return item.modifiers.filter((modifier) => ids.has(modifier.id));
}

function lineSignature(itemId: string, notes: string, modifiers: WaiterMenuModifier[]): string {
  const modifierKey = modifiers
    .map((modifier) => modifier.id)
    .sort((a, b) => a.localeCompare(b))
    .join(",");
  return `${itemId}|${modifierKey}|${notes.toLowerCase()}`;
}

function buildLine(
  item: WaiterMenuItem,
  draft: CartLineDraft = {},
  lineId?: string
): CartLine {
  return {
    id: lineId ?? makeLineId(),
    item,
    quantity: Math.max(1, draft.quantity ?? 1),
    notes: normalizeNotes(draft.notes),
    modifiers: selectedModifiers(item, draft.modifierIds),
  };
}

function collapseLines(lines: CartLine[]): CartLine[] {
  const merged: CartLine[] = [];

  for (const line of lines) {
    if (line.quantity <= 0) {
      continue;
    }
    const signature = lineSignature(line.item.id, line.notes, line.modifiers);
    const match = merged.find(
      (candidate) =>
        lineSignature(candidate.item.id, candidate.notes, candidate.modifiers) === signature
    );
    if (match) {
      match.quantity += line.quantity;
      continue;
    }
    merged.push({
      ...line,
      modifiers: [...line.modifiers],
    });
  }

  return merged;
}

function addOrMergeLine(lines: CartLine[], nextLine: CartLine): CartLine[] {
  const signature = lineSignature(nextLine.item.id, nextLine.notes, nextLine.modifiers);
  const match = lines.find(
    (candidate) =>
      lineSignature(candidate.item.id, candidate.notes, candidate.modifiers) === signature
  );

  if (!match) {
    return [...lines, nextLine];
  }

  return lines.map((line) =>
    line.id === match.id ? { ...line, quantity: line.quantity + nextLine.quantity } : line
  );
}

function replaceLine(lines: CartLine[], lineId: string, nextLine: CartLine): CartLine[] {
  const updated = lines.map((line) => (line.id === lineId ? nextLine : line));
  return collapseLines(updated);
}

function handleAuthFailure(set: (partial: Partial<AppState>) => void) {
  authStore.clear();
  set({
    authed: false,
    waiterId: null,
    waiterName: null,
    tables: [],
    menu: [],
    liveOrders: [],
    selectedTableId: null,
    carts: {},
    orderNotes: {},
    guestCounts: {},
    refsLoaded: false,
    refsError: null,
  });
}

export const useAppStore = create<AppState>((set, get) => ({
  authed: !!authStore.getToken(),
  waiterId: authStore.getWaiterId(),
  waiterName: authStore.getWaiterName(),

  tables: [],
  menu: [],
  liveOrders: [],
  refsLoaded: false,
  refsError: null,

  selectedTableId: null,

  carts: {},
  orderNotes: {},
  guestCounts: {},

  async login(username, password) {
    const res = await waiterApi.login(username, password);
    authStore.set(res.access_token, res.refresh_token, res.waiter_id, username);
    set({
      authed: true,
      waiterId: res.waiter_id,
      waiterName: username,
      refsError: null,
    });
  },

  logout() {
    waiterApi.logout().catch(() => undefined);
    handleAuthFailure(set);
  },

  async loadReferenceData() {
    if (!get().authed) {
      return;
    }

    try {
      const [tables, menuCatalog, liveOrders] = await Promise.all([
        waiterApi.tables(),
        waiterApi.menuCatalog(),
        waiterApi.liveOrders().catch(() => [] as LiveOrderSummary[]),
      ]);
      set({
        tables,
        menu: menuCatalog.categories,
        liveOrders,
        refsLoaded: true,
        refsError: null,
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleAuthFailure(set);
        return;
      }
      set({
        refsError:
          err instanceof Error ? err.message : "Failed to load reference data",
        refsLoaded: true,
      });
    }
  },

  async refreshTables() {
    try {
      const tables = await waiterApi.tables();
      set({ tables });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleAuthFailure(set);
      }
    }
  },

  async refreshLiveOrders() {
    try {
      const liveOrders = await waiterApi.liveOrders();
      set({ liveOrders });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleAuthFailure(set);
      }
    }
  },

  selectTable(tableId) {
    set({ selectedTableId: tableId });
  },

  addToCart(item, draft = {}) {
    const tableId = get().selectedTableId;
    if (!tableId) {
      return;
    }
    const nextLine = buildLine(item, draft);
    set((state) => ({
      carts: {
        ...state.carts,
        [tableId]: addOrMergeLine(state.carts[tableId] ?? [], nextLine),
      },
    }));
  },

  upsertCartLine(tableId, payload) {
    const nextLine = buildLine(payload.item, payload, payload.lineId);
    set((state) => {
      const existing = state.carts[tableId] ?? [];
      const nextCart = payload.lineId
        ? replaceLine(existing, payload.lineId, nextLine)
        : addOrMergeLine(existing, nextLine);

      return {
        carts: {
          ...state.carts,
          [tableId]: nextCart,
        },
      };
    });
  },

  updateCartQty(tableId, menuItemId, delta) {
    set((state) => {
      const existing = state.carts[tableId] ?? [];
      const target = [...existing].reverse().find((line) => line.item.id === menuItemId);
      if (!target) {
        return { carts: state.carts };
      }
      const nextCart = existing
        .map((line) =>
          line.id === target.id
            ? { ...line, quantity: Math.max(0, line.quantity + delta) }
            : line
        )
        .filter((line) => line.quantity > 0);
      return {
        carts: {
          ...state.carts,
          [tableId]: nextCart,
        },
      };
    });
  },

  updateCartLineQty(tableId, lineId, delta) {
    set((state) => ({
      carts: {
        ...state.carts,
        [tableId]: (state.carts[tableId] ?? [])
          .map((line) =>
            line.id === lineId
              ? { ...line, quantity: Math.max(0, line.quantity + delta) }
              : line
          )
          .filter((line) => line.quantity > 0),
      },
    }));
  },

  updateCartLine(tableId, lineId, payload) {
    set((state) => {
      const existing = state.carts[tableId] ?? [];
      const currentLine = existing.find((line) => line.id === lineId);
      if (!currentLine) {
        return { carts: state.carts };
      }

      const nextLine = buildLine(
        payload.item ?? currentLine.item,
        {
          quantity: payload.quantity ?? currentLine.quantity,
          notes: payload.notes ?? currentLine.notes,
          modifierIds:
            payload.modifierIds ?? currentLine.modifiers.map((modifier) => modifier.id),
        },
        lineId
      );

      return {
        carts: {
          ...state.carts,
          [tableId]: replaceLine(existing, lineId, nextLine),
        },
      };
    });
  },

  removeCartLine(tableId, menuItemId) {
    set((state) => ({
      carts: {
        ...state.carts,
        [tableId]: (state.carts[tableId] ?? []).filter(
          (line) => line.item.id !== menuItemId
        ),
      },
    }));
  },

  removeCartLineById(tableId, lineId) {
    set((state) => ({
      carts: {
        ...state.carts,
        [tableId]: (state.carts[tableId] ?? []).filter((line) => line.id !== lineId),
      },
    }));
  },

  clearCart(tableId) {
    set((state) => {
      const nextCarts = { ...state.carts };
      delete nextCarts[tableId];

      const nextNotes = { ...state.orderNotes };
      delete nextNotes[tableId];

      const nextGuestCounts = { ...state.guestCounts };
      delete nextGuestCounts[tableId];

      return {
        carts: nextCarts,
        orderNotes: nextNotes,
        guestCounts: nextGuestCounts,
      };
    });
  },

  setOrderNotes(tableId, notes) {
    set((state) => ({
      orderNotes: {
        ...state.orderNotes,
        [tableId]: notes,
      },
    }));
  },

  setGuestCount(tableId, guestCount) {
    set((state) => ({
      guestCounts: {
        ...state.guestCounts,
        [tableId]: Math.max(1, Math.min(guestCount, 30)),
      },
    }));
  },
}));

export const selectCartForTable =
  (tableId: string | null) =>
  (state: AppState): CartLine[] =>
    tableId ? state.carts[tableId] ?? [] : [];

export const selectNotesForTable =
  (tableId: string | null) =>
  (state: AppState): string =>
    tableId ? state.orderNotes[tableId] ?? "" : "";

export const selectGuestCountForTable =
  (tableId: string | null) =>
  (state: AppState): number =>
    tableId ? state.guestCounts[tableId] ?? 0 : 0;
