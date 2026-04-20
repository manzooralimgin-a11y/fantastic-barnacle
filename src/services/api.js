/**
 * Real API Service Layer
 * Connects the Guest App to the shared FastAPI backend.
 *
 * Base URL: VITE_API_BASE_URL (e.g. http://localhost:8000)
 * Auth:     Bearer JWT issued by POST /api/guest/auth
 *
 * All functions preserve the same shape as the previous mock layer so the
 * rest of the app (AppContext, screens) requires no changes.
 */

const BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '')

// ---------------------------------------------------------------------------
// Token storage  (shared with AppContext via localStorage key 'accessToken')
// ---------------------------------------------------------------------------
const TOKEN_KEY = 'accessToken'

function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}
function setToken(t) {
  try { localStorage.setItem(TOKEN_KEY, t) } catch { /* noop */ }
}
function clearToken() {
  try { localStorage.removeItem(TOKEN_KEY) } catch { /* noop */ }
}

// ---------------------------------------------------------------------------
// Generic fetch helpers
// ---------------------------------------------------------------------------
async function http(path, { method = 'GET', body, auth = false, token } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  const tok = token ?? getToken()
  if (auth && tok) headers['Authorization'] = `Bearer ${tok}`

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const err = await res.json()
      detail = err.detail || err.message || detail
    } catch { /* ignore */ }
    throw new Error(detail)
  }

  // 204 No Content — return null
  if (res.status === 204) return null
  return res.json()
}

// ---------------------------------------------------------------------------
// Shape helpers — map snake_case backend → camelCase frontend
// ---------------------------------------------------------------------------
function mapStayToApp(stay) {
  const { guest: g, booking: b } = stay
  return {
    guest: {
      id:            String(g.id),
      firstName:     g.first_name,
      lastName:      g.last_name,
      email:         g.email  || '',
      phone:         g.phone  || '',
      bookingNumber: g.booking_number,
    },
    booking: {
      roomNumber:    b.room_number,
      floor:         b.floor ?? null,
      roomType:      b.room_type,
      checkInDate:   b.check_in_date,
      checkOutDate:  b.check_out_date,
      nights:        b.nights,
      paymentStatus: b.payment_status,
      checkInStatus: b.check_in_status,
      keyStatus:     b.key_status,
      preferences:   b.preferences || {},
    },
    stayStatus:      stay.stay_status,
    folioBalanceDue: stay.folio_balance_due ?? 0,
  }
}

// ---------------------------------------------------------------------------
// AUTH
// ---------------------------------------------------------------------------
export const authApi = {
  /**
   * Login with booking number + last name.
   * Returns { guest, booking, accessToken } matching AppContext expectations.
   */
  login: async ({ bookingNumber, lastName }) => {
    const auth = await http('/api/guest/auth', {
      method: 'POST',
      body: { booking_id: bookingNumber, last_name: lastName },
    })
    setToken(auth.access_token)

    // Fetch full stay details
    const stay = await http('/api/guest/stay', { auth: true, token: auth.access_token })
    const mapped = mapStayToApp(stay)

    return {
      guest:       mapped.guest,
      booking:     mapped.booking,
      accessToken: auth.access_token,
    }
  },

  logout: async () => {
    clearToken()
    return { success: true }
  },

  /** Validate a stored token by fetching stay. */
  validateToken: async (token) => {
    if (!token) throw new Error('No token.')
    await http('/api/guest/stay', { auth: true, token })
    return { valid: true }
  },
}

// ---------------------------------------------------------------------------
// ID VERIFICATION
// ---------------------------------------------------------------------------
export const idVerificationApi = {
  /**
   * Submit a captured ID image for verification.
   * Backend endpoint: POST /api/guest/id-verifications
   */
  submitIDVerification: async ({ imageData, side, mimeType }) => {
    return http('/api/guest/id-verifications', {
      method: 'POST',
      auth:   true,
      body:   { image_data: imageData || null, side, mime_type: mimeType || null },
    })
  },

  /** Mark the full verification flow as complete for this booking. */
  completeVerification: async (verificationIds) => {
    return http('/api/guest/id-verifications/complete', {
      method: 'POST',
      auth:   true,
      body:   { verification_ids: verificationIds || [] },
    })
  },
}

