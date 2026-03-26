import {
  buildAvailabilityPath,
  buildRestaurantOrderPayload,
  buildRestaurantReservationPayload,
  readRuntimeConfig,
  summarizeOrderStatus,
} from "./guest-logic.js";

const state = {
  config: readRuntimeConfig(window),
  menu: [],
  selectedCategory: "",
  search: "",
  cart: [],
  table: null,
  loadingMenu: false,
  currentOrder: null,
  orderStatus: null,
  orderPollHandle: null,
  reservationSlots: [],
  reservationLoading: false,
};

const storage = {
  guestName: "das-elb-rest.guest-name",
  tableCode: "das-elb-rest.table-code",
  currentOrder: "das-elb-rest.current-order",
};

const $ = (selector) => document.querySelector(selector);

const elements = {
  apiUrl: $("#api-url"),
  restaurantId: $("#restaurant-id"),
  menuStatus: $("#menu-status"),
  menuSearch: $("#menu-search"),
  categoryChips: $("#menu-categories"),
  menuList: $("#menu-list"),
  tableCode: $("#table-code"),
  guestName: $("#guest-name"),
  tableSummary: $("#table-summary"),
  tableMessage: $("#table-message"),
  tableLoadButton: $("#load-table"),
  orderMessage: $("#order-message"),
  orderNotes: $("#order-notes"),
  cartItems: $("#cart-items"),
  cartTotal: $("#cart-total"),
  submitOrder: $("#submit-order"),
  tracker: $("#order-tracker"),
  trackerMessage: $("#tracker-message"),
  refreshOrderStatus: $("#refresh-order-status"),
  reservationForm: $("#reservation-form"),
  reservationMessage: $("#reservation-message"),
  reservationName: $("#reservation-guest-name"),
  reservationEmail: $("#reservation-email"),
  reservationPhone: $("#reservation-phone"),
  reservationPartySize: $("#reservation-party-size"),
  reservationDate: $("#reservation-date"),
  reservationTime: $("#reservation-time"),
  reservationSpecialRequests: $("#reservation-special-requests"),
  reservationSubmit: $("#submit-reservation"),
  availabilityStatus: $("#availability-status"),
  availabilitySlots: $("#availability-slots"),
};

