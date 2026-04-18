import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { OrderDetailModal } from "../components/OrderDetailModal";
import { ApiError, waiterApi, type ReservationRead, type WaiterMenuItem, type WaiterTable } from "../lib/api";
import {
  selectCartForTable,
  selectGuestCountForTable,
  selectNotesForTable,
  useAppStore,
  type CartLine,
} from "../lib/store";

export type WorkspaceMode = "order" | "orders" | "reservations";

interface PosScreenProps {
  workspace: WorkspaceMode;
  onWorkspaceChange: (workspace: WorkspaceMode) => void;
}

interface ItemComposerState {
  item: WaiterMenuItem;
  line?: CartLine;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function todayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTime(value: string): string {
  return value.slice(0, 5);
}

function defaultReservationTime(): string {
  const now = new Date();
  now.setMinutes(Math.ceil((now.getMinutes() + 45) / 15) * 15, 0, 0);
  return now.toTimeString().slice(0, 5);
}

function lineModifierTotal(line: CartLine): number {
  return line.modifiers.reduce((sum, modifier) => sum + modifier.price_adjustment, 0);
}

function lineUnitPrice(line: CartLine): number {
  return line.item.price + lineModifierTotal(line);
}

function lineTotal(line: CartLine): number {
  return lineUnitPrice(line) * line.quantity;
}

function tableSort(a: WaiterTable, b: WaiterTable): number {
  const sectionCompare = a.section_name.localeCompare(b.section_name, undefined, {
    sensitivity: "base",
  });
  if (sectionCompare !== 0) {
    return sectionCompare;
  }
  return a.number.localeCompare(b.number, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function defaultGuestCount(table: WaiterTable | null): number {
  if (!table) {
    return 1;
  }
  return Math.max(
    table.guest_count || table.reservation?.party_size || table.minimum_party_size || 1,
    1
  );
}

function matchesSearch(item: WaiterMenuItem, query: string): boolean {
  if (!query) {
    return true;
  }
  const haystack = [
    item.name,
    item.description,
    ...item.allergens,
    ...item.dietary_tags,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function MenuItemCard({
  item,
  categoryName,
  onQuickAdd,
  onCustomize,
}: {
  item: WaiterMenuItem;
  categoryName: string;
  onQuickAdd: () => void;
  onCustomize: () => void;
}) {
  const pressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);

  const cancelTimer = useCallback(() => {
    if (pressTimerRef.current != null) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  }, []);

  const handlePointerDown = () => {
    if (!item.available) {
      return;
    }
    longPressTriggeredRef.current = false;
    cancelTimer();
    pressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      onCustomize();
    }, 420);
  };

  const handlePointerEnd = (shouldAdd: boolean) => {
    cancelTimer();
    if (shouldAdd && !longPressTriggeredRef.current && item.available) {
      onQuickAdd();
    }
    longPressTriggeredRef.current = false;
  };

  return (
    <article
      className={`menu-card ${item.available ? "" : "is-unavailable"}`}
      onPointerDown={handlePointerDown}
      onPointerUp={() => handlePointerEnd(true)}
      onPointerLeave={() => handlePointerEnd(false)}
      onPointerCancel={() => handlePointerEnd(false)}
      onContextMenu={(event) => {
        event.preventDefault();
        if (item.available) {
          onCustomize();
        }
      }}
    >
      <div className="menu-card__media">
        {item.image_url ? (
          <img src={item.image_url} alt={item.name} />
        ) : (
          <span>{item.name.slice(0, 1).toUpperCase()}</span>
        )}
      </div>
      <div className="menu-card__body">
        <div className="menu-card__header">
          <div>
            <h3>{item.name}</h3>
            <p>{categoryName}</p>
          </div>
          <strong>{formatCurrency(item.price)}</strong>
        </div>
        {item.description ? <p className="menu-card__description">{item.description}</p> : null}
        <div className="menu-card__meta">
          {item.featured ? <span className="chip chip--gold">Popular</span> : null}
          {!item.available ? <span className="chip chip--danger">Unavailable</span> : null}
          {item.modifiers.length > 0 ? (
            <span className="chip chip--muted">{item.modifiers.length} options</span>
          ) : null}
          {item.allergens.slice(0, 2).map((tag) => (
            <span className="chip chip--muted" key={tag}>
              {tag}
            </span>
          ))}
        </div>
      </div>
      <button
        className="menu-card__add"
        disabled={!item.available}
        onPointerDown={(event) => event.stopPropagation()}
        onPointerUp={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onQuickAdd();
        }}
      >
        +
      </button>
    </article>
  );
}

function ItemComposerDialog({
  state,
  onClose,
  onSave,
}: {
  state: ItemComposerState;
  onClose: () => void;
  onSave: (draft: { quantity: number; notes: string; modifierIds: string[] }) => void;
}) {
  const { item, line } = state;
  const [quantity, setQuantity] = useState(line?.quantity ?? 1);
  const [notes, setNotes] = useState(line?.notes ?? "");
  const [modifierIds, setModifierIds] = useState<string[]>(
    line?.modifiers.map((modifier) => modifier.id) ??
      item.modifiers.filter((modifier) => modifier.is_default).map((modifier) => modifier.id)
  );

  const selectedModifiers = useMemo(
    () => item.modifiers.filter((modifier) => modifierIds.includes(modifier.id)),
    [item.modifiers, modifierIds]
  );
  const groupedModifiers = useMemo(() => {
    const groups = new Map<string, typeof item.modifiers>();
    for (const modifier of item.modifiers) {
      const key = modifier.group_name || "Options";
      groups.set(key, [...(groups.get(key) ?? []), modifier]);
    }
    return [...groups.entries()];
  }, [item.modifiers]);

  const previewTotal =
    (item.price +
      selectedModifiers.reduce((sum, modifier) => sum + modifier.price_adjustment, 0)) *
    quantity;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="composer-modal" onClick={(event) => event.stopPropagation()}>
        <div className="composer-modal__header">
          <div>
            <h3>{item.name}</h3>
            <p>{formatCurrency(item.price)} base price</p>
          </div>
          <button className="ghost sm" onClick={onClose}>
            Close
          </button>
        </div>

        {groupedModifiers.length > 0 ? (
          <div className="composer-modal__section">
            {groupedModifiers.map(([groupName, modifiers]) => (
              <div key={groupName} className="composer-group">
                <h4>{groupName}</h4>
                <div className="composer-group__options">
                  {modifiers.map((modifier) => {
                    const selected = modifierIds.includes(modifier.id);
                    return (
                      <button
                        key={modifier.id}
                        className={`option-chip ${selected ? "is-selected" : ""}`}
                        onClick={() =>
                          setModifierIds((current) =>
                            current.includes(modifier.id)
                              ? current.filter((id) => id !== modifier.id)
                              : [...current, modifier.id]
                          )
                        }
                      >
                        <span>{modifier.name}</span>
                        <strong>
                          {modifier.price_adjustment > 0
                            ? `+${formatCurrency(modifier.price_adjustment)}`
                            : "Included"}
                        </strong>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="composer-modal__section composer-grid">
          <label>
            <small className="hint">Quantity</small>
            <div className="stepper">
              <button onClick={() => setQuantity((current) => Math.max(1, current - 1))}>-</button>
              <span>{quantity}</span>
              <button onClick={() => setQuantity((current) => current + 1)}>+</button>
            </div>
          </label>
          <label>
            <small className="hint">Item note</small>
            <textarea
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="No onion, sauce on side, extra hot..."
            />
          </label>
        </div>

        <div className="composer-modal__footer">
          <div>
            <small className="hint">Line total</small>
            <strong>{formatCurrency(previewTotal)}</strong>
          </div>
          <button
            className="primary"
            onClick={() =>
              onSave({
                quantity,
                notes,
                modifierIds,
              })
            }
          >
            {line ? "Update item" : "Add to cart"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PosScreen({ workspace, onWorkspaceChange }: PosScreenProps) {
  const tables = useAppStore((state) => state.tables);
  const menu = useAppStore((state) => state.menu);
  const liveOrders = useAppStore((state) => state.liveOrders);
  const selectedTableId = useAppStore((state) => state.selectedTableId);
  const selectTable = useAppStore((state) => state.selectTable);
  const waiterId = useAppStore((state) => state.waiterId);
  const logout = useAppStore((state) => state.logout);
  const addToCart = useAppStore((state) => state.addToCart);
  const upsertCartLine = useAppStore((state) => state.upsertCartLine);
  const updateCartLineQty = useAppStore((state) => state.updateCartLineQty);
  const updateCartLine = useAppStore((state) => state.updateCartLine);
  const removeCartLineById = useAppStore((state) => state.removeCartLineById);
  const clearCart = useAppStore((state) => state.clearCart);
  const refreshTables = useAppStore((state) => state.refreshTables);
  const refreshLiveOrders = useAppStore((state) => state.refreshLiveOrders);
  const setOrderNotes = useAppStore((state) => state.setOrderNotes);
  const setGuestCount = useAppStore((state) => state.setGuestCount);
  const cart = useAppStore(selectCartForTable(selectedTableId));
  const orderNotes = useAppStore(selectNotesForTable(selectedTableId));
  const storedGuestCount = useAppStore(selectGuestCountForTable(selectedTableId));

  const [tableView, setTableView] = useState<"grid" | "map">("grid");
  const [sectionFilter, setSectionFilter] = useState<string>("all");
  const [activeCategoryId, setActiveCategoryId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [openOrderId, setOpenOrderId] = useState<number | null>(null);
  const [composerState, setComposerState] = useState<ItemComposerState | null>(null);
  const [reservations, setReservations] = useState<ReservationRead[]>([]);
  const [reservationTableDrafts, setReservationTableDrafts] = useState<Record<number, string>>(
    {}
  );
  const [reservationsLoading, setReservationsLoading] = useState(false);
  const [reservationsError, setReservationsError] = useState<string | null>(null);
  const [reservationBusyId, setReservationBusyId] = useState<number | null>(null);
  const [reservationGuestName, setReservationGuestName] = useState("");
  const [reservationGuestPhone, setReservationGuestPhone] = useState("");
  const [reservationPartySize, setReservationPartySize] = useState(2);
  const [reservationDate, setReservationDate] = useState(todayIso());
  const [reservationTime, setReservationTime] = useState(defaultReservationTime());
  const [reservationDuration, setReservationDuration] = useState(90);
  const [reservationSpecialRequest, setReservationSpecialRequest] = useState("");
  const [reservationCreateTableId, setReservationCreateTableId] = useState("");
  const [creatingReservation, setCreatingReservation] = useState(false);
  const [reservationCreateError, setReservationCreateError] = useState<string | null>(null);
  const [reservationCreateSuccess, setReservationCreateSuccess] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement | null>(null);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  const selectedTable = useMemo(
    () => tables.find((table) => table.id === selectedTableId) ?? null,
    [tables, selectedTableId]
  );

  const guestCount = storedGuestCount || defaultGuestCount(selectedTable);

  useEffect(() => {
    if (!menu.length) {
      setActiveCategoryId("");
      return;
    }
    if (!activeCategoryId || !menu.some((category) => category.id === activeCategoryId)) {
      setActiveCategoryId(menu[0].id);
    }
  }, [activeCategoryId, menu]);

  useEffect(() => {
    if (!selectedTableId || !selectedTable) {
      return;
    }
    if (!storedGuestCount) {
      setGuestCount(selectedTableId, defaultGuestCount(selectedTable));
    }
  }, [selectedTable, selectedTableId, setGuestCount, storedGuestCount]);

  useEffect(() => {
    if (workspace === "order" && selectedTableId) {
      const raf = window.requestAnimationFrame(() => searchRef.current?.focus());
      return () => window.cancelAnimationFrame(raf);
    }
    return undefined;
  }, [workspace, selectedTableId]);

  const loadReservations = useCallback(async () => {
    setReservationsLoading(true);
    setReservationsError(null);
    try {
      const data = await waiterApi.reservations(todayIso());
      const nextReservations = data
        .filter((reservation) => !reservation.kind || reservation.kind === "restaurant")
        .sort((left, right) => left.start_time.localeCompare(right.start_time));
      setReservations(nextReservations);
      setReservationTableDrafts(
        Object.fromEntries(
          nextReservations.map((reservation) => [
            reservation.id,
            reservation.table_id ? String(reservation.table_id) : "",
          ])
        )
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        logout();
        return;
      }
      setReservationsError(
        error instanceof Error ? error.message : "Failed to load reservations"
      );
    } finally {
      setReservationsLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    void loadReservations();
  }, [loadReservations]);

  const sectionOptions = useMemo(() => {
    const sections = [...new Set(tables.map((table) => table.section_name))];
    return sections.sort((left, right) => left.localeCompare(right));
  }, [tables]);

  const reservationAssignableTables = useMemo(
    () =>
      tables
        .filter((table) => table.status !== "occupied" && table.status !== "billing")
        .sort(tableSort),
    [tables]
  );

  const filteredTables = useMemo(() => {
    const nextTables =
      sectionFilter === "all"
        ? [...tables]
        : tables.filter((table) => table.section_name === sectionFilter);
    return nextTables.sort(tableSort);
  }, [sectionFilter, tables]);

  const activeCategory = useMemo(
    () => menu.find((category) => category.id === activeCategoryId) ?? menu[0] ?? null,
    [activeCategoryId, menu]
  );

  const categoryNameByItemId = useMemo(() => {
    const entries = menu.flatMap((category) =>
      category.items.map((item) => [item.id, category.name] as const)
    );
    return new Map(entries);
  }, [menu]);

  const visibleItems = useMemo(() => {
    const baseItems = deferredSearch
      ? menu.flatMap((category) => category.items)
      : activeCategory?.items ?? [];
    return baseItems.filter((item) => matchesSearch(item, deferredSearch));
  }, [activeCategory, deferredSearch, menu]);

  const cartSubtotal = useMemo(
    () => cart.reduce((sum, line) => sum + lineTotal(line), 0),
    [cart]
  );
  const cartTax = 0;
  const cartTotal = cartSubtotal + cartTax;

  const floorStats = useMemo(
    () => ({
      free: tables.filter((table) => table.status === "free").length,
      occupied: tables.filter((table) => table.status === "occupied").length,
      reserved: tables.filter((table) => table.status === "reserved").length,
      billing: tables.filter((table) => table.status === "billing").length,
    }),
    [tables]
  );

  const handleTableTap = (table: WaiterTable) => {
    selectTable(table.id);
    setSubmitError(null);
    setSubmitSuccess(null);
    startTransition(() => {
      onWorkspaceChange("order");
    });
  };

  const handleSubmitOrder = async () => {
    if (!selectedTable) {
      setSubmitError("Select a table first.");
      return;
    }
    if (cart.length === 0) {
      setSubmitError("Add at least one item before sending.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);
    try {
      const response = await waiterApi.createOrder({
        table_id: selectedTable.id,
        waiter_id: waiterId,
        guest_count: guestCount,
        items: cart.map((line) => ({
          menu_item_id: line.item.id,
          quantity: line.quantity,
          notes: line.notes || null,
          modifier_ids: line.modifiers.map((modifier) => modifier.id),
        })),
        notes: orderNotes.trim() || null,
      });

      clearCart(selectedTable.id);
      await Promise.all([refreshTables(), refreshLiveOrders(), loadReservations()]);
      setSubmitSuccess(`Order #${response.order_id} sent to kitchen.`);
      setSearch("");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        logout();
        return;
      }
      setSubmitError(
        error instanceof Error ? error.message : "Failed to send order to kitchen"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateReservation = async () => {
    if (!reservationGuestName.trim()) {
      setReservationCreateError("Enter a guest name.");
      return;
    }

    setCreatingReservation(true);
    setReservationCreateError(null);
    setReservationCreateSuccess(null);
    setReservationsError(null);

    try {
      const created = await waiterApi.createReservation({
        guest_name: reservationGuestName.trim(),
        guest_phone: reservationGuestPhone.trim() || null,
        party_size: reservationPartySize,
        reservation_date: reservationDate,
        start_time: `${reservationTime}:00`,
        duration_min: reservationDuration,
        table_id: reservationCreateTableId ? Number(reservationCreateTableId) : null,
        special_requests: reservationSpecialRequest.trim() || null,
        source: "waiter",
      });

      setReservationCreateSuccess(
        `Reservation #${created.id} confirmed for ${created.guest_name}.`
      );
      setReservationGuestName("");
      setReservationGuestPhone("");
      setReservationPartySize(2);
      setReservationDate(todayIso());
      setReservationTime(defaultReservationTime());
      setReservationDuration(90);
      setReservationSpecialRequest("");
      setReservationCreateTableId("");
      await Promise.all([loadReservations(), refreshTables()]);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        logout();
        return;
      }
      setReservationCreateError(
        error instanceof Error ? error.message : "Failed to create reservation"
      );
    } finally {
      setCreatingReservation(false);
    }
  };

  const handleReservationAssign = async (reservationId: number) => {
    const tableId = reservationTableDrafts[reservationId];
    setReservationBusyId(reservationId);
    setReservationsError(null);
    try {
      await waiterApi.updateReservation(reservationId, {
        table_id: tableId ? Number(tableId) : null,
      });
      await Promise.all([loadReservations(), refreshTables()]);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        logout();
        return;
      }
      setReservationsError(
        error instanceof Error ? error.message : "Failed to assign table"
      );
    } finally {
      setReservationBusyId(null);
    }
  };

  const handleReservationArrived = async (reservationId: number) => {
    setReservationBusyId(reservationId);
    setReservationsError(null);
    try {
      await waiterApi.updateReservation(reservationId, { status: "arrived" });
      await Promise.all([loadReservations(), refreshTables()]);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        logout();
        return;
      }
      setReservationsError(
        error instanceof Error ? error.message : "Failed to mark reservation arrived"
      );
    } finally {
      setReservationBusyId(null);
    }
  };

  const mapBounds = useMemo(() => {
    const source = filteredTables.length > 0 ? filteredTables : tables;
    const maxX = Math.max(...source.map((table) => table.position_x + table.width), 1000);
    const maxY = Math.max(...source.map((table) => table.position_y + table.height), 1000);
    return { maxX, maxY };
  }, [filteredTables, tables]);

  return (
    <div className="pos-shell">
      <aside className="tables-pane">
        <div className="pane-header">
          <div>
            <small className="eyebrow">Service Floor</small>
            <h2>{tables.length} tables live</h2>
          </div>
          <div className="segmented-control">
            <button
              className={tableView === "grid" ? "is-active" : ""}
              onClick={() => setTableView("grid")}
            >
              Grid
            </button>
            <button
              className={tableView === "map" ? "is-active" : ""}
              onClick={() => setTableView("map")}
            >
              Map
            </button>
          </div>
        </div>

        <div className="status-strip">
          <span className="status-chip status-chip--free">Free {floorStats.free}</span>
          <span className="status-chip status-chip--occupied">
            Occupied {floorStats.occupied}
          </span>
          <span className="status-chip status-chip--reserved">
            Reserved {floorStats.reserved}
          </span>
          <span className="status-chip status-chip--billing">
            Billing {floorStats.billing}
          </span>
        </div>

        <div className="section-filter">
          <button
            className={sectionFilter === "all" ? "is-active" : ""}
            onClick={() => setSectionFilter("all")}
          >
            All sections
          </button>
          {sectionOptions.map((section) => (
            <button
              key={section}
              className={sectionFilter === section ? "is-active" : ""}
              onClick={() => setSectionFilter(section)}
            >
              {section}
            </button>
          ))}
        </div>

        {tableView === "grid" ? (
          <div className="table-grid">
            {filteredTables.map((table) => (
              <button
                key={table.id}
                className={`table-card table-card--${table.status} ${
                  table.id === selectedTableId ? "is-selected" : ""
                }`}
                onClick={() => handleTableTap(table)}
              >
                <div className="table-card__top">
                  <div>
                    <strong>Table {table.number}</strong>
                    <span>{table.section_name}</span>
                  </div>
                  <span className={`table-state table-state--${table.status}`}>{table.status}</span>
                </div>
                <div className="table-card__stats">
                  <span>{table.guest_count || table.seats} guests</span>
                  <strong>{formatCurrency(table.current_total)}</strong>
                </div>
                {table.reservation ? (
                  <p className="table-card__hint">
                    {table.reservation.guest_name} · {table.reservation.party_size}p ·{" "}
                    {formatTime(table.reservation.start_time)}
                  </p>
                ) : table.current_order_id ? (
                  <p className="table-card__hint">
                    {table.item_count} items · open {table.occupied_since ? "now" : ""}
                  </p>
                ) : (
                  <p className="table-card__hint">Tap to start service</p>
                )}
              </button>
            ))}
          </div>
        ) : (
          <div className="floor-map">
            <div className="floor-map__canvas">
              {filteredTables.map((table) => {
                const width = Math.max((table.width / mapBounds.maxX) * 100, 5);
                const height = Math.max((table.height / mapBounds.maxY) * 100, 5.5);
                const left = (table.position_x / mapBounds.maxX) * 100;
                const top = (table.position_y / mapBounds.maxY) * 100;
                return (
                  <button
                    key={table.id}
                    className={`map-table map-table--${table.status} map-table--${table.shape} ${
                      table.id === selectedTableId ? "is-selected" : ""
                    }`}
                    style={{
                      left: `${left}%`,
                      top: `${top}%`,
                      width: `${width}%`,
                      height: `${height}%`,
                      transform: `rotate(${table.rotation}deg)`,
                    }}
                    onClick={() => handleTableTap(table)}
                  >
                    <span>{table.number}</span>
                    <small>{table.guest_count || table.seats}p</small>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </aside>

      <section className="workspace-pane">
        <div className="workspace-tabs">
          <button
            className={workspace === "order" ? "is-active" : ""}
            onClick={() => onWorkspaceChange("order")}
          >
            Order
          </button>
          <button
            className={workspace === "orders" ? "is-active" : ""}
            onClick={() => onWorkspaceChange("orders")}
          >
            Open Orders
            {liveOrders.length > 0 ? <span>{liveOrders.length}</span> : null}
          </button>
          <button
            className={workspace === "reservations" ? "is-active" : ""}
            onClick={() => onWorkspaceChange("reservations")}
          >
            Reservations
            {reservations.length > 0 ? <span>{reservations.length}</span> : null}
          </button>
        </div>

        {workspace === "order" ? (
          <div className="order-workspace">
            <div className="menu-pane">
              <div className="menu-pane__header">
                <div>
                  <small className="eyebrow">Selected Table</small>
                  <h2>
                    {selectedTable
                      ? `Table ${selectedTable.number} · ${selectedTable.section_name}`
                      : "Choose a table on the left"}
                  </h2>
                </div>
                {selectedTable ? (
                  <div className="table-mini-meta">
                    <span>{guestCount} guests</span>
                    <span>{selectedTable.status}</span>
                  </div>
                ) : null}
              </div>

              {selectedTable ? (
                <>
                  <div className="order-toolbar">
                    <input
                      ref={searchRef}
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search menu..."
                    />
                    <div className="guest-stepper">
                      <small className="hint">Guests</small>
                      <div className="stepper">
                        <button onClick={() => setGuestCount(selectedTable.id, guestCount - 1)}>
                          -
                        </button>
                        <span>{guestCount}</span>
                        <button onClick={() => setGuestCount(selectedTable.id, guestCount + 1)}>
                          +
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="category-tabs">
                    {menu.map((category) => (
                      <button
                        key={category.id}
                        className={category.id === activeCategory?.id ? "is-active" : ""}
                        onClick={() => setActiveCategoryId(category.id)}
                      >
                        {category.name}
                      </button>
                    ))}
                  </div>

                  <div className="menu-grid">
                    {visibleItems.map((item) => (
                      <MenuItemCard
                        key={`${item.id}-${categoryNameByItemId.get(item.id) ?? ""}`}
                        item={item}
                        categoryName={categoryNameByItemId.get(item.id) ?? activeCategory?.name ?? ""}
                        onQuickAdd={() => addToCart(item)}
                        onCustomize={() => setComposerState({ item })}
                      />
                    ))}
                    {visibleItems.length === 0 ? (
                      <div className="empty-state">
                        No menu items match this search.
                      </div>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="empty-state empty-state--large">
                  Tap a table card or floor-map target to open the order panel.
                </div>
              )}
            </div>

            <aside className="cart-pane">
              <div className="cart-pane__header">
                <div>
                  <small className="eyebrow">Current Cart</small>
                  <h2>{selectedTable ? `Table ${selectedTable.number}` : "No table selected"}</h2>
                </div>
                {selectedTable ? (
                  <button className="ghost sm" onClick={() => clearCart(selectedTable.id)}>
                    Clear
                  </button>
                ) : null}
              </div>

              {submitError ? <div className="status err">{submitError}</div> : null}
              {submitSuccess ? <div className="status ok">{submitSuccess}</div> : null}

              <div className="cart-list">
                {cart.length === 0 ? (
                  <div className="empty-state">Fast add from the menu or long-press for options.</div>
                ) : (
                  cart.map((line) => (
                    <div key={line.id} className="cart-line">
                      <div className="cart-line__main">
                        <div>
                          <strong>{line.item.name}</strong>
                          {line.modifiers.length > 0 ? (
                            <p>{line.modifiers.map((modifier) => modifier.name).join(" · ")}</p>
                          ) : null}
                          {line.notes ? <p>{line.notes}</p> : null}
                        </div>
                        <strong>{formatCurrency(lineTotal(line))}</strong>
                      </div>
                      <div className="cart-line__actions">
                        <div className="stepper">
                          <button
                            onClick={() => updateCartLineQty(selectedTableId ?? "", line.id, -1)}
                          >
                            -
                          </button>
                          <span>{line.quantity}</span>
                          <button
                            onClick={() => updateCartLineQty(selectedTableId ?? "", line.id, 1)}
                          >
                            +
                          </button>
                        </div>
                        <button
                          className="ghost sm"
                          onClick={() =>
                            setComposerState({
                              item: line.item,
                              line,
                            })
                          }
                        >
                          Edit
                        </button>
                        <button
                          className="ghost sm"
                          onClick={() => removeCartLineById(selectedTableId ?? "", line.id)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <label className="cart-note">
                <small className="hint">Kitchen note</small>
                <textarea
                  rows={3}
                  value={orderNotes}
                  onChange={(event) =>
                    selectedTableId ? setOrderNotes(selectedTableId, event.target.value) : undefined
                  }
                  placeholder="Fire mains later, allergy reminder, split pacing..."
                />
              </label>

              <div className="totals-card">
                <div className="line">
                  <span>Subtotal</span>
                  <span>{formatCurrency(cartSubtotal)}</span>
                </div>
                <div className="line">
                  <span>Tax</span>
                  <span>{formatCurrency(cartTax)}</span>
                </div>
                <div className="line grand">
                  <span>Total</span>
                  <span>{formatCurrency(cartTotal)}</span>
                </div>
              </div>

              <button
                className="primary send-button"
                disabled={!selectedTable || cart.length === 0 || submitting}
                onClick={handleSubmitOrder}
              >
                {submitting ? "Sending..." : "Send To Kitchen"}
              </button>
            </aside>
          </div>
        ) : null}

        {workspace === "orders" ? (
          <div className="service-list">
            {liveOrders
              .slice()
              .sort((left, right) => right.elapsed_minutes - left.elapsed_minutes)
              .map((order) => (
                <div
                  key={order.id}
                  className={`service-card ${
                    order.elapsed_minutes >= 30 ? "is-late" : ""
                  }`}
                >
                  <div className="service-card__header">
                    <div>
                      <small className="eyebrow">Table</small>
                      <h3>{order.table_number ? order.table_number : "Takeaway"}</h3>
                    </div>
                    <span className={`status-chip ${order.elapsed_minutes >= 30 ? "status-chip--danger" : "status-chip--occupied"}`}>
                      {order.elapsed_minutes}m
                    </span>
                  </div>
                  <div className="service-card__meta">
                    <span>{order.item_count} items</span>
                    <strong>{formatCurrency(order.total)}</strong>
                  </div>
                  <div className="service-card__actions">
                    <button
                      onClick={() => {
                        if (order.table_id != null) {
                          const table = tables.find((candidate) => Number(candidate.id) === order.table_id);
                          if (table) {
                            handleTableTap(table);
                          }
                        }
                      }}
                    >
                      Open Table
                    </button>
                    <button className="primary" onClick={() => setOpenOrderId(order.id)}>
                      Details
                    </button>
                  </div>
                </div>
              ))}
            {liveOrders.length === 0 ? (
              <div className="empty-state empty-state--large">
                No active orders right now.
              </div>
            ) : null}
          </div>
        ) : null}

        {workspace === "reservations" ? (
          <div className="reservation-board">
            <div className="pane-header">
              <div>
                <small className="eyebrow">Today</small>
                <h2>Reservations</h2>
              </div>
              <button className="ghost sm" onClick={() => void loadReservations()}>
                Refresh
              </button>
            </div>

            <section className="reservation-create">
              <div>
                <small className="eyebrow">Walk-ins & phone</small>
                <h3>Create reservation</h3>
              </div>

              <div className="reservation-create__grid">
                <label>
                  <small className="hint">Guest name</small>
                  <input
                    value={reservationGuestName}
                    onChange={(event) => setReservationGuestName(event.target.value)}
                    placeholder="Anna Schmidt"
                  />
                </label>
                <label>
                  <small className="hint">Phone</small>
                  <input
                    value={reservationGuestPhone}
                    onChange={(event) => setReservationGuestPhone(event.target.value)}
                    inputMode="tel"
                    placeholder="+49 ..."
                  />
                </label>
                <label>
                  <small className="hint">Party size</small>
                  <div className="stepper">
                    <button onClick={() => setReservationPartySize((current) => Math.max(1, current - 1))}>
                      -
                    </button>
                    <span>{reservationPartySize}</span>
                    <button onClick={() => setReservationPartySize((current) => current + 1)}>+</button>
                  </div>
                </label>
                <label>
                  <small className="hint">Duration</small>
                  <select
                    value={String(reservationDuration)}
                    onChange={(event) => setReservationDuration(Number(event.target.value))}
                  >
                    <option value="60">60 min</option>
                    <option value="90">90 min</option>
                    <option value="120">120 min</option>
                    <option value="150">150 min</option>
                  </select>
                </label>
                <label>
                  <small className="hint">Date</small>
                  <input
                    type="date"
                    value={reservationDate}
                    onChange={(event) => setReservationDate(event.target.value)}
                  />
                </label>
                <label>
                  <small className="hint">Time</small>
                  <input
                    type="time"
                    value={reservationTime}
                    onChange={(event) => setReservationTime(event.target.value)}
                  />
                </label>
                <label>
                  <small className="hint">Assign table</small>
                  <select
                    value={reservationCreateTableId}
                    onChange={(event) => setReservationCreateTableId(event.target.value)}
                  >
                    <option value="">Any available table</option>
                    {reservationAssignableTables.map((table) => (
                      <option key={table.id} value={table.id}>
                        Table {table.number} · {table.section_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="reservation-create__notes">
                  <small className="hint">Special requests</small>
                  <textarea
                    rows={2}
                    value={reservationSpecialRequest}
                    onChange={(event) => setReservationSpecialRequest(event.target.value)}
                    placeholder="Window seat, birthday dessert, stroller space..."
                  />
                </label>
              </div>

              <div className="reservation-create__actions">
                {reservationCreateError ? (
                  <div className="status err">{reservationCreateError}</div>
                ) : null}
                {reservationCreateSuccess ? (
                  <div className="status ok">{reservationCreateSuccess}</div>
                ) : null}
                <button
                  className="primary"
                  onClick={() => void handleCreateReservation()}
                  disabled={creatingReservation}
                >
                  {creatingReservation ? "Creating..." : "Create reservation"}
                </button>
              </div>
            </section>

            {reservationsError ? <div className="status err">{reservationsError}</div> : null}
            {reservationsLoading ? <div className="empty-state">Loading reservations...</div> : null}

            {!reservationsLoading && reservations.length === 0 ? (
              <div className="empty-state empty-state--large">
                No reservations scheduled for today.
              </div>
            ) : null}

            <div className="reservation-list">
              {reservations.map((reservation) => (
                <div key={reservation.id} className="reservation-card">
                  <div className="reservation-card__header">
                    <div>
                      <small className="eyebrow">{formatTime(reservation.start_time)}</small>
                      <h3>{reservation.guest_name}</h3>
                    </div>
                    <span className="status-chip status-chip--reserved">
                      {reservation.party_size} guests
                    </span>
                  </div>

                  <div className="reservation-card__meta">
                    <span>Status: {reservation.status}</span>
                    <span>{reservation.special_requests || "No special requests"}</span>
                  </div>

                  <div className="reservation-card__actions">
                    <select
                      value={reservationTableDrafts[reservation.id] ?? ""}
                      onChange={(event) =>
                        setReservationTableDrafts((current) => ({
                          ...current,
                          [reservation.id]: event.target.value,
                        }))
                      }
                    >
                      <option value="">Assign table</option>
                      {reservationAssignableTables.map((table) => (
                        <option key={table.id} value={table.id}>
                          Table {table.number} · {table.section_name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => void handleReservationAssign(reservation.id)}
                      disabled={reservationBusyId === reservation.id}
                    >
                      Assign
                    </button>
                    <button
                      className="primary"
                      onClick={() => void handleReservationArrived(reservation.id)}
                      disabled={reservationBusyId === reservation.id}
                    >
                      Mark Arrived
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {openOrderId != null ? (
        <OrderDetailModal orderId={openOrderId} onClose={() => setOpenOrderId(null)} />
      ) : null}

      {composerState ? (
        <ItemComposerDialog
          state={composerState}
          onClose={() => setComposerState(null)}
          onSave={({ quantity, notes, modifierIds }) => {
            if (!selectedTableId) {
              setComposerState(null);
              return;
            }

            if (composerState.line) {
              updateCartLine(selectedTableId, composerState.line.id, {
                item: composerState.item,
                quantity,
                notes,
                modifierIds,
              });
            } else {
              upsertCartLine(selectedTableId, {
                item: composerState.item,
                quantity,
                notes,
                modifierIds,
              });
            }
            setComposerState(null);
          }}
        />
      ) : null}
    </div>
  );
}
