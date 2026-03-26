export type TableInfo = {
  table_number: string;
  section_name: string;
  capacity: number;
};

export type MenuItem = {
  id: number;
  name: string;
  description: string | null;
  price: number;
  category_id: number;
  category_name: string;
  image_url: string | null;
  is_available: boolean;
  prep_time_min: number;
  allergens: string[];
  dietary_tags: string[];
};

export type MenuCategory = {
  id: number;
  name: string;
  items: MenuItem[];
};

export type CartItem = {
  item: MenuItem;
  quantity: number;
  notes: string;
};

export type SubmittedOrder = {
  order_id: number;
  table_number: string;
  status: string;
  items_count: number;
  total: number;
  message: string;
};

export type GuestOrderState = {
  hydrated: boolean;
  guestSessionId: string;
  guestName: string;
  tableCode: string;
  tableInfo: TableInfo | null;
  cart: CartItem[];
  orderNotes: string;
  lastSubmittedOrder: SubmittedOrder | null;
};

export type GuestOrderSnapshot = Omit<GuestOrderState, "hydrated">;

export type OrderSubmissionPayload = {
  table_code: string;
  guest_name: string;
  items: Array<{
    menu_item_id: number;
    quantity: number;
    notes: string | null;
  }>;
  notes: string | null;
};

export type GuestOrderAction =
  | { type: "hydrate"; payload: Partial<GuestOrderSnapshot> }
  | { type: "start_session"; payload: { tableCode: string; guestName: string } }
  | { type: "set_guest_name"; payload: string }
  | { type: "set_table_info"; payload: TableInfo }
  | { type: "set_order_notes"; payload: string }
  | { type: "add_item"; payload: MenuItem }
  | { type: "set_item_quantity"; payload: { itemId: number; quantity: number } }
  | { type: "set_item_notes"; payload: { itemId: number; notes: string } }
  | { type: "remove_item"; payload: { itemId: number } }
  | { type: "clear_cart" }
  | { type: "mark_submitted"; payload: SubmittedOrder }
  | { type: "reset_submitted" };

export const GUEST_STORAGE_KEY = "das-elb-mobile-phase1-guest-order";

export function generateGuestSessionId(now = Date.now()): string {
  return `guest-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeGuestName(input: string | null | undefined): string {
  const value = String(input ?? "").trim();
  return value.length > 0 ? value : "Guest";
}

export function extractGuestCode(rawInput: string | null | undefined): string | null {
  const trimmed = String(rawInput ?? "").trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    const queryCode = url.searchParams.get("code");
    if (queryCode) {
      return queryCode.trim() || null;
    }
  } catch {
    // Ignore non-URL inputs and treat them as raw table codes.
  }

  return trimmed;
}

export function createInitialGuestOrderState(): GuestOrderState {
  return {
    hydrated: false,
    guestSessionId: generateGuestSessionId(),
    guestName: "",
    tableCode: "",
    tableInfo: null,
    cart: [],
    orderNotes: "",
    lastSubmittedOrder: null,
  };
}

export function addCartItem(cart: CartItem[], item: MenuItem): CartItem[] {
  const existing = cart.find((entry) => entry.item.id === item.id);
  if (!existing) {
    return [...cart, { item, quantity: 1, notes: "" }];
  }
  return cart.map((entry) =>
    entry.item.id === item.id ? { ...entry, quantity: entry.quantity + 1 } : entry,
  );
}

export function setCartItemQuantity(cart: CartItem[], itemId: number, quantity: number): CartItem[] {
  if (quantity <= 0) {
    return cart.filter((entry) => entry.item.id !== itemId);
  }
  return cart.map((entry) =>
    entry.item.id === itemId ? { ...entry, quantity } : entry,
  );
}

export function setCartItemNotes(cart: CartItem[], itemId: number, notes: string): CartItem[] {
  return cart.map((entry) =>
    entry.item.id === itemId ? { ...entry, notes } : entry,
  );
}

export function removeCartItem(cart: CartItem[], itemId: number): CartItem[] {
  return cart.filter((entry) => entry.item.id !== itemId);
}

export function getCartCount(cart: CartItem[]): number {
  return cart.reduce((count, entry) => count + entry.quantity, 0);
}

export function getCartTotal(cart: CartItem[]): number {
  return cart.reduce((total, entry) => total + entry.item.price * entry.quantity, 0);
}

export function buildOrderSubmission(args: {
  tableCode: string;
  guestName: string;
  cart: CartItem[];
  orderNotes: string;
}): OrderSubmissionPayload {
  return {
    table_code: args.tableCode,
    guest_name: normalizeGuestName(args.guestName),
    items: args.cart.map((entry) => ({
      menu_item_id: entry.item.id,
      quantity: entry.quantity,
      notes: entry.notes.trim() || null,
    })),
    notes: args.orderNotes.trim() || null,
  };
}

function nextSnapshot(state: GuestOrderState, patch: Partial<GuestOrderSnapshot>): GuestOrderState {
  return {
    ...state,
    ...patch,
  };
}

export function guestOrderReducer(
  state: GuestOrderState,
  action: GuestOrderAction,
): GuestOrderState {
  switch (action.type) {
    case "hydrate":
      return {
        ...state,
        ...action.payload,
        guestSessionId: action.payload.guestSessionId || state.guestSessionId,
        hydrated: true,
      };
    case "start_session": {
      const nextTableCode = action.payload.tableCode;
      const isNewTable = state.tableCode !== nextTableCode;
      return nextSnapshot(state, {
        guestName: action.payload.guestName,
        tableCode: nextTableCode,
        tableInfo: isNewTable ? null : state.tableInfo,
        cart: isNewTable ? [] : state.cart,
        orderNotes: isNewTable ? "" : state.orderNotes,
        lastSubmittedOrder: null,
      });
    }
    case "set_guest_name":
      return nextSnapshot(state, {
        guestName: action.payload,
      });
    case "set_table_info":
      return nextSnapshot(state, {
        tableInfo: action.payload,
      });
    case "set_order_notes":
      return nextSnapshot(state, {
        orderNotes: action.payload,
      });
    case "add_item":
      return nextSnapshot(state, {
        cart: addCartItem(state.cart, action.payload),
      });
    case "set_item_quantity":
      return nextSnapshot(state, {
        cart: setCartItemQuantity(state.cart, action.payload.itemId, action.payload.quantity),
      });
    case "set_item_notes":
      return nextSnapshot(state, {
        cart: setCartItemNotes(state.cart, action.payload.itemId, action.payload.notes),
      });
    case "remove_item":
      return nextSnapshot(state, {
        cart: removeCartItem(state.cart, action.payload.itemId),
      });
    case "clear_cart":
      return nextSnapshot(state, {
        cart: [],
        orderNotes: "",
      });
    case "mark_submitted":
      return nextSnapshot(state, {
        cart: [],
        orderNotes: "",
        lastSubmittedOrder: action.payload,
      });
    case "reset_submitted":
      return nextSnapshot(state, {
        lastSubmittedOrder: null,
      });
    default:
      return state;
  }
}