// ---------------------------------------------------------------------------
// ROOM KEY
// ---------------------------------------------------------------------------
export const roomKeyApi = {
  /**
   * Provision a digital room key for the authenticated guest.
   * Backend endpoint: POST /api/guest/key
   */
  assignRoomKey: async ({ guestId, bookingNumber, roomNumber }) => {
    return http('/api/guest/key', {
      method: 'POST',
      auth:   true,
      body:   {},  // backend derives context from JWT claims
    })
  },

  deactivateKey: async (_keyId) => {
    // No dedicated endpoint — request is logged via front-desk
    await _guestRequest({
      title:       'Room key deactivation',
      category:    'Reception',
      description: 'Guest requested key deactivation.',
      urgency:     'normal',
    })
    return { keyStatus: 'inactive', deactivatedAt: new Date().toISOString() }
  },

  getKeyStatus: async (_bookingNumber) => {
    const stay = await http('/api/guest/stay', { auth: true })
    const keyStatus = stay.booking?.key_status ?? 'not_assigned'
    return { keyStatus, roomKey: null }
  },
}

// ---------------------------------------------------------------------------
// ROOM DETAILS  (derived from /api/guest/stay)
// ---------------------------------------------------------------------------
export const roomDetailsApi = {
  getRoomDetails: async ({ roomNumber }) => {
    const stay = await http('/api/guest/stay', { auth: true })
    const mapped = mapStayToApp(stay)
    const { booking } = mapped

    return {
      roomNumber:      booking.roomNumber,
      roomType:        booking.roomType,
      category:        booking.roomType,
      floor:           booking.floor,
      sqm:             null,
      maxOccupancy:    2,
      view:            null,
      bedType:         null,
      smokingAllowed:  false,
      petsAllowed:     false,
      checkInTime:     booking.checkInDate,
      checkOutTime:    booking.checkOutDate,
      nights:          booking.nights,
      occupancyStatus: booking.checkInStatus === 'checked_in' ? 'occupied' : 'vacant',
      amenities:       [],
      folio: {
        balance:       stay.folio_balance_due ?? 0,
        currency:      'EUR',
        paymentStatus: booking.paymentStatus,
      },
      doNotDisturb: false,
      temperature:  null,
    }
  },

  requestLateCheckout: async (_bookingNumber) => {
    const res = await _guestRequest({
      title:       'Late checkout request',
      category:    'Reception',
      description: 'Guest requesting late checkout.',
      urgency:     'soon',
    })
    return { approved: null, message: 'Your late checkout request has been received. We will confirm shortly.', ticketId: res?.ticket_id }
  },

  setTemperature: async ({ roomNumber, temperature }) => {
    await _guestRequest({
      title:       'Temperature adjustment',
      category:    'Maintenance',
      description: `Guest requesting room temperature set to ${temperature}°C.`,
      urgency:     'normal',
    })
    return { temperature, updatedAt: new Date().toISOString() }
  },
}

