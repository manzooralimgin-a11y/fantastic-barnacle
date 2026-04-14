const BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api').replace(/\/+$/, '')
const FALLBACK_ROOM_AMENITIES = [
  { id: 'wifi', label: 'High-Speed Wi-Fi', icon: 'wifi', available: true },
  { id: 'ac', label: 'Air Conditioning', icon: 'wind', available: true },
  { id: 'tv', label: 'Smart TV', icon: 'tv', available: true },
  { id: 'safe', label: 'In-Room Safe', icon: 'lock', available: true },
  { id: 'minibar', label: 'Minibar', icon: 'wine', available: true },
  { id: 'coffee', label: 'Coffee Machine', icon: 'coffee', available: true },
]

const localState = {
  get(key, fallback = null) {
    try {
      return JSON.parse(window.localStorage.getItem(key)) ?? fallback
    } catch {
      return fallback
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // ignore quota or serialization failures
    }
  },
}

const getAccessToken = () => {
  try {
    return JSON.parse(window.localStorage.getItem('accessToken'))
  } catch {
    return null
  }
}

const request = async (path, { method = 'GET', body, auth = true, token, headers = {} } = {}) => {
  const accessToken = token || getAccessToken()
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(auth && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`
    try {
      const payload = await response.json()
      message = payload?.detail || payload?.message || message
    } catch {
      try {
        const text = await response.text()
        if (text.trim()) message = text
      } catch {
        // ignore
      }
    }
    throw new Error(message)
  }

  if (response.status === 204) return null
  return response.json()
}

const getPublicMenu = async () => {
  const payload = await request('/public/restaurant/menu', { auth: false })
  return payload?.categories ?? []
}

const getGuestStay = async (token) => request('/guest/stay', { token })
const getGuestFolio = async () => request('/guest/folio')
const getGuestRequests = async () => request('/guest/requests')

const toGuest = (stay) => ({
  id: stay?.guest?.id || 'guest',
  firstName: stay?.guest?.first_name || 'Guest',
  lastName: stay?.guest?.last_name || 'Guest',
  email: stay?.guest?.email ?? null,
  phone: stay?.guest?.phone ?? null,
  bookingNumber: stay?.guest?.booking_number ?? '',
})

const normalizePaymentStatus = (status, balanceDue) => {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'paid' || balanceDue <= 0) return 'paid'
  if (normalized === 'partial' || normalized === 'partially_paid') return 'partial'
  return 'pending'
}

const toBooking = (stay) => {
  const booking = stay?.booking ?? {}
  return {
    roomNumber: booking.room_number ?? '',
    floor: booking.floor ?? null,
    roomType: booking.room_type ?? 'Hotel Room',
    checkInDate: booking.check_in_date ?? null,
    checkOutDate: booking.check_out_date ?? null,
    nights: booking.nights ?? 0,
    paymentStatus: normalizePaymentStatus(booking.payment_status, stay?.folio_balance_due ?? 0),
    checkInStatus: booking.check_in_status ?? stay?.stay_status ?? 'pending',
    keyStatus: booking.key_status ?? 'inactive',
    preferences: {
      language: booking.preferences?.language || 'en',
      dietaryNotes: booking.preferences?.notes || 'none',
    },
  }
}

const parseMessages = (requestItem) => {
  const messages = []
  const submittedAt = requestItem.submitted_at || requestItem.updated_at || new Date().toISOString()

  if (requestItem.description) {
    messages.push({
      id: `${requestItem.ticket_id}-guest-initial`,
      direction: 'guest',
      message: requestItem.description,
      createdAt: submittedAt,
    })
  }

  if (requestItem.staff_notes) {
    messages.push({
      id: `${requestItem.ticket_id}-staff-note`,
      direction: 'staff',
      message: requestItem.staff_notes,
      createdAt: requestItem.updated_at || submittedAt,
    })
  }

  return messages
}

const toRequest = (requestItem) => ({
  ticketId: requestItem.ticket_id,
  title: requestItem.title,
  category: requestItem.category,
  description: requestItem.description || '',
  urgency: requestItem.urgency || 'normal',
  status: requestItem.status || 'open',
  estimatedTime: requestItem.estimated_time || 'Pending confirmation',
  submittedAt: requestItem.submitted_at,
  updatedAt: requestItem.updated_at,
  notes: requestItem.notes || null,
  staffNotes: requestItem.staff_notes || null,
  hasUnread: Boolean(requestItem.has_unread),
  bestTime: requestItem.best_time || null,
  messages: parseMessages(requestItem),
})

const normalizeCategoryName = (name) => String(name || '').trim().toLowerCase()

const mapMenuItem = (item, category) => {
  const spicyLevel = Number(item?.dietary?.spicy || 0)
  return {
    id: String(item.id),
    name: item.name,
    price: Number(item.price || 0),
    emoji: item.emoji || category.emoji || '🍽️',
    shortDescription: item.shortDescription || item.description || '',
    fullDescription: item.fullDescription || item.description || item.shortDescription || '',
    dietary: {
      vegetarian: Boolean(item?.dietary?.vegetarian),
      vegan: Boolean(item?.dietary?.vegan),
      glutenFree: Boolean(item?.dietary?.glutenFree),
      spicy: spicyLevel,
    },
    prepTime: Number(item.prepTime || 15),
    available: item.available !== false,
    special: Boolean(item.special || item.is_popular),
    allergens: Array.isArray(item.allergens) ? item.allergens : [],
    ingredients: Array.isArray(item.ingredients) ? item.ingredients : [],
    chefNotes: item.chefNotes || null,
    chefRecommendation: item.chefRecommendation || null,
    servings: item.servings || '1 portion',
    description: item.description || item.shortDescription || '',
  }
}

const mapMenuCategory = (category) => {
  const categoryName = category.name || category.label || 'Menu'
  const items = Array.isArray(category.items)
    ? category.items
    : Array.isArray(category.subcategories)
      ? category.subcategories.flatMap((subcategory) => subcategory.items || [])
      : []

  return {
    id: String(category.id),
    name: categoryName,
    label: categoryName,
    emoji: category.emoji || '🍽️',
    icon: category.icon || 'utensils',
    description: category.description || '',
    availableFrom: category.availableFrom || '11:00',
    availableTo: category.availableTo || '23:00',
    items: items.map((item) => mapMenuItem(item, category)),
  }
}

const mapFolioBreakdown = (folio) => {
  const totals = {
    roomCharge: 0,
    roomService: 0,
    spa: 0,
    minibar: 0,
    total: Number(folio?.total || 0),
    currency: folio?.currency || 'EUR',
  }

  for (const item of folio?.items || []) {
    const amount = Number(item.total || 0)
    switch (normalizeCategoryName(item.category)) {
      case 'room':
        totals.roomCharge += amount
        break
      case 'restaurant':
        totals.roomService += amount
        break
      case 'service':
        totals.spa += amount
        break
      case 'minibar':
        totals.minibar += amount
        break
      default:
        totals.roomService += amount
        break
    }
  }

  return totals
}

const getTemperature = (roomNumber) => localState.get(`guest-room-temperature:${roomNumber}`, 22)
const setTemperatureState = (roomNumber, temperature) => {
  localState.set(`guest-room-temperature:${roomNumber}`, temperature)
  return temperature
}

const getDndState = (roomNumber) => localState.get(`guest-room-dnd:${roomNumber}`, false)
const setDndState = (roomNumber, active) => {
  localState.set(`guest-room-dnd:${roomNumber}`, active)
  return active
}

const buildEstimatedDelivery = (estimatedTime) => {
  const match = String(estimatedTime || '').match(/(\d+)/)
  const minutes = match ? Number(match[1]) : 30
  return new Date(Date.now() + minutes * 60_000).toISOString()
}

const formatRoomServiceRequest = (order) => {
  const items = (order?.items || [])
    .map((item) => `${item.quantity}x ${item.name}`)
    .join(', ')

  return {
    title: 'Room Service Order',
    category: 'Reception',
    description: [items && `Items: ${items}`, order?.specialRequest && `Notes: ${order.specialRequest}`]
      .filter(Boolean)
      .join('\n'),
    urgency: 'normal',
  }
}

export const authApi = {
  login: async ({ bookingNumber, lastName }) => {
    const payload = await request('/guest/auth', {
      method: 'POST',
      auth: false,
      body: {
        booking_id: bookingNumber,
        last_name: lastName,
      },
    })

    const stay = await getGuestStay(payload.access_token)
    return {
      guest: toGuest(stay),
      booking: toBooking(stay),
      accessToken: payload.access_token,
    }
  },

  logout: async () => ({ success: true }),

  validateToken: async (token) => {
    await getGuestStay(token)
    return { valid: true }
  },
}

export const idVerificationApi = {
  submitIDVerification: async ({ imageData, side, mimeType }) => {
    return request('/guest/id-verifications', {
      method: 'POST',
      body: {
        image_data: imageData,
        side,
        mime_type: mimeType,
      },
    })
  },

  completeVerification: async (verificationIds) => {
    return request('/guest/id-verifications/complete', {
      method: 'POST',
      body: { verification_ids: verificationIds || [] },
    })
  },
}

export const roomKeyApi = {
  assignRoomKey: async () => request('/guest/key', { method: 'POST' }),

  deactivateKey: async (keyId) => ({
    keyId,
    keyStatus: 'inactive',
    deactivatedAt: new Date().toISOString(),
  }),

  getKeyStatus: async () => {
    const stay = await getGuestStay()
    return {
      keyStatus: stay?.booking?.key_status || 'not_assigned',
      roomKey: null,
    }
  },
}

export const roomDetailsApi = {
  getRoomDetails: async () => {
    const [stay, folio] = await Promise.all([getGuestStay(), getGuestFolio()])
    const booking = toBooking(stay)
    const folioBreakdown = mapFolioBreakdown(folio)
    const roomNumber = booking.roomNumber
    const lateCheckoutRequest = (await getGuestRequests()).find(
      (item) => String(item.title || '').toLowerCase() === 'late checkout'
    )

    return {
      roomNumber,
      roomType: booking.roomType,
      category: booking.roomType,
      floor: booking.floor,
      sqm: 30,
      maxOccupancy: 2,
      view: 'Elbe River',
      bedType: 'King Size',
      smokingAllowed: false,
      petsAllowed: false,
      checkInTime: booking.checkInDate,
      checkOutTime: lateCheckoutRequest?.updated_at || booking.checkOutDate,
      nights: booking.nights,
      occupancyStatus: booking.checkInStatus === 'checked_in' ? 'occupied' : 'vacant',
      amenities: FALLBACK_ROOM_AMENITIES,
      folio: {
        balance: Number(folio.balance_due || 0),
        currency: folio.currency || 'EUR',
        paymentStatus: normalizePaymentStatus(folio.status, folio.balance_due),
        lastPaymentAmount: Number(folio.payments?.[0]?.amount || 0),
        lastPaymentDate: folio.payments?.[0]?.paid_at || null,
        breakdown: {
          roomCharge: folioBreakdown.roomCharge,
          roomService: folioBreakdown.roomService,
          spa: folioBreakdown.spa,
          minibar: folioBreakdown.minibar,
        },
      },
      doNotDisturb: getDndState(roomNumber),
      temperature: getTemperature(roomNumber),
    }
  },

  requestLateCheckout: async () => {
    const response = await request('/guest/requests', {
      method: 'POST',
      body: {
        title: 'Late Checkout',
        category: 'Reception',
        description: 'Guest requested a late checkout via the guest portal.',
        urgency: 'normal',
      },
    })
    return {
      approved: false,
      newCheckoutTime: null,
      message: `Late checkout request sent to reception (${response.ticket_id}).`,
    }
  },

  setTemperature: async ({ roomNumber, temperature }) => {
    const updated = setTemperatureState(roomNumber, temperature)
    return {
      temperature: updated,
      updatedAt: new Date().toISOString(),
    }
  },
}

export const roomServiceApi = {
  getMenu: async () => menuApi.getMenu(),

  placeOrder: async (order) => {
    const payload = await request('/guest/requests', {
      method: 'POST',
      body: formatRoomServiceRequest(order),
    })
    return {
      orderId: payload.ticket_id,
      status: 'confirmed',
      estimatedDelivery: buildEstimatedDelivery(payload.estimated_time),
      totalAmount: (order?.items || []).reduce((sum, item) => sum + item.price * item.quantity, 0),
    }
  },

  getOrderStatus: async (orderId) => ({
    orderId,
    status: 'preparing',
    estimatedDelivery: new Date(Date.now() + 20 * 60_000).toISOString(),
  }),

  getOrderHistory: async () => [],
}

export const housekeepingApi = {
  requestCleaning: async (type) => {
    const response = await request('/guest/requests', {
      method: 'POST',
      body: {
        title: 'Housekeeping',
        category: 'Housekeeping',
        description: `Housekeeping request (${type || 'standard'}) submitted from the guest portal.`,
        urgency: 'normal',
      },
    })
    return { requestId: response.ticket_id, type, status: 'open', estimatedTime: response.estimated_time }
  },

  requestAmenities: async (items) => {
    const response = await request('/guest/requests', {
      method: 'POST',
      body: {
        title: 'Amenity Request',
        category: 'Housekeeping',
        description: `Requested amenities: ${(items || []).join(', ')}`,
        urgency: 'normal',
      },
    })
    return { requestId: response.ticket_id, items, status: 'open' }
  },

  setDoNotDisturb: async (active) => {
    const stay = await getGuestStay()
    const roomNumber = stay?.booking?.room_number || 'guest-room'
    return { doNotDisturb: setDndState(roomNumber, active) }
  },

  getAmenityList: async () => [],
}

export const spaApi = {
  getServices: async () => [],
  getAvailableSlots: async () => [],
  book: async (booking) => ({
    bookingId: `SPA-${Date.now()}`,
    ...booking,
    status: 'requested',
  }),
}

export const conciergeApi = {
  sendMessage: async (message) => {
    const response = await request('/guest/requests', {
      method: 'POST',
      body: {
        title: 'Concierge Message',
        category: 'Reception',
        description: message,
        urgency: 'normal',
      },
    })
    return {
      messageId: response.ticket_id,
      reply: 'Your message has been sent to reception.',
      timestamp: new Date().toISOString(),
    }
  },

  getRecommendations: async () => [],

  bookTaxi: async (details) => {
    const response = await request('/guest/requests', {
      method: 'POST',
      body: {
        title: 'Taxi Request',
        category: 'Reception',
        description: JSON.stringify(details || {}),
        urgency: 'soon',
      },
    })
    return {
      bookingId: response.ticket_id,
      estimatedArrival: response.estimated_time || 'Pending confirmation',
      driver: null,
      plate: null,
    }
  },

  requestWakeUp: async (time) => {
    await request('/guest/requests', {
      method: 'POST',
      body: {
        title: 'Wake-up Call',
        category: 'Reception',
        description: `Wake-up call requested for ${time}.`,
        urgency: 'normal',
      },
    })
    return { confirmed: true, time }
  },
}

export const profileApi = {
  getProfile: async () => {
    const stay = await getGuestStay()
    return toGuest(stay)
  },

  updatePreferences: async (prefs) => ({
    ...prefs,
    updatedAt: new Date().toISOString(),
  }),

  getFolioBalance: async () => {
    const folio = await getGuestFolio()
    return mapFolioBreakdown(folio)
  },

  checkout: async () => request('/guest/checkout', { method: 'POST' }),
}

export const notificationsApi = {
  getNotifications: async () => {
    const [stay, folio, requests] = await Promise.all([
      getGuestStay(),
      getGuestFolio(),
      getGuestRequests(),
    ])

    const notifications = []
    if (stay?.booking?.check_in_status !== 'checked_in') {
      notifications.push({
        id: 'stay-checkin',
        type: 'info',
        title: 'Check-in pending',
        body: 'Upload your ID to complete check-in and activate your digital key.',
        read: false,
        createdAt: stay?.booking?.check_in_date || new Date().toISOString(),
      })
    }

    if (Number(folio?.balance_due || 0) > 0) {
      notifications.push({
        id: `folio-${folio.id}`,
        type: 'billing',
        title: 'Outstanding folio balance',
        body: `Your current balance is ${new Intl.NumberFormat('de-DE', { style: 'currency', currency: folio.currency || 'EUR' }).format(Number(folio.balance_due || 0))}.`,
        read: false,
        createdAt: folio.bill_date || new Date().toISOString(),
      })
    }

    for (const requestItem of requests.slice(0, 5)) {
      notifications.push({
        id: requestItem.ticket_id,
        type: 'request',
        title: requestItem.title,
        body: requestItem.status === 'completed'
          ? 'Your request has been completed.'
          : `Status: ${requestItem.status.replace(/_/g, ' ')}.`,
        read: !requestItem.has_unread,
        createdAt: requestItem.updated_at || requestItem.submitted_at || new Date().toISOString(),
      })
    }

    return notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  },

  markRead: async (id) => ({ id, read: true }),

  markAllRead: async () => ({ success: true }),
}

export const menuApi = {
  getMenu: async () => {
    const categories = await getPublicMenu()
    return {
      categories: categories.map(mapMenuCategory),
    }
  },

  placeOrder: async (order) => roomServiceApi.placeOrder(order),
}

export const diningApi = {
  getSpecialDishes: async () => {
    const menu = await menuApi.getMenu()
    return menu.categories
      .flatMap((category) => category.items.map((item) => ({ ...item, category: category.name })))
      .filter((item) => item.special || item.available)
      .slice(0, 8)
  },
}

export const eventsApi = {
  getEvents: async () => [],

  reserveEvent: async ({ eventId, guestCount = 1, specialRequests = '' }) => {
    await request('/guest/requests', {
      method: 'POST',
      body: {
        title: 'Event Reservation',
        category: 'Reception',
        description: `Event ${eventId} for ${guestCount} guest(s). ${specialRequests}`.trim(),
        urgency: 'normal',
      },
    })
    return {
      confirmationNumber: `EVT-${Date.now()}`,
      guestCount,
      specialRequests,
    }
  },
}

export const frontDeskApi = {
  getRequestHistory: async () => {
    const requests = await getGuestRequests()
    return requests.map(toRequest)
  },

  submitRequest: async (payload) => {
    const response = await request('/guest/requests', {
      method: 'POST',
      body: {
        title: payload.title,
        category: payload.category,
        description: payload.description,
        urgency: payload.urgency,
        best_time: payload.bestTime || null,
      },
    })
    return {
      success: true,
      ticketId: response.ticket_id,
      estimatedTime: response.estimated_time || 'Pending confirmation',
    }
  },

  updateRequest: async ({ ticketId, message }) => {
    const numericId = Number(String(ticketId).replace(/^FD-?/i, ''))
    await request(`/guest/requests/${numericId}/message`, {
      method: 'PATCH',
      body: { message },
    })
    return { success: true }
  },

  markRead: async (ticketId) => ({ success: true, ticketId }),
}