function setStatus(element, message, tone = "muted") {
  if (!element) {
    return;
  }
  element.textContent = message;
  element.dataset.tone = tone;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(Number(value || 0));
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function generateIdempotencyKey() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `rest-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function apiUrl(path) {
  return `${state.config.apiBaseUrl}${path}`;
}

async function getJson(path, options = {}) {
  const response = await fetch(apiUrl(path), options);
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const detail =
      payload?.detail ||
      payload?.message ||
      `Request failed with ${response.status}`;
    const error = new Error(detail);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function persistState() {
  localStorage.setItem(storage.guestName, elements.guestName.value.trim());
  localStorage.setItem(storage.tableCode, elements.tableCode.value.trim());
  if (state.currentOrder) {
    localStorage.setItem(storage.currentOrder, JSON.stringify(state.currentOrder));
  } else {
    localStorage.removeItem(storage.currentOrder);
  }
}

function restorePersistedState() {
  const guestName = localStorage.getItem(storage.guestName);
  const tableCode = state.config.defaultTableCode || localStorage.getItem(storage.tableCode);
  const currentOrder = localStorage.getItem(storage.currentOrder);

  if (guestName) {
    elements.guestName.value = guestName;
    elements.reservationName.value = guestName;
  }
  if (tableCode) {
    elements.tableCode.value = tableCode;
  }
  if (currentOrder) {
    try {
      state.currentOrder = JSON.parse(currentOrder);
    } catch {
      localStorage.removeItem(storage.currentOrder);
    }
  }
}

function getFilteredMenu() {
  const query = state.search.trim().toLowerCase();
  return state.menu
    .map((category) => ({
      ...category,
      items: category.items.filter((item) => {
        const matchesCategory = !state.selectedCategory || category.name === state.selectedCategory;
        const matchesSearch =
          !query ||
          item.name.toLowerCase().includes(query) ||
          String(item.description || "").toLowerCase().includes(query);
        return matchesCategory && matchesSearch;
      }),
    }))
    .filter((category) => category.items.length > 0);
}

function cartQuantity(menuItemId) {
  return state.cart.find((entry) => entry.menu_item_id === menuItemId)?.quantity || 0;
}

function renderCategoryChips() {
  const categories = state.menu.map((category) => category.name);
  elements.categoryChips.innerHTML = categories
    .map(
      (name) => `
        <button
          type="button"
          class="chip ${state.selectedCategory === name ? "is-active" : ""}"
          data-category="${escapeHtml(name)}"
        >
          ${escapeHtml(name)}
        </button>
      `,
    )
    .join("");
}

function renderMenu() {
  renderCategoryChips();
  const categories = getFilteredMenu();
  if (state.loadingMenu) {
    elements.menuList.innerHTML = '<div class="empty-state">Loading the live gastronomy menu…</div>';
    return;
  }
  if (categories.length === 0) {
    elements.menuList.innerHTML =
      '<div class="empty-state">No dishes match the current filter. Try another category or search term.</div>';
    return;
  }

  elements.menuList.innerHTML = categories
    .map(
      (category) => `
        <section class="menu-category">
          <div class="section-header">
            <div>
              <h3>${escapeHtml(category.name)}</h3>
              <p>${category.items.length} live dishes</p>
            </div>
          </div>
          <div class="menu-grid">
            ${category.items
              .map((item) => {
                const quantity = cartQuantity(item.id);
                return `
                  <article class="menu-card" data-menu-item="${item.id}">
                    <div class="menu-card__top">
                      <div>
                        <h4>${escapeHtml(item.name)}</h4>
                        <p>${escapeHtml(item.description || "Chef selection from the current gastronomy menu.")}</p>
                      </div>
                      <strong>${formatCurrency(item.price)}</strong>
                    </div>
                    <div class="menu-meta">
                      <span>${escapeHtml(item.category_name)}</span>
                      <span>${item.prep_time_min} min</span>
                      <span>${item.is_available ? "Available now" : "Unavailable"}</span>
                    </div>
                    <div class="menu-card__actions">
                      ${
                        quantity > 0
                          ? `
                            <div class="qty-control">
                              <button type="button" data-cart-action="decrease" data-item-id="${item.id}">−</button>
                              <span>${quantity}</span>
                              <button type="button" data-cart-action="increase" data-item-id="${item.id}">+</button>
                            </div>
                          `
                          : `<button type="button" class="primary-button" data-cart-action="add" data-item-id="${item.id}" ${item.is_available ? "" : "disabled"}>Add to cart</button>`
                      }
                    </div>
                  </article>
                `;
              })
              .join("")}
          </div>
        </section>
      `,
    )
    .join("");
}

function renderCart() {
  if (state.cart.length === 0) {
    elements.cartItems.innerHTML = '<div class="empty-state">Browse the menu and add dishes to build a live table order.</div>';
    elements.cartTotal.textContent = formatCurrency(0);
    elements.submitOrder.disabled = true;
    return;
  }

  const total = state.cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  elements.cartItems.innerHTML = state.cart
    .map(
      (item) => `
        <div class="cart-row">
          <div>
            <strong>${escapeHtml(item.name)}</strong>
            <p>${formatCurrency(item.unit_price)} each</p>
          </div>
          <div class="qty-control">
            <button type="button" data-cart-action="decrease" data-item-id="${item.menu_item_id}">−</button>
            <span>${item.quantity}</span>
            <button type="button" data-cart-action="increase" data-item-id="${item.menu_item_id}">+</button>
          </div>
        </div>
      `,
    )
    .join("");
  elements.cartTotal.textContent = formatCurrency(total);
  elements.submitOrder.disabled = !state.table || state.cart.length === 0;
}

function renderTableContext() {
  if (!state.table) {
    elements.tableSummary.innerHTML = "<strong>No live table context loaded.</strong> Scan or paste a QR/table code to unlock dine-in ordering.";
    return;
  }
  elements.tableSummary.innerHTML = `
    <strong>Table ${escapeHtml(state.table.table_number)}</strong>
    <span>${escapeHtml(state.table.section_name)} · capacity ${state.table.capacity}</span>
  `;
}

function renderOrderTracker() {
  if (!state.currentOrder) {
    elements.tracker.innerHTML =
      '<div class="empty-state">Place a live order to track its status here and hand it into the waiter / kitchen flow.</div>';
    elements.refreshOrderStatus.disabled = true;
    return;
  }

  const publicStatus = state.orderStatus || {
    order_id: state.currentOrder.order_id,
    status: state.currentOrder.status,
    items: [],
  };
  const summary = summarizeOrderStatus(publicStatus);

  elements.refreshOrderStatus.disabled = false;
  elements.tracker.innerHTML = `
    <div class="tracker-grid">
      <div>
        <p class="kicker">Current order</p>
        <h3>#${publicStatus.order_id}</h3>
        <p>${escapeHtml(state.currentOrder.message || "Guest order created successfully.")}</p>
      </div>
      <div class="status-pill">${escapeHtml(publicStatus.status || "pending")}</div>
    </div>
    <div class="tracker-stats">
      <span>Pending ${summary.pending}</span>
      <span>Preparing ${summary.preparing}</span>
      <span>Ready ${summary.ready}</span>
      <span>Served ${summary.served}</span>
    </div>
    <div class="tracker-items">
      ${(publicStatus.items || [])
        .map(
          (item) => `
            <div class="tracker-item">
              <span>${item.quantity}× item #${item.menu_item_id}</span>
              <strong>${escapeHtml(item.status)}</strong>
            </div>
          `,
        )
        .join("") || '<div class="empty-state">Kitchen and waiter status becomes richer as the order moves through service.</div>'}
    </div>
  `;
}

function renderAvailability() {
  if (state.reservationLoading) {
    elements.availabilitySlots.innerHTML = '<div class="empty-state">Checking live restaurant availability…</div>';
    return;
  }
  if (!state.reservationSlots.length) {
    elements.availabilitySlots.innerHTML =
      '<div class="empty-state">Choose a date and party size to load the live reservation slots.</div>';
    return;
  }

  elements.availabilitySlots.innerHTML = state.reservationSlots
    .map(
      (slot) => `
        <button
          type="button"
          class="slot-pill ${slot.available ? "is-available" : "is-unavailable"}"
          data-slot-time="${slot.start_time}"
          ${slot.available ? "" : "disabled"}
        >
          <span>${slot.start_time.slice(0, 5)}–${slot.end_time.slice(0, 5)}</span>
          <small>${slot.available ? `${slot.table_options || 0} tables` : "Not available"}</small>
        </button>
      `,
    )
    .join("");
}

async function loadMenu(tableCode = "") {
  state.loadingMenu = true;
  renderMenu();
  try {
    const normalizedTableCode = String(tableCode || "").trim();
    const path = normalizedTableCode
      ? `/qr/menu/${encodeURIComponent(normalizedTableCode)}`
      : "/public/restaurant/menu";
    const data = await getJson(path);
    state.menu = data.categories || [];
    const categoryNames = state.menu.map((category) => category.name);
    if (state.selectedCategory && !categoryNames.includes(state.selectedCategory)) {
      state.selectedCategory = "";
    }
    if (!state.selectedCategory && state.menu.length) {
      state.selectedCategory = state.menu[0].name;
    }
    setStatus(
      elements.menuStatus,
      normalizedTableCode
        ? "Live menu scoped to the current table and restaurant."
        : "Live menu connected to gastronomy backend.",
      "success",
    );
  } catch (error) {
    setStatus(elements.menuStatus, error.message, "error");
  } finally {
    state.loadingMenu = false;
    renderMenu();
  }
}

function upsertCartItem(menuItemId, delta) {
  const category = state.menu.find((entry) =>
    entry.items.some((item) => item.id === menuItemId),
  );
  const item = category?.items.find((entry) => entry.id === menuItemId);
  if (!item) {
    return;
  }

  const existing = state.cart.find((entry) => entry.menu_item_id === menuItemId);
  if (!existing && delta > 0) {
    state.cart.push({
      menu_item_id: item.id,
      name: item.name,
      unit_price: Number(item.price),
      quantity: delta,
      notes: null,
    });
  } else if (existing) {
    existing.quantity += delta;
    if (existing.quantity <= 0) {
      state.cart = state.cart.filter((entry) => entry.menu_item_id !== menuItemId);
    }
  }

  renderMenu();
  renderCart();
}

async function loadTableContext() {
  const code = elements.tableCode.value.trim();
  if (!code) {
    setStatus(elements.tableMessage, "Enter a table or QR code first.", "error");
    return;
  }
  setStatus(elements.tableMessage, "Loading live table context…", "muted");
  try {
    state.table = await getJson(`/public/restaurant/table/${encodeURIComponent(code)}`);
    await loadMenu(code);
    renderTableContext();
    setStatus(elements.tableMessage, "Table context connected. Orders will route into gastronomy service.", "success");
    persistState();
    renderCart();
  } catch (error) {
    state.table = null;
    await loadMenu();
    renderTableContext();
    renderCart();
    setStatus(elements.tableMessage, error.message, "error");
  }
}

function stopOrderPolling() {
  if (state.orderPollHandle) {
    window.clearInterval(state.orderPollHandle);
    state.orderPollHandle = null;
  }
}

async function refreshOrderStatus() {
  if (!state.currentOrder?.order_id) {
    return;
  }
  try {
    state.orderStatus = await getJson(`/qr/order/${state.currentOrder.order_id}/status`);
    renderOrderTracker();
    setStatus(elements.trackerMessage, "Order status synced from the live backend.", "success");
  } catch (error) {
    setStatus(elements.trackerMessage, error.message, "error");
  }
}

function startOrderPolling() {
  stopOrderPolling();
  if (!state.currentOrder?.order_id) {
    return;
  }
  refreshOrderStatus();
  state.orderPollHandle = window.setInterval(refreshOrderStatus, 10000);
}

async function submitOrder(event) {
  event.preventDefault();
  try {
    const payload = buildRestaurantOrderPayload({
      tableCode: elements.tableCode.value,
      guestName: elements.guestName.value,
      notes: elements.orderNotes.value,
      items: state.cart,
    });
    const data = await getJson("/public/restaurant/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    state.currentOrder = data;
    state.orderStatus = null;
    state.cart = [];
    elements.orderNotes.value = "";
    persistState();
    renderCart();
    renderMenu();
    renderOrderTracker();
    startOrderPolling();
    setStatus(
      elements.orderMessage,
      `Order #${data.order_id} created. Service can now see it in the gastronomy order flow and send it to kitchen.`,
      "success",
    );
  } catch (error) {
    setStatus(elements.orderMessage, error.message, "error");
  }
}