// ---------------------------------------------------------------------------
// ROOM SERVICE  (menu from public QR endpoint, orders via guest requests)
// ---------------------------------------------------------------------------
export const roomServiceApi = {
  getMenu: async () => {
    const data = await http('/api/qr/menu')
    // QR menu returns { categories: [{ id, name, items: [...] }] }
    // Normalise to the shape the app expects
    const categories = (data.categories || []).map(cat => ({
      id:            String(cat.id),
      label:         cat.name,
      icon:          'utensils',
      availableFrom: '06:30',
      availableTo:   '23:00',
      items: (cat.items || []).map(item => ({
        id:          String(item.id),
        name:        item.name,
        description: item.description || '',
        price:       item.price,
        image:       item.image_url || null,
        allergens:   item.allergens || [],
        vegetarian:  (item.dietary_tags || []).includes('vegetarian'),
        available:   item.is_available,
      })),
    }))
    return { categories }
  },

  placeOrder: async (order) => {
    // Submit via guest request (room service category) — provides SMS/push trail
    const itemsSummary = (order.items || [])
      .map(i => `${i.quantity}× ${i.name} (€${i.price})`)
      .join(', ')
    const total = (order.items || []).reduce((s, i) => s + i.price * i.quantity, 0)

    const res = await _guestRequest({
      title:       'Room service order',
      category:    'Reception',
      description: `Room service: ${itemsSummary}. Total: €${total.toFixed(2)}. ${order.notes || ''}`.trim(),
      urgency:     'soon',
    })
    return {
      orderId:           res?.ticket_id || `RS-${Date.now()}`,
      status:            'confirmed',
      estimatedDelivery: new Date(Date.now() + 25 * 60 * 1000).toISOString(),
      totalAmount:       total,
    }
  },

  getOrderStatus: async (orderId) => {
    return { orderId, status: 'preparing', estimatedDelivery: new Date(Date.now() + 15 * 60 * 1000).toISOString() }
  },

  getOrderHistory: async () => {
    const requests = await http('/api/guest/requests', { auth: true })
    return (requests || [])
      .filter(r => r.category === 'Reception' && r.title?.toLowerCase().includes('room service'))
      .map(r => ({ id: r.ticket_id, title: r.title, status: r.status, date: r.submitted_at }))
  },
}

// ---------------------------------------------------------------------------
// HOUSEKEEPING
// ---------------------------------------------------------------------------
export const housekeepingApi = {
  requestCleaning: async (type) => {
    const res = await _guestRequest({
      title:       type === 'full' ? 'Full room cleaning' : 'Turn-down service',
      category:    'Housekeeping',
      description: `Guest requested ${type} cleaning service.`,
      urgency:     'normal',
    })
    return { requestId: res?.ticket_id || `HK-${Date.now()}`, type, status: 'open', estimatedTime: '30 minutes' }
  },

  requestAmenities: async (items) => {
    const names = Array.isArray(items) ? items.map(i => i.name || i).join(', ') : String(items)
    const res = await _guestRequest({
      title:       'Amenity request',
      category:    'Housekeeping',
      description: `Guest requested: ${names}`,
      urgency:     'normal',
    })
    return { requestId: res?.ticket_id || `AM-${Date.now()}`, items, status: 'open' }
  },

  setDoNotDisturb: async (active) => {
    await _guestRequest({
      title:       active ? 'Do Not Disturb — activate' : 'Do Not Disturb — deactivate',
      category:    'Housekeeping',
      description: `Guest ${active ? 'activated' : 'deactivated'} Do Not Disturb.`,
      urgency:     'normal',
    })
    return { doNotDisturb: active }
  },

  getAmenityList: async () => {
    // Static amenity catalogue — backend does not expose a public list endpoint
    return [
      { id: 'a-01', name: 'Extra Towels',      category: 'linens',     icon: 'wind' },
      { id: 'a-02', name: 'Extra Pillows',      category: 'linens',     icon: 'cloud' },
      { id: 'a-03', name: 'Bathrobe',           category: 'linens',     icon: 'shirt' },
      { id: 'a-04', name: 'Toothbrush Kit',     category: 'toiletries', icon: 'smile' },
      { id: 'a-05', name: 'Shaving Kit',        category: 'toiletries', icon: 'scissors' },
      { id: 'a-06', name: 'Sewing Kit',         category: 'toiletries', icon: 'pen-tool' },
      { id: 'a-07', name: 'Bottled Water (x2)', category: 'food',       icon: 'droplets' },
      { id: 'a-08', name: 'Minibar Restock',    category: 'beverages',  icon: 'wine' },
      { id: 'a-09', name: 'HDMI Cable',         category: 'tech',       icon: 'monitor' },
      { id: 'a-10', name: 'Power Adapter',      category: 'tech',       icon: 'zap' },
      { id: 'a-11', name: 'Iron & Board',       category: 'other',      icon: 'wind' },
      { id: 'a-12', name: 'Yoga Mat',           category: 'other',      icon: 'activity' },
    ]
  },
}

