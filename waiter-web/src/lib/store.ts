import { create } from "zustand";
import {
  ApiError,
  authStore,
  waiterApi,
  type LiveOrderSummary,
  type WaiterMenuCategory,
  type WaiterMenuItem,
  type WaiterTable,
} from "./api";

export interface CartLine {
  item: WaiterMenuItem;
  quantity: number;
  notes?: string;
}

export interface AppState {
  /* auth */
  authed: boolean;
  waiterId: string | null;
  waiterName: string | null;

  /* reference data */
  tables: WaiterTable[];
  menu: WaiterMenuCategory[];
  liveOrders: LiveOrderSummary[];
  refsLoaded: boolean;
  refsError: string | null;

  /* selection */
  selectedTableId: string | null;

  /* cart — keyed per-table so switching tables doesn't lose state */
  carts: Record<string, CartLine[]>;
  orderNotes: Record<string, string>;

  /* actions */
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  loadReferenceData: () => Promise<void>;
  refreshTables: () => Promise<void>;
  refreshLiveOrders: () => Promise<void>;

  selectTable: (tableId: string | null) => void;
  addToCart: (item: WaiterMenuItem) => void;
  updateCartQty: (tableId: string, menuItemId: string, delta: number) => void;
  removeCartLine: (tableId: string, menuItemId: string) => void;
  clearCart: (tableId: string) => void;
  setOrderNotes: (tableId: string, notes: string) => void;
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
    // Fire-and-forget backend logout (we don't block the UI).
    waiterApi.logout().catch(() => {});
    handleAuthFailure(set);
  },

  async loadReferenceData() {
    if (!get().authed) return;
    try {
      const [tables, menu, liveOrders] = await Promise.all([
        waiterApi.tables(),
        waiterApi.menu(),
        waiterApi.liveOrders().catch(() => [] as LiveOrderSummary[]),
      ]);
      set({ tables, menu, liveOrders, refsLoaded: true, refsError: null });
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
      if (err instanceof ApiError && err.status === 401) handleAuthFailure(set);
    }
  },

  async refreshLiveOrders() {
    try {
      const liveOrders = await waiterApi.liveOrders();
      set({ liveOrders });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) handleAuthFailure(set);
    }
  },

  selectTable(tableId) {
    set({ selectedTableId: tableId });
  },

  addToCart(item) {
    const tableId = get().selectedTableId;
    if (!tableId) return;
    set((state) => {
      const existing = state.carts[tableId] ?? [];
      const match = existing.find((line) => line.item.id === item.id);
      const next = match
        ? existing.map((line) =>
            line.item.id === item.id
              ? { ...line, quantity: line.quantity + 1 }
              : line
          )
        : [...existing, { item, quantity: 1 }];
      return { carts: { ...state.carts, [tableId]: next } };
    });
  },

  updateCartQty(tableId, menuItemId, delta) {
    set((state) => {
      const existing = state.carts[tableId] ?? [];
      const next = existing
        .map((line) =>
          line.item.id === menuItemId
            ? { ...line, quantity: Math.max(0, line.quantity + delta) }
            : line
        )
        .filter((line) => line.quantity > 0);
      return { carts: { ...state.carts, [tableId]: next } };
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

  clearCart(tableId) {
    set((state) => {
      const next = { ...state.carts };
      delete next[tableId];
      const notes = { ...state.orderNotes };
      delete notes[tableId];
      return { carts: next, orderNotes: notes };
    });
  },

  setOrderNotes(tableId, notes) {
    set((state) => ({
      orderNotes: { ...state.orderNotes, [tableId]: notes },
    }));
  },
}));

export const selectCartForTable = (tableId: string | null) => (state: AppState) =>
  tableId ? state.carts[tableId] ?? [] : [];
export const selectNotesForTable = (tableId: string | null) => (state: AppState) =>
  tableId ? state.orderNotes[tableId] ?? "" : "";