async function refreshAvailability() {
  const reservationDate = elements.reservationDate.value;
  const partySize = elements.reservationPartySize.value;
  if (!state.config.restaurantId) {
    setStatus(
      elements.availabilityStatus,
      "Restaurant ID is not configured for this environment. Reservation lookup is disabled until runtime config provides it.",
      "error",
    );
    state.reservationSlots = [];
    renderAvailability();
    return;
  }
  if (!reservationDate || !partySize) {
    state.reservationSlots = [];
    renderAvailability();
    return;
  }
  state.reservationLoading = true;
  renderAvailability();
  try {
    const path = buildAvailabilityPath({
      restaurantId: state.config.restaurantId,
      reservationDate,
      partySize,
    });
    const data = await getJson(path);
    state.reservationSlots = data.slots || [];
    setStatus(elements.availabilityStatus, "Live restaurant availability loaded.", "success");
  } catch (error) {
    state.reservationSlots = [];
    setStatus(elements.availabilityStatus, error.message, "error");
  } finally {
    state.reservationLoading = false;
    renderAvailability();
  }
}

async function submitReservation(event) {
  event.preventDefault();
  try {
    const payload = buildRestaurantReservationPayload(
      {
        restaurantId: state.config.restaurantId,
        guestName: elements.reservationName.value,
        email: elements.reservationEmail.value,
        phone: elements.reservationPhone.value,
        partySize: elements.reservationPartySize.value,
        reservationDate: elements.reservationDate.value,
        startTime: elements.reservationTime.value,
        specialRequests: elements.reservationSpecialRequests.value,
      },
      state.config,
    );
    const data = await getJson("/reservations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": generateIdempotencyKey(),
      },
      body: JSON.stringify(payload),
    });
    setStatus(
      elements.reservationMessage,
      `Reservation #${data.id} confirmed for ${data.guest_name}. It is now visible in the gastronomy reservation flow.`,
      "success",
    );
  } catch (error) {
    if (error.status === 409) {
      setStatus(elements.reservationMessage, "Not available for the selected time. Please choose another slot.", "error");
      return;
    }
    if (error.status === 400) {
      setStatus(elements.reservationMessage, "Invalid input. Please check the reservation details.", "error");
      return;
    }
    setStatus(elements.reservationMessage, error.message, "error");
  }
}