// ---------------------------------------------------------------------------
// SPA  (book via guest requests; slots are generated client-side)
// ---------------------------------------------------------------------------
export const spaApi = {
  getServices: async () => {
    // No backend spa catalogue — return standard hotel spa menu
    return [
      { id: 'sp-01', name: 'Swedish Massage',  duration: 60, price: 95,  category: 'massage',  description: 'Classic full-body relaxation massage.' },
      { id: 'sp-02', name: 'Deep Tissue',      duration: 90, price: 130, category: 'massage',  description: 'Targeted muscle relief therapy.' },
      { id: 'sp-03', name: 'Hot Stone',        duration: 75, price: 115, category: 'massage',  description: 'Warmed basalt stones melt tension away.' },
      { id: 'sp-04', name: 'Facial Classic',   duration: 60, price: 85,  category: 'facial',   description: 'Deep cleanse, exfoliation & hydration.' },
      { id: 'sp-05', name: 'Manicure',         duration: 45, price: 55,  category: 'nails',    description: 'Shape, buff & polish.' },
      { id: 'sp-06', name: 'Yoga Session',     duration: 60, price: 60,  category: 'wellness', description: 'Private session with our resident instructor.' },
    ]
  },

  getAvailableSlots: async (_serviceId, _date) => {
    // Generate slots — availability is confirmed by front desk after booking
    const slots = []
    for (let h = 9; h <= 18; h++) {
      slots.push(`${String(h).padStart(2, '0')}:00`)
      if (h < 18) slots.push(`${String(h).padStart(2, '0')}:30`)
    }
    return slots
  },

  book: async (booking) => {
    const res = await _guestRequest({
      title:       `Spa booking: ${booking.serviceName || booking.serviceId}`,
      category:    'Reception',
      description: `Spa appointment requested for ${booking.date} at ${booking.time}. Service: ${booking.serviceName || booking.serviceId}.`,
      urgency:     'normal',
    })
    return { bookingId: res?.ticket_id || `SPA-${Date.now()}`, ...booking, status: 'confirmed' }
  },
}

// ---------------------------------------------------------------------------
// CONCIERGE  (all mapped to guest requests)
// ---------------------------------------------------------------------------
export const conciergeApi = {
  sendMessage: async (message) => {
    const res = await _guestRequest({
      title:       'Concierge message',
      category:    'General',
      description: message,
      urgency:     'normal',
    })
    return {
      messageId: res?.ticket_id || `MSG-${Date.now()}`,
      reply:     'Thank you for your message. A member of our concierge team will be with you shortly.',
      timestamp: new Date().toISOString(),
    }
  },

  getRecommendations: async (_category) => {
    // Static content — nearby Magdeburg attractions and dining close to Seilerweg 19
    return [
      { id: 'rec-01', name: 'Restaurant Pforte',        category: 'dining',     rating: 4.8, distance: '200m',  description: 'Fine dining with Elbe views, right next door.' },
      { id: 'rec-02', name: 'Magdeburger Dom',           category: 'culture',    rating: 4.9, distance: '1.0km', description: 'Germany\'s oldest Gothic cathedral, founded 937 AD.' },
      { id: 'rec-03', name: 'Elbauenpark',               category: 'activity',   rating: 4.6, distance: '2.5km', description: 'Riverside leisure park with the Jahrtausendturm tower.' },
      { id: 'rec-04', name: 'Grüne Zitadelle (Hundertwasser)', category: 'culture', rating: 4.7, distance: '1.2km', description: 'Hundertwasser\'s final masterpiece — unmissable pink facade.' },
    ]
  },

  bookTaxi: async (details) => {
    const res = await _guestRequest({
      title:       'Taxi request',
      category:    'General',
      description: `Taxi requested. Destination: ${details.destination || 'unspecified'}. Time: ${details.time || 'ASAP'}.`,
      urgency:     'soon',
    })
    return { bookingId: res?.ticket_id || `TAXI-${Date.now()}`, estimatedArrival: '8 minutes', driver: 'Confirmed by front desk' }
  },

  requestWakeUp: async (time) => {
    await _guestRequest({
      title:       `Wake-up call: ${time}`,
      category:    'Reception',
      description: `Guest requested wake-up call at ${time}.`,
      urgency:     'normal',
    })
    return { confirmed: true, time }
  },
}

