import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type PropsWithChildren,
} from "react";

import type { MenuItem, SubmittedOrder, TableInfo } from "../domain/guest-order";
import {
  GUEST_STORAGE_KEY,
  createInitialGuestOrderState,
  extractGuestCode,
  generateGuestSessionId,
  getCartCount,
  getCartTotal,
  guestOrderReducer,
} from "../domain/guest-order";

type GuestOrderContextValue = {
  hydrated: boolean;
  state: ReturnType<typeof createInitialGuestOrderState>;
  cartCount: number;
  cartTotal: number;
  startGuestSession: (rawCode: string, guestName: string) => string;
  setGuestName: (guestName: string) => void;
  setTableInfo: (tableInfo: TableInfo) => void;
  setOrderNotes: (notes: string) => void;
  addItem: (item: MenuItem) => void;
  setItemQuantity: (itemId: number, quantity: number) => void;
  setItemNotes: (itemId: number, notes: string) => void;
  removeItem: (itemId: number) => void;
  clearCart: () => void;
  markSubmitted: (submitted: SubmittedOrder) => void;
  resetSubmitted: () => void;
};

const GuestOrderContext = createContext<GuestOrderContextValue | null>(null);

export function GuestOrderProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(guestOrderReducer, undefined, createInitialGuestOrderState);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(GUEST_STORAGE_KEY)
      .then((value) => {
        if (!active || !value) {
          dispatch({ type: "hydrate", payload: {} });
          return;
        }
        const parsed = JSON.parse(value) as Record<string, unknown>;
        dispatch({
          type: "hydrate",
          payload: {
            guestSessionId:
              typeof parsed.guestSessionId === "string" ? parsed.guestSessionId : generateGuestSessionId(),
            guestName: typeof parsed.guestName === "string" ? parsed.guestName : "",
            tableCode: typeof parsed.tableCode === "string" ? parsed.tableCode : "",
            tableInfo:
              parsed.tableInfo && typeof parsed.tableInfo === "object"
                ? (parsed.tableInfo as TableInfo)
                : null,
            cart: Array.isArray(parsed.cart) ? (parsed.cart as typeof state.cart) : [],
            orderNotes: typeof parsed.orderNotes === "string" ? parsed.orderNotes : "",
            lastSubmittedOrder:
              parsed.lastSubmittedOrder && typeof parsed.lastSubmittedOrder === "object"
                ? (parsed.lastSubmittedOrder as SubmittedOrder)
                : null,
          },
        });
      })
      .catch(() => {
        dispatch({ type: "hydrate", payload: {} });
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!state.hydrated) {
      return;
    }
    const snapshot = JSON.stringify({
      guestSessionId: state.guestSessionId,
      guestName: state.guestName,
      tableCode: state.tableCode,
      tableInfo: state.tableInfo,
      cart: state.cart,
      orderNotes: state.orderNotes,
      lastSubmittedOrder: state.lastSubmittedOrder,
    });
    void AsyncStorage.setItem(GUEST_STORAGE_KEY, snapshot);
  }, [state]);

  const value = useMemo<GuestOrderContextValue>(() => {
    return {
      hydrated: state.hydrated,
      state,
      cartCount: getCartCount(state.cart),
      cartTotal: getCartTotal(state.cart),
      startGuestSession(rawCode, guestName) {
        const nextCode = extractGuestCode(rawCode);
        if (!nextCode) {
          throw new Error("Enter or scan a valid table code.");
        }
        dispatch({
          type: "start_session",
          payload: {
            tableCode: nextCode,
            guestName,
          },
        });
        return nextCode;
      },
      setGuestName(guestName) {
        dispatch({ type: "set_guest_name", payload: guestName });
      },
      setTableInfo(tableInfo) {
        dispatch({ type: "set_table_info", payload: tableInfo });
      },
      setOrderNotes(notes) {
        dispatch({ type: "set_order_notes", payload: notes });
      },
      addItem(item) {
        dispatch({ type: "add_item", payload: item });
      },
      setItemQuantity(itemId, quantity) {
        dispatch({ type: "set_item_quantity", payload: { itemId, quantity } });
      },
      setItemNotes(itemId, notes) {
        dispatch({ type: "set_item_notes", payload: { itemId, notes } });
      },
      removeItem(itemId) {
        dispatch({ type: "remove_item", payload: { itemId } });
      },
      clearCart() {
        dispatch({ type: "clear_cart" });
      },
      markSubmitted(submitted) {
        dispatch({ type: "mark_submitted", payload: submitted });
      },
      resetSubmitted() {
        dispatch({ type: "reset_submitted" });
      },
    };
  }, [state]);

  return <GuestOrderContext.Provider value={value}>{children}</GuestOrderContext.Provider>;
}

export function useGuestOrder() {
  const context = useContext(GuestOrderContext);
  if (!context) {
    throw new Error("useGuestOrder must be used inside GuestOrderProvider.");
  }
  return context;
}