function bindEvents() {
  elements.menuSearch.addEventListener("input", (event) => {
    state.search = event.target.value;
    renderMenu();
  });

  elements.categoryChips.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) {
      return;
    }
    state.selectedCategory = button.dataset.category === state.selectedCategory ? "" : button.dataset.category;
    renderMenu();
  });

  elements.menuList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-cart-action]");
    if (!button) {
      return;
    }
    const menuItemId = Number(button.dataset.itemId);
    const action = button.dataset.cartAction;
    if (action === "add" || action === "increase") {
      upsertCartItem(menuItemId, 1);
    } else if (action === "decrease") {
      upsertCartItem(menuItemId, -1);
    }
  });

  elements.cartItems.addEventListener("click", (event) => {
    const button = event.target.closest("[data-cart-action]");
    if (!button) {
      return;
    }
    const menuItemId = Number(button.dataset.itemId);
    const action = button.dataset.cartAction;
    if (action === "increase") {
      upsertCartItem(menuItemId, 1);
    } else if (action === "decrease") {
      upsertCartItem(menuItemId, -1);
    }
  });

  elements.tableLoadButton.addEventListener("click", () => loadTableContext());
  elements.submitOrder.addEventListener("click", submitOrder);
  elements.refreshOrderStatus.addEventListener("click", () => refreshOrderStatus());
  elements.reservationForm.addEventListener("submit", submitReservation);

  for (const element of [
    elements.reservationDate,
    elements.reservationPartySize,
  ]) {
    element.addEventListener("change", () => refreshAvailability());
  }

  elements.availabilitySlots.addEventListener("click", (event) => {
    const button = event.target.closest("[data-slot-time]");
    if (!button) {
      return;
    }
    elements.reservationTime.value = button.dataset.slotTime.slice(0, 5);
  });

  elements.guestName.addEventListener("input", () => {
    if (!elements.reservationName.value) {
      elements.reservationName.value = elements.guestName.value;
    }
    persistState();
  });
  elements.tableCode.addEventListener("input", persistState);
}

function seedDefaults() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (!elements.reservationDate.value) {
    elements.reservationDate.value = tomorrow.toISOString().slice(0, 10);
  }
  if (!elements.reservationTime.value) {
    elements.reservationTime.value = "19:00";
  }
  if (!elements.reservationPartySize.value) {
    elements.reservationPartySize.value = "2";
  }
}

async function init() {
  elements.apiUrl.textContent = state.config.apiBaseUrl;
  elements.restaurantId.textContent = state.config.restaurantId ? String(state.config.restaurantId) : "missing";
  restorePersistedState();
  seedDefaults();
  bindEvents();
  renderMenu();
  renderCart();
  renderTableContext();
  renderOrderTracker();
  renderAvailability();

  await loadMenu();
  if (elements.tableCode.value.trim()) {
    await loadTableContext();
  }
  await refreshAvailability();
  if (state.currentOrder) {
    startOrderPolling();
  }
}

void init();