// ---------------------------------------------------------------------------
// GUEST PROFILE  (stay + folio)
// ---------------------------------------------------------------------------
export const profileApi = {
  getProfile: async () => {
    const stay = await http('/api/guest/stay', { auth: true })
    return mapStayToApp(stay).guest
  },

  updatePreferences: async (prefs) => {
    // No dedicated preferences endpoint — log as front-desk note
    await _guestRequest({
      title:       'Preference update',
      category:    'Reception',
      description: `Guest updated preferences: ${JSON.stringify(prefs)}`,
      urgency:     'normal',
    })
    return { ...prefs, updatedAt: new Date().toISOString() }
  },

  getFolioBalance: async () => {
    const folio = await http('/api/guest/folio', { auth: true })
    // Map folio line items into the categories the BillingScreen expects
    let roomCharge = 0, roomService = 0, spa = 0, minibar = 0, other = 0
    for (const item of folio.items || []) {
      switch (item.category) {
        case 'room':        roomCharge  += item.total; break
        case 'restaurant':
        case 'room_service':roomService += item.total; break
        case 'spa':         spa         += item.total; break
        case 'minibar':     minibar     += item.total; break
        default:            other       += item.total
      }
    }
    return {
      roomCharge,
      roomService,
      spa,
      minibar,
      other,
      total:    folio.total || 0,
      currency: folio.currency || 'EUR',
      status:   folio.status,
      balance:  folio.balance_due || 0,
    }
  },

  checkout: async () => {
    const res = await http('/api/guest/checkout', { method: 'POST', auth: true, body: {} })
    clearToken()
    return { success: res?.success ?? true, invoiceUrl: null }
  },
}

// ---------------------------------------------------------------------------
// NOTIFICATIONS  (mapped from guest request history)
// ---------------------------------------------------------------------------
export const notificationsApi = {
  getNotifications: async () => {
    try {
      const requests = await http('/api/guest/requests', { auth: true })
      return (requests || []).slice(0, 10).map(r => ({
        id:        r.ticket_id,
        type:      r.status === 'done' ? 'success' : 'info',
        title:     r.title,
        body:      r.description || r.title,
        read:      r.status === 'done',
        createdAt: r.submitted_at,
      }))
    } catch {
      return []
    }
  },

  markRead: async (id) => ({ id, read: true }),
  markAllRead: async () => ({ success: true }),
}

// ---------------------------------------------------------------------------
// MENU  (full restaurant menu via public QR endpoint)
// ---------------------------------------------------------------------------
export const menuApi = {
  getMenu: async () => {
    const data = await http('/api/qr/menu')
    // Normalise to what DiningScreen / MenuScreen expects
    const categories = (data.categories || []).map(cat => ({
      id:          String(cat.id),
      name:        cat.name,
      emoji:       '🍽️',
      description: '',
      availableFrom: '06:30',
      availableTo:   '23:00',
      items: (cat.items || []).map(item => ({
        id:               String(item.id),
        name:             item.name,
        emoji:            '🍴',
        shortDescription: item.description || '',
        fullDescription:  item.description || '',
        price:            item.price,
        special:          false,
        available:        item.is_available,
        prepTime:         item.prep_time_min || 15,
        dietary: {
          vegetarian:  (item.dietary_tags || []).includes('vegetarian'),
          vegan:       (item.dietary_tags || []).includes('vegan'),
          glutenFree:  (item.dietary_tags || []).includes('gluten_free'),
          spicy:       0,
        },
        allergens: item.allergens || [],
      })),
    }))
    return { categories }
  },

  placeOrder: async (order) => {
    // Room service orders go through guest requests to create a paper trail
    return roomServiceApi.placeOrder(order)
  },
}

// ---------------------------------------------------------------------------
// DINING SPECIALS  (derived from featured menu items)
// ---------------------------------------------------------------------------
export const diningApi = {
  getSpecialDishes: async () => {
    const data = await http('/api/qr/menu')
    const specials = []
    for (const cat of data.categories || []) {
      for (const item of cat.items || []) {
        if (specials.length >= 5) break
        specials.push({
          id:               String(item.id),
          name:             item.name,
          emoji:            '🍽️',
          category:         cat.name,
          price:            item.price,
          tags:             [],
          shortDescription: item.description || '',
          description:      item.description || '',
          available:        item.is_available,
          prepTime:         item.prep_time_min || 20,
          dietary: {
            vegetarian: (item.dietary_tags || []).includes('vegetarian'),
            vegan:      (item.dietary_tags || []).includes('vegan'),
            glutenFree: (item.dietary_tags || []).includes('gluten_free'),
            spicy:      0,
          },
          allergens: item.allergens || [],
        })
      }
      if (specials.length >= 5) break
    }
    return specials
  },
}

// ---------------------------------------------------------------------------
// FRONT DESK  (general guest → staff requests)
// ---------------------------------------------------------------------------
export const frontDeskApi = {
  submitRequest: async (request) => {
    return _guestRequest({
      title:       request.title || 'Front desk request',
      category:    request.category || 'General',
      description: request.description || '',
      urgency:     request.urgency || 'normal',
      best_time:   request.bestTime || null,
    })
  },

  getRequests: async () => {
    const requests = await http('/api/guest/requests', { auth: true })
    return requests || []
  },
}

// ---------------------------------------------------------------------------
// BILLING  (folio + company billing)
// ---------------------------------------------------------------------------
export const billingApi = {
  /**
   * Fetch the current stay folio and return it in the shape BillingScreen expects.
   * `booking` is the AppContext booking object (for roomType enrichment).
   */
  getBills: async (_guestId, booking) => {
    const folio = await http('/api/guest/folio', { auth: true })

    // Compute tax rate from amounts; fall back to 7 % if no subtotal yet.
    const taxRate = (folio.subtotal > 0)
      ? Math.round((folio.tax_amount / folio.subtotal) * 100) / 100
      : 0.07

    const current = {
      billNumber:    folio.bill_number,
      billDate:      folio.bill_date,
      dueDate:       folio.due_date ?? null,
      paidAt:        folio.paid_at ?? null,
      status:        folio.status,
      currency:      folio.currency || 'EUR',
      roomNumber:    folio.room_number ?? booking?.roomNumber ?? null,
      roomType:      booking?.roomType ?? null,
      checkIn:       folio.check_in ?? booking?.checkInDate ?? null,
      checkOut:      folio.check_out ?? booking?.checkOutDate ?? null,
      nights:        folio.nights ?? booking?.nights ?? null,
      subtotal:      folio.subtotal,
      taxRate,
      taxAmount:     folio.tax_amount,
      total:         folio.total,
      companyBilling: folio.company_billing ?? false,
      companyName:   folio.company_name ?? null,
      items: (folio.items || []).map(item => ({
        id:       item.id,
        category: item.category,
        name:     item.description,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        total:    item.total,
        date:     item.date ?? null,
      })),
    }

    return { current, history: [] }
  },

  /**
   * "Download" invoice — no guest PDF endpoint exists yet.
   * For 'pdf' format we trigger the browser print dialog.
   * For 'email' format we submit a front-desk request.
   */
  downloadInvoice: async ({ billId, format }) => {
    if (format === 'email') {
      await _guestRequest({
        title:       `Invoice email request: ${billId}`,
        category:    'Reception',
        description: `Guest requested invoice ${billId} sent by email.`,
        urgency:     'normal',
      })
    }
    // PDF: trigger print in the browser (best available without a backend endpoint)
    if (format === 'pdf' && typeof window !== 'undefined') {
      window.print()
    }
    return { success: true }
  },

  /**
   * Request a company invoice via the dedicated backend endpoint.
   */
  requestCompanyBilling: async ({ companyName, vatNumber }) => {
    await http('/api/guest/folio/company-billing', {
      method: 'POST',
      auth:   true,
      body:   { company_name: companyName, vat_number: vatNumber ?? null },
    })
    return { success: true }
  },
}

// ---------------------------------------------------------------------------
// CHECKOUT  (delegates to profileApi.checkout)
// ---------------------------------------------------------------------------
export const checkoutApi = {
  confirmCheckout: profileApi.checkout,
}

// ---------------------------------------------------------------------------
// EVENTS  — recurring hotel events with auto-generated upcoming dates
// ---------------------------------------------------------------------------

function nextWeekday(dayOfWeek, offsetWeeks = 0) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = (dayOfWeek - today.getDay() + 7) % 7 || 7
  const d = new Date(today)
  d.setDate(today.getDate() + diff + offsetWeeks * 7)
  return d.toISOString().slice(0, 10)
}

function buildGrillBuffet(date) {
  return {
    id:               `grill-buffet-${date}`,
    title:            'Grill Buffet Evening',
    shortDescription: 'All-you-can-eat grill buffet with seasonal specialties at the Elb Terrace.',
    description:      'Join us every Wednesday and Friday for our popular Grill Buffet Evening at the Elb Terrace. Enjoy freshly grilled meats, fish, and seasonal vegetables alongside hearty sides and homemade sauces — all unlimited. A favourite with guests and locals alike.',
    category:         'Dining',
    emoji:            '🔥',
    date,
    time:             '18:30',
    durationMinutes:  150,
    venue:            'Elb Terrace',
    price:            49.90,
    priceNote:        'per person · drinks not included',
    spotsLeft:        24,
    available:        true,
    tags:             ['Brunch', 'Chef Special'],
    highlights:       [
      'Unlimited grilled meats & fresh fish',
      'Seasonal vegetable station',
      'Homemade sauces & sides',
      'Dessert buffet included',
      'Elb terrace with garden view',
    ],
    menu: [
      { course: 'From the Grill', items: ['Rumpsteak', 'Duroc Pork Fillet', 'Zanderfilet', 'Maispoularde', 'Grilled vegetables'] },
      { course: 'Sides', items: ['Rosemary potatoes', 'Seasonal salads', 'Homemade bread'] },
      { course: 'Dessert', items: ['Seasonal fruit selection', 'Chocolate fondue', 'Hausgemachte Waffeln'] },
    ],
    dressCode: 'Smart casual',
  }
}

// Generate next 3 occurrences of Wed (3) and Fri (5)
function generateGrillBuffets() {
  const events = []
  for (let w = 0; w < 3; w++) {
    events.push(buildGrillBuffet(nextWeekday(3, w))) // Wednesday
    events.push(buildGrillBuffet(nextWeekday(5, w))) // Friday
  }
  return events.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5)
}

const STATIC_EVENTS = [
  {
    id:               'breakfast-wintergarten',
    title:            'Hotel Breakfast',
    shortDescription: 'Daily buffet breakfast in the Wintergarten — fresh, regional, and unhurried.',
    description:      'Start your day with our daily breakfast buffet in the sun-drenched Wintergarten. Featuring freshly baked breads, regional cheeses, cold cuts, hot dishes, fruit, and barista coffee — all at a relaxed pace with garden views.',
    category:         'Dining',
    emoji:            '🌅',
    date:             new Date().toISOString().slice(0, 10),
    time:             '07:00',
    durationMinutes:  180,
    venue:            'Wintergarten',
    price:            24.90,
    priceNote:        'per person · incl. VAT',
    spotsLeft:        40,
    available:        true,
    tags:             ['Complimentary', 'Brunch'],
    highlights:       [
      'Fresh-baked bread and pastries',
      'Regional cheeses and cold cuts',
      'Hot egg station',
      'Seasonal fruit & juices',
      'Barista coffee & teas',
    ],
    menu: [],
    dressCode: 'Casual',
  },
]

export const eventsApi = {
  getEvents: async () => [...STATIC_EVENTS, ...generateGrillBuffets()],

  reserveEvent: async (payload) => {
    const ref = 'EV-' + Math.random().toString(36).slice(2, 8).toUpperCase()
    return {
      success:            true,
      confirmationNumber: ref,
      guestCount:         payload.guestCount ?? 1,
      specialRequests:    payload.specialRequests ?? '',
    }
  },
}

// ---------------------------------------------------------------------------
// INTERNAL helper — POST /api/guest/requests
// ---------------------------------------------------------------------------
async function _guestRequest({ title, category = 'General', description = '', urgency = 'normal', best_time = null }) {
  return http('/api/guest/requests', {
    method: 'POST',
    auth:   true,
    body:   { title, category, description, urgency, best_time },
  })
}
