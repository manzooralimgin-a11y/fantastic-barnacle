/**
 * Mock API Service Layer
 * Replace base URL + fetch calls with your real backend.
 * All functions return Promises matching the same shape as production responses.
 */

import { delay } from '../utils'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1'

// ---------------------------------------------------------------------------
// Generic fetch wrapper (swap mock for real fetch when backend is ready)
// ---------------------------------------------------------------------------
const request = async (path, options = {}) => {
  // TODO: replace with real fetch when backend is ready:
  // const res = await fetch(`${BASE_URL}${path}`, {
  //   headers: { 'Content-Type': 'application/json', ...options.headers },
  //   ...options,
  // })
  // if (!res.ok) throw new Error(await res.text())
  // return res.json()
  await delay(400 + Math.random() * 400)
  return null // mock stubs override this
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Demo credentials (replace with real DB lookup on backend)
// ---------------------------------------------------------------------------
const MOCK_ACCOUNTS = {
  BK123456: {
    lastName: 'smith',
    guest: {
      id:            'g-001',
      firstName:     'James',
      lastName:      'Smith',
      email:         'james.smith@example.com',
      phone:         '+49 170 1234567',
      bookingNumber: 'BK123456',
    },
    booking: {
      roomNumber:    '304',
      floor:         3,
      roomType:      'Deluxe River View',
      checkInDate:   '2026-04-11T14:00:00Z',
      checkOutDate:  '2026-04-15T11:00:00Z',
      nights:        4,
      paymentStatus: 'paid',        // 'paid' | 'pending' | 'partial'
      checkInStatus: 'checked_in',  // 'pending' | 'checked_in' | 'checked_out'
      keyStatus:     'active',      // 'active' | 'inactive' | 'lost'
      preferences:   { language: 'en', dietaryNotes: 'none' },
    },
  },
  BK654321: {
    lastName: 'mueller',
    guest: {
      id:            'g-002',
      firstName:     'Anna',
      lastName:      'Müller',
      email:         'anna.mueller@example.com',
      phone:         '+49 171 9876543',
      bookingNumber: 'BK654321',
    },
    booking: {
      roomNumber:    '512',
      floor:         5,
      roomType:      'Junior Suite',
      checkInDate:   '2026-04-12T15:00:00Z',
      checkOutDate:  '2026-04-16T11:00:00Z',
      nights:        4,
      paymentStatus: 'paid',
      checkInStatus: 'checked_in',
      keyStatus:     'active',
      preferences:   { language: 'de', dietaryNotes: 'vegetarian' },
    },
  },
}

export const authApi = {
  /**
   * Login with booking number + last name.
   * Demo: BK123456 / smith
   * @param {{ bookingNumber: string, lastName: string }} payload
   * @returns {{ guest: GuestProfile, booking: BookingInfo, accessToken: string }}
   */
  login: async ({ bookingNumber, lastName }) => {
    await delay(900 + Math.random() * 400) // realistic latency

    const key    = bookingNumber?.trim().toUpperCase()
    const record = MOCK_ACCOUNTS[key]

    if (!record) {
      throw new Error('Booking not found. Please check your booking number.')
    }
    if (record.lastName !== lastName?.trim().toLowerCase()) {
      throw new Error('Last name does not match. Please try again.')
    }

    return {
      guest:       record.guest,
      booking:     record.booking,
      accessToken: `mock-jwt-${key}-${Date.now()}`,
    }
  },

  logout: async () => {
    await delay(200)
    return { success: true }
  },

  /** Refresh session / validate stored token */
  validateToken: async (token) => {
    await delay(200)
    if (!token) throw new Error('No token.')
    // In production: verify JWT expiry on server
    return { valid: true }
  },
}

// ---------------------------------------------------------------------------
// ID Verification
// ---------------------------------------------------------------------------
export const idVerificationApi = {
  /**
   * Submit a captured ID image for verification.
   * @param {{ imageData: string, side: 'front'|'back', mimeType: string }} payload
   * @returns {{ verified: boolean, message: string, verificationId: string, timestamp: string }}
   */
  submitIDVerification: async ({ imageData, side }) => {
    // Simulate backend OCR / liveness check latency (1–2 seconds)
    await delay(1000 + Math.random() * 1000)

    // In production: POST to /api/v1/verification/id with multipart or base64 body
    // const res = await fetch(`${BASE_URL}/verification/id`, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    //   body: JSON.stringify({ imageData, side }),
    // })
    // return res.json()

    if (!imageData) throw new Error('No image data provided.')

    return {
      verified:       true,
      message:        side === 'back'
        ? 'Back of ID verified successfully.'
        : 'Identity verified successfully.',
      verificationId: `VRF-${Date.now()}`,
      timestamp:      new Date().toISOString(),
    }
  },

  /**
   * Mark the full verification flow as complete for this booking.
   */
  completeVerification: async (verificationIds) => {
    await delay(400)
    return {
      success:   true,
      status:    'verified',
      completedAt: new Date().toISOString(),
    }
  },
}

// ---------------------------------------------------------------------------
// Room Key
// ---------------------------------------------------------------------------
export const roomKeyApi = {
  /**
   * Assign a digital room key for the authenticated guest.
   * @param {{ guestId: string, bookingNumber: string, roomNumber: string }} payload
   * @returns {{ keyStatus: string, roomKey: RoomKey }}
   *
   * RoomKey: { id, type, format, roomNumber, floor, validFrom, expiresAt, nfcToken }
   */
  assignRoomKey: async ({ guestId, bookingNumber, roomNumber }) => {
    await delay(1200 + Math.random() * 800) // 1.2–2s realistic provisioning time

    if (!guestId) throw new Error('Guest ID is required.')

    const now       = new Date()
    const expiresAt = new Date(now)
    // Key expires at checkout time (hardcoded to 11:00 on the checkout date for mock)
    expiresAt.setDate(expiresAt.getDate() + 4)
    expiresAt.setHours(11, 0, 0, 0)

    return {
      keyStatus: 'active',
      roomKey: {
        id:          `KEY-${Date.now()}`,
        type:        'digital',
        format:      'nfc',            // nfc | ble | qr
        roomNumber:  roomNumber || '304',
        floor:       parseInt(roomNumber?.charAt(0) || '3', 10),
        validFrom:   now.toISOString(),
        expiresAt:   expiresAt.toISOString(),
        nfcToken:    `NFC-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      },
    }
  },

  /**
   * Deactivate a key (e.g., on checkout or if lost).
   */
  deactivateKey: async (keyId) => {
    await delay(400)
    return { keyId, keyStatus: 'inactive', deactivatedAt: new Date().toISOString() }
  },

  /**
   * Get current key status for the guest's booking.
   */
  getKeyStatus: async (bookingNumber) => {
    await delay(300)
    const stored = null // in production: fetch from server
    return { keyStatus: stored ? 'active' : 'not_assigned', roomKey: stored }
  },
}

// ---------------------------------------------------------------------------
// Room Details
// ---------------------------------------------------------------------------
export const roomDetailsApi = {
  /**
   * Fetch full room details including amenities, folio summary, and key info.
   * @param {{ roomNumber: string, bookingNumber: string }} payload
   */
  getRoomDetails: async ({ roomNumber, bookingNumber }) => {
    await delay(600 + Math.random() * 400)
    return {
      roomNumber,
      roomType:     'Deluxe River View',
      category:     'Deluxe',
      floor:        parseInt(roomNumber?.charAt(0) || '3', 10),
      sqm:          32,
      maxOccupancy: 2,
      view:         'Elbe River',
      bedType:      'King Size',
      smokingAllowed: false,
      petsAllowed:  false,
      checkInTime:  '2026-04-11T15:42:00Z',  // actual time guest checked in
      checkOutTime: '2026-04-15T11:00:00Z',  // scheduled checkout
      nights:       4,
      occupancyStatus: 'occupied',           // occupied | vacant | cleaning | maintenance
      amenities: [
        { id: 'wifi',     label: 'High-Speed Wi-Fi',  icon: 'wifi',        available: true  },
        { id: 'ac',       label: 'Air Conditioning',  icon: 'wind',        available: true  },
        { id: 'tv',       label: '65" Smart TV',      icon: 'tv',          available: true  },
        { id: 'safe',     label: 'In-Room Safe',      icon: 'lock',        available: true  },
        { id: 'minibar',  label: 'Minibar',           icon: 'wine',        available: true  },
        { id: 'bathtub',  label: 'Bathtub',           icon: 'bath',        available: true  },
        { id: 'balcony',  label: 'Balcony',           icon: 'sun',         available: true  },
        { id: 'coffee',   label: 'Coffee Machine',    icon: 'coffee',      available: true  },
        { id: 'ironing',  label: 'Iron & Board',      icon: 'shirt',       available: false },
        { id: 'hairdryer',label: 'Hair Dryer',        icon: 'zap',         available: true  },
      ],
      folio: {
        balance:         340.50,
        currency:        'EUR',
        paymentStatus:   'paid',     // paid | pending | overdue
        lastPaymentAmount: 520.00,
        lastPaymentDate: '2026-04-11T14:00:00Z',
        breakdown: {
          roomCharge:  180.00,
          roomService:  47.50,
          spa:          95.00,
          minibar:      18.00,
        },
      },
      doNotDisturb: false,
      temperature:  22, // °C
    }
  },

  requestLateCheckout: async (bookingNumber) => {
    await delay(700)
    return { approved: true, newCheckoutTime: '2026-04-15T14:00:00Z', message: 'Late checkout approved until 14:00.' }
  },

  setTemperature: async ({ roomNumber, temperature }) => {
    await delay(400)
    return { temperature, updatedAt: new Date().toISOString() }
  },
}

// ---------------------------------------------------------------------------
// Room Service
// ---------------------------------------------------------------------------
export const roomServiceApi = {
  getMenu: async () => {
    await delay()
    return {
      categories: [
        {
          id: 'breakfast',
          label: 'Breakfast',
          icon: 'sunrise',
          availableFrom: '06:30',
          availableTo:   '11:00',
          items: [
            { id: 'rs-01', name: 'Continental Basket', description: 'Freshly baked breads, jams & butter', price: 18.50, image: null, allergens: ['gluten'], vegetarian: true },
            { id: 'rs-02', name: 'Eggs Benedict', description: 'Poached eggs, hollandaise, toasted muffin', price: 22.00, image: null, allergens: ['gluten', 'eggs', 'milk'], vegetarian: false },
            { id: 'rs-03', name: 'Avocado Toast', description: 'Sourdough, smashed avocado, cherry tomatoes', price: 19.00, image: null, allergens: ['gluten'], vegetarian: true },
          ],
        },
        {
          id: 'mains',
          label: 'All-Day Dining',
          icon: 'utensils',
          availableFrom: '11:00',
          availableTo:   '23:00',
          items: [
            { id: 'rs-04', name: 'Club Sandwich', description: 'Triple-decker, fries, salad', price: 24.00, image: null, allergens: ['gluten', 'eggs'], vegetarian: false },
            { id: 'rs-05', name: 'Pasta Arrabbiata', description: 'Penne, spicy tomato, basil, parmesan', price: 21.00, image: null, allergens: ['gluten', 'milk'], vegetarian: true },
            { id: 'rs-06', name: 'Beef Burger', description: '200g Angus patty, truffle fries', price: 28.00, image: null, allergens: ['gluten', 'sesame'], vegetarian: false },
          ],
        },
        {
          id: 'drinks',
          label: 'Beverages',
          icon: 'coffee',
          availableFrom: '06:30',
          availableTo:   '23:59',
          items: [
            { id: 'rs-07', name: 'Specialty Coffee', description: 'Espresso, Latte, Cappuccino', price: 6.00, image: null, allergens: ['milk'], vegetarian: true },
            { id: 'rs-08', name: 'Fresh Juice', description: 'Orange, apple or grapefruit', price: 8.50, image: null, allergens: [], vegetarian: true },
            { id: 'rs-09', name: 'Mineral Water 0.5l', description: 'Still or sparkling', price: 5.00, image: null, allergens: [], vegetarian: true },
          ],
        },
      ],
    }
  },

  placeOrder: async (order) => {
    await delay(800)
    return {
      orderId:    `ORD-${Date.now()}`,
      status:     'confirmed',
      estimatedDelivery: new Date(Date.now() + 25 * 60 * 1000).toISOString(),
      totalAmount: order.items.reduce((sum, i) => sum + i.price * i.quantity, 0),
    }
  },

  getOrderStatus: async (orderId) => {
    await delay(300)
    return { orderId, status: 'preparing', estimatedDelivery: new Date(Date.now() + 15 * 60 * 1000).toISOString() }
  },

  getOrderHistory: async () => {
    await delay()
    return []
  },
}

// ---------------------------------------------------------------------------
// Housekeeping
// ---------------------------------------------------------------------------
export const housekeepingApi = {
  requestCleaning: async (type) => {
    await delay()
    return { requestId: `HK-${Date.now()}`, type, status: 'open', estimatedTime: '30 minutes' }
  },

  requestAmenities: async (items) => {
    await delay()
    return { requestId: `AM-${Date.now()}`, items, status: 'open' }
  },

  setDoNotDisturb: async (active) => {
    await delay(300)
    return { doNotDisturb: active }
  },

  getAmenityList: async () => {
    await delay()
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
// Spa & Wellness
// ---------------------------------------------------------------------------
export const spaApi = {
  getServices: async () => {
    await delay()
    return [
      { id: 'sp-01', name: 'Swedish Massage', duration: 60, price: 95,  category: 'massage',  description: 'Classic full-body relaxation massage.' },
      { id: 'sp-02', name: 'Deep Tissue',     duration: 90, price: 130, category: 'massage',  description: 'Targeted muscle relief therapy.' },
      { id: 'sp-03', name: 'Hot Stone',       duration: 75, price: 115, category: 'massage',  description: 'Warmed basalt stones melt tension away.' },
      { id: 'sp-04', name: 'Facial Classic',  duration: 60, price: 85,  category: 'facial',   description: 'Deep cleanse, exfoliation & hydration.' },
      { id: 'sp-05', name: 'Manicure',        duration: 45, price: 55,  category: 'nails',    description: 'Shape, buff & polish.' },
      { id: 'sp-06', name: 'Yoga Session',    duration: 60, price: 60,  category: 'wellness', description: 'Private session with our resident instructor.' },
    ]
  },

  getAvailableSlots: async (serviceId, date) => {
    await delay()
    const slots = []
    for (let h = 9; h <= 18; h++) {
      slots.push(`${String(h).padStart(2, '0')}:00`)
      if (h < 18) slots.push(`${String(h).padStart(2, '0')}:30`)
    }
    // Simulate some taken slots
    return slots.filter(() => Math.random() > 0.3)
  },

  book: async (booking) => {
    await delay(800)
    return { bookingId: `SPA-${Date.now()}`, ...booking, status: 'confirmed' }
  },
}

// ---------------------------------------------------------------------------
// Concierge
// ---------------------------------------------------------------------------
export const conciergeApi = {
  sendMessage: async (message) => {
    await delay(500)
    return {
      messageId: `MSG-${Date.now()}`,
      reply:     'Thank you for your message. A member of our concierge team will be with you shortly.',
      timestamp: new Date().toISOString(),
    }
  },

  getRecommendations: async (category) => {
    await delay()
    return [
      { id: 'rec-01', name: 'Restaurant Pforte',  category: 'dining',      rating: 4.8, distance: '200m',  description: 'Fine dining with Elbe views.' },
      { id: 'rec-02', name: 'Miniatur Wunderland', category: 'attraction', rating: 4.9, distance: '1.2km', description: "World's largest model railway exhibition." },
      { id: 'rec-03', name: 'Alster Lake Cruise',  category: 'activity',   rating: 4.7, distance: '800m',  description: '90-minute scenic boat tour.' },
      { id: 'rec-04', name: 'Elbphilharmonie',     category: 'culture',    rating: 5.0, distance: '400m',  description: 'Iconic concert hall, guided tours daily.' },
    ]
  },

  bookTaxi: async (details) => {
    await delay(800)
    return { bookingId: `TAXI-${Date.now()}`, estimatedArrival: '8 minutes', driver: 'Hans M.', plate: 'HH-AB 1234' }
  },

  requestWakeUp: async (time) => {
    await delay()
    return { confirmed: true, time }
  },
}

// ---------------------------------------------------------------------------
// Guest Profile
// ---------------------------------------------------------------------------
export const profileApi = {
  getProfile: async () => {
    await delay()
    return null // pulled from auth context
  },

  updatePreferences: async (prefs) => {
    await delay()
    return { ...prefs, updatedAt: new Date().toISOString() }
  },

  getFolioBalance: async () => {
    await delay()
    return {
      roomCharge:    180.00,
      roomService:   47.50,
      spa:           95.00,
      minibar:       18.00,
      total:         340.50,
      currency:      'EUR',
    }
  },

  checkout: async () => {
    await delay(1000)
    return { success: true, invoiceUrl: null }
  },
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
export const notificationsApi = {
  getNotifications: async () => {
    await delay()
    return [
      { id: 'n-01', type: 'info',    title: 'Welcome to Das Elb!', body: 'Your room is ready. Enjoy your stay.', read: false, createdAt: new Date(Date.now() - 2 * 3600000).toISOString() },
      { id: 'n-02', type: 'order',   title: 'Order Confirmed',     body: 'Your room service order #ORD-001 has been confirmed.', read: true, createdAt: new Date(Date.now() - 5 * 3600000).toISOString() },
      { id: 'n-03', type: 'booking', title: 'Spa Reminder',        body: 'Your Swedish Massage is tomorrow at 10:00.', read: false, createdAt: new Date(Date.now() - 1 * 3600000).toISOString() },
    ]
  },

  markRead: async (id) => {
    await delay(200)
    return { id, read: true }
  },

  markAllRead: async () => {
    await delay(300)
    return { success: true }
  },
}

// ---------------------------------------------------------------------------
// Menu (full restaurant browsing — richer than room service ordering)
// ---------------------------------------------------------------------------
const MENU_CATEGORIES = [
  {
    id: 'breakfast', name: 'Breakfast', emoji: '🥞',
    description: 'A fresh start to your morning',
    availableFrom: '06:30', availableTo: '11:00',
    items: [
      { id: 'br-01', name: 'Continental Basket', emoji: '🥐', shortDescription: 'Freshly baked breads, seasonal jams & salted butter', fullDescription: 'A generous selection of our artisan breads baked fresh each morning — croissants, sourdough, and rye — served with house-made seasonal jams, honey, and French salted butter.', price: 18.50, special: false, available: true, prepTime: 5, dietary: { vegetarian: true, vegan: false, glutenFree: false, spicy: 0 }, allergens: ['Gluten', 'Milk'] },
      { id: 'br-02', name: 'Eggs Benedict', emoji: '🍳', shortDescription: 'Poached eggs on English muffin with hollandaise sauce', fullDescription: 'Two perfectly poached free-range eggs on a toasted English muffin with honey-glazed ham and our classic hollandaise. Served with mixed greens.', price: 22.00, special: true, available: true, prepTime: 15, dietary: { vegetarian: false, vegan: false, glutenFree: false, spicy: 0 }, allergens: ['Gluten', 'Eggs', 'Milk'] },
      { id: 'br-03', name: 'Avocado Toast', emoji: '🥑', shortDescription: 'Sourdough, smashed avocado, cherry tomatoes, microgreens', fullDescription: 'Thick-cut toasted sourdough topped with seasoned smashed avocado, halved cherry tomatoes, microgreens, and a drizzle of extra-virgin olive oil. Add a poached egg for +3,50 €.', price: 19.00, special: false, available: true, prepTime: 10, dietary: { vegetarian: true, vegan: true, glutenFree: false, spicy: 0 }, allergens: ['Gluten'] },
      { id: 'br-04', name: 'Bircher Muesli', emoji: '🥣', shortDescription: 'Overnight oats, seasonal berries, toasted almonds, honey', fullDescription: 'Traditional Swiss-style bircher muesli prepared overnight with rolled oats, grated apple, natural yoghurt, mixed berries, toasted almonds, and a touch of honey.', price: 14.00, special: false, available: true, prepTime: 2, dietary: { vegetarian: true, vegan: false, glutenFree: false, spicy: 0 }, allergens: ['Gluten', 'Milk', 'Nuts'] },
      { id: 'br-05', name: 'Smoked Salmon Platter', emoji: '🐟', shortDescription: 'Scottish smoked salmon, cream cheese, capers, red onion', fullDescription: 'Thinly sliced Scottish smoked salmon on toasted pumpernickel, whipped cream cheese, brined capers, red onion, and lemon. Accompanied by a small herb salad.', price: 26.00, special: true, available: true, prepTime: 8, dietary: { vegetarian: false, vegan: false, glutenFree: false, spicy: 0 }, allergens: ['Fish', 'Gluten', 'Milk'] },
      { id: 'br-06', name: 'Granola & Açaí Bowl', emoji: '🫙', shortDescription: 'House-made granola, açaí, seasonal fruit, coconut flakes', fullDescription: 'House-made crunchy granola over an açaí and banana base, topped with seasonal fresh fruit, coconut flakes, pumpkin seeds, and a drizzle of agave syrup.', price: 16.00, special: false, available: true, prepTime: 5, dietary: { vegetarian: true, vegan: true, glutenFree: true, spicy: 0 }, allergens: ['Nuts'] },
    ],
  },
  {
    id: 'starters', name: 'Starters', emoji: '🥗',
    description: 'Light bites & appetisers',
    availableFrom: '12:00', availableTo: '23:00',
    items: [
      { id: 'st-01', name: 'Burrata & Heritage Tomatoes', emoji: '🧀', shortDescription: 'Creamy burrata, heirloom tomatoes, aged balsamic, basil oil', fullDescription: 'Creamy Italian burrata on a bed of heirloom tomatoes — a mix of yellow, red, and green varieties — finished with aged balsamic, fresh basil, and Sicilian olive oil.', price: 18.00, special: true, available: true, prepTime: 5, dietary: { vegetarian: true, vegan: false, glutenFree: true, spicy: 0 }, allergens: ['Milk'] },
      { id: 'st-02', name: 'Tuna Tartare', emoji: '🐟', shortDescription: 'Yellowfin tuna, sesame, soy-ginger dressing, crispy wonton', fullDescription: 'Diced yellowfin tuna tossed in a light soy-ginger dressing with sesame seeds, cucumber, and avocado. Served with crispy wonton crackers.', price: 22.00, special: true, available: true, prepTime: 10, dietary: { vegetarian: false, vegan: false, glutenFree: false, spicy: 1 }, allergens: ['Fish', 'Gluten', 'Sesame', 'Soy'] },
      { id: 'st-03', name: 'Soup of the Day', emoji: '🍲', shortDescription: "Chef's seasonal soup, artisan bread roll", fullDescription: "Our chef's daily creation using the finest seasonal produce. Ask your server for today's selection. Always served with a freshly baked bread roll.", price: 12.00, special: false, available: true, prepTime: 5, dietary: { vegetarian: true, vegan: false, glutenFree: false, spicy: 0 }, allergens: ['Gluten', 'Milk'] },
      { id: 'st-04', name: 'Beef Carpaccio', emoji: '🥩', shortDescription: 'Paper-thin beef fillet, truffle oil, parmesan shavings, rocket', fullDescription: 'Thinly sliced raw beef fillet drizzled with white truffle oil, shaved parmesan, baby rocket, capers, and lemon. A timeless Italian classic.', price: 20.00, special: false, available: true, prepTime: 8, dietary: { vegetarian: false, vegan: false, glutenFree: true, spicy: 0 }, allergens: ['Milk'] },
      { id: 'st-05', name: 'Crispy Calamari', emoji: '🦑', shortDescription: 'Lightly battered squid rings, lemon aioli, chilli flakes', fullDescription: 'Tender squid rings in a light seasoned batter, fried until golden. Served with our house lemon aioli and a sprinkle of chilli flakes.', price: 16.00, special: false, available: true, prepTime: 12, dietary: { vegetarian: false, vegan: false, glutenFree: false, spicy: 1 }, allergens: ['Gluten', 'Seafood', 'Eggs'] },
    ],
  },
  {
    id: 'mains', name: 'Mains', emoji: '🍽️',
    description: 'Signature dishes from our kitchen',
    availableFrom: '12:00', availableTo: '23:00',
    items: [
      { id: 'mn-01', name: 'North Sea Plaice', emoji: '🐟', shortDescription: 'Pan-fried plaice, brown butter, capers, spinach, new potatoes', fullDescription: "Fresh North Sea plaice pan-fried in browned butter with capers and lemon zest. Served with wilted baby spinach and boiled new potatoes. Our chef's signature dish.", price: 32.00, special: true, available: true, prepTime: 20, dietary: { vegetarian: false, vegan: false, glutenFree: true, spicy: 0 }, allergens: ['Fish', 'Milk'] },
      { id: 'mn-02', name: 'Beef Tenderloin 200g', emoji: '🥩', shortDescription: 'Grass-fed fillet, black truffle jus, root vegetables, potato gratin', fullDescription: 'Prime 200g grass-fed beef tenderloin cooked to your preference, with a rich black truffle jus, seasonal root vegetables, and a creamy potato and gruyère gratin.', price: 48.00, special: true, available: true, prepTime: 25, dietary: { vegetarian: false, vegan: false, glutenFree: false, spicy: 0 }, allergens: ['Milk', 'Gluten'] },
      { id: 'mn-03', name: 'Pasta Carbonara', emoji: '🍝', shortDescription: 'Rigatoni, guanciale, egg yolk, pecorino romano, black pepper', fullDescription: 'Traditional Roman carbonara made with imported rigatoni, crisped guanciale, rich egg yolk emulsion, aged pecorino romano, and generously cracked black pepper.', price: 24.00, special: false, available: true, prepTime: 18, dietary: { vegetarian: false, vegan: false, glutenFree: false, spicy: 0 }, allergens: ['Gluten', 'Eggs', 'Milk'] },
      { id: 'mn-04', name: 'Wild Mushroom Risotto', emoji: '🍄', shortDescription: 'Arborio rice, wild mushrooms, parmesan, truffle oil, fresh herbs', fullDescription: 'Slow-cooked arborio rice with sautéed wild mushrooms — porcini, chanterelle, and shiitake — finished with parmesan, fresh thyme, and a drizzle of white truffle oil.', price: 26.00, special: false, available: true, prepTime: 22, dietary: { vegetarian: true, vegan: false, glutenFree: true, spicy: 0 }, allergens: ['Milk'] },
      { id: 'mn-05', name: 'Das Elb Burger', emoji: '🍔', shortDescription: '200g dry-aged Angus, aged cheddar, truffle mayo, brioche, fries', fullDescription: 'Our signature 200g dry-aged Angus beef patty with aged cheddar, caramelised onions, iceberg lettuce, tomato, and house truffle mayo on a toasted brioche bun. Served with truffle fries.', price: 28.00, special: false, available: true, prepTime: 18, dietary: { vegetarian: false, vegan: false, glutenFree: false, spicy: 0 }, allergens: ['Gluten', 'Milk', 'Eggs', 'Sesame'] },
      { id: 'mn-06', name: 'Grilled Sea Bass', emoji: '🐠', shortDescription: 'Mediterranean sea bass, fennel, white wine sauce, saffron couscous', fullDescription: 'Whole Mediterranean sea bass fillet grilled with fennel and herbs, served in a light white wine and caper beurre blanc sauce over saffron-infused couscous.', price: 34.00, special: false, available: true, prepTime: 20, dietary: { vegetarian: false, vegan: false, glutenFree: false, spicy: 0 }, allergens: ['Fish', 'Milk', 'Gluten', 'Sulphites'] },
    ],
  },
  {
    id: 'desserts', name: 'Desserts', emoji: '🍰',
    description: 'Sweet finales',
    availableFrom: '12:00', availableTo: '23:00',
    items: [
      { id: 'ds-01', name: 'Crème Brûlée', emoji: '🍮', shortDescription: 'Vanilla bean custard, caramelised crust, fresh raspberries', fullDescription: 'Classic French crème brûlée infused with Madagascan vanilla bean, topped with a perfectly caramelised sugar crust. Served with fresh raspberries and a mint sprig.', price: 14.00, special: true, available: true, prepTime: 5, dietary: { vegetarian: true, vegan: false, glutenFree: true, spicy: 0 }, allergens: ['Milk', 'Eggs'] },
      { id: 'ds-02', name: 'Chocolate Fondant', emoji: '🍫', shortDescription: 'Warm dark chocolate cake, molten centre, vanilla ice cream', fullDescription: 'A warm 70% dark chocolate fondant with a molten centre, served with Tahitian vanilla bean ice cream and a dusting of premium cocoa powder. A perennial favourite.', price: 16.00, special: false, available: true, prepTime: 12, dietary: { vegetarian: true, vegan: false, glutenFree: false, spicy: 0 }, allergens: ['Gluten', 'Milk', 'Eggs'] },
      { id: 'ds-03', name: 'Seasonal Sorbet', emoji: '🍧', shortDescription: 'Three scoops of daily-churned fruit sorbets — vegan & GF', fullDescription: "Three generous scoops of our daily-churned fruit sorbets. Today's selection: mango-passionfruit, raspberry, and lemon verbena. Always vegan and gluten-free.", price: 11.00, special: false, available: true, prepTime: 3, dietary: { vegetarian: true, vegan: true, glutenFree: true, spicy: 0 }, allergens: [] },
      { id: 'ds-04', name: 'Cheese Plate', emoji: '🧀', shortDescription: 'Curated German & French cheeses, quince, honey, crackers', fullDescription: 'A hand-selected trio — Aged Gouda, Brie de Meaux, and German Bergkäse — served with quince paste, organic honey, toasted crackers, and candied walnuts.', price: 18.00, special: false, available: true, prepTime: 5, dietary: { vegetarian: true, vegan: false, glutenFree: false, spicy: 0 }, allergens: ['Milk', 'Gluten', 'Nuts'] },
      { id: 'ds-05', name: 'Tiramisu', emoji: '☕', shortDescription: 'Espresso-soaked ladyfingers, mascarpone cream, cocoa dusting', fullDescription: 'Classic tiramisu made with espresso-soaked Savoiardi biscuits, layered with light mascarpone cream and a generous dusting of premium cocoa powder. Prepared fresh daily.', price: 13.00, special: false, available: true, prepTime: 3, dietary: { vegetarian: true, vegan: false, glutenFree: false, spicy: 0 }, allergens: ['Gluten', 'Milk', 'Eggs'] },
    ],
  },
  {
    id: 'beverages', name: 'Beverages', emoji: '🍷',
    description: 'Drinks, wines & cocktails',
    availableFrom: '06:30', availableTo: '00:00',
    items: [
      { id: 'bv-01', name: 'Specialty Coffee', emoji: '☕', shortDescription: 'Espresso, Latte, Cappuccino, Flat White — single-origin beans', fullDescription: "Sourced from single-origin Ethiopian and Colombian beans, roasted by Hamburg's finest specialty roaster. Available as espresso, lungo, latte, cappuccino, flat white, or cortado.", price: 6.00, special: false, available: true, prepTime: 5, dietary: { vegetarian: true, vegan: false, glutenFree: true, spicy: 0 }, allergens: ['Milk'] },
      { id: 'bv-02', name: 'Fresh Pressed Juice', emoji: '🍊', shortDescription: 'Orange, apple-ginger, or beet-carrot — cold-pressed daily', fullDescription: 'Cold-pressed juices made fresh each morning. Currently: Valencia orange, apple & ginger, or beet, carrot & turmeric.', price: 8.50, special: false, available: true, prepTime: 5, dietary: { vegetarian: true, vegan: true, glutenFree: true, spicy: 0 }, allergens: [] },
      { id: 'bv-03', name: 'Elbe Signature Cocktail', emoji: '🍹', shortDescription: "Bartender's seasonal creation — non-alcoholic version available", fullDescription: "Our bartender's seasonal creation inspired by Hamburg's maritime heritage. Today: spiced rum, elderflower, lime, fresh mint, and Elbe tonic. Ask about our alcohol-free version.", price: 14.00, special: true, available: true, prepTime: 8, dietary: { vegetarian: true, vegan: true, glutenFree: true, spicy: 0 }, allergens: ['Sulphites'] },
      { id: 'bv-04', name: 'Wine by the Glass', emoji: '🍷', shortDescription: "Sommelier's curated red, white, or rosé selection", fullDescription: "Select from our sommelier's curated list. White: Riesling Spätlese (Mosel) or Sancerre. Red: Pinot Noir (Baden) or Barolo. Rosé: Côtes de Provence.", price: 12.00, special: false, available: true, prepTime: 2, dietary: { vegetarian: true, vegan: true, glutenFree: true, spicy: 0 }, allergens: ['Sulphites'] },
      { id: 'bv-05', name: 'Mineral Water 0.75l', emoji: '💧', shortDescription: 'Still or sparkling, Eifel spring water, served chilled', fullDescription: 'German mineral water from the Eifel region. Available still or sparkling. Served chilled in a glass bottle.', price: 7.00, special: false, available: true, prepTime: 1, dietary: { vegetarian: true, vegan: true, glutenFree: true, spicy: 0 }, allergens: [] },
      { id: 'bv-06', name: 'Hamburg Craft Beer', emoji: '🍺', shortDescription: 'Local Elbe Lager or hop-forward IPA — on tap or bottled', fullDescription: 'Locally brewed Hamburg craft beers from our partner brewery. Choose between the crisp Elbe Lager or the hop-forward India Pale Ale. Both on tap or bottled.', price: 7.50, special: false, available: true, prepTime: 2, dietary: { vegetarian: true, vegan: false, glutenFree: false, spicy: 0 }, allergens: ['Gluten'] },
    ],
  },
]

export const menuApi = {
  getMenu: async () => {
    await delay(600 + Math.random() * 400)
    return { categories: MENU_CATEGORIES }
  },

  placeOrder: async (order) => {
    await delay(800)
    return {
      orderId:           `ORD-${Date.now()}`,
      status:            'confirmed',
      estimatedDelivery: new Date(Date.now() + 25 * 60 * 1000).toISOString(),
      totalAmount:       order.items.reduce((s, i) => s + i.price * i.quantity, 0),
    }
  },
}

// ---------------------------------------------------------------------------
// Dining — Signature / special dishes
// ---------------------------------------------------------------------------
export const diningApi = {
  getSpecialDishes: async () => {
    await delay(500 + Math.random() * 300)
    return [
      {
        id: 'sd-01', name: 'Elbe Bouillabaisse', emoji: '🦞',
        category: 'Seafood', price: 38.00,
        tags: ['Chef Special', 'Signature'],
        shortDescription: 'A Hamburg twist on the Marseille classic',
        description: 'Our interpretation of the legendary Provençal seafood stew, built on a rich eight-hour saffron broth with North Sea lobster, mussels, plaice, and king shrimp. Served with rouille-brushed grilled baguette and melted gruyère.',
        chefNotes: "This dish is my love letter to Hamburg's seafood heritage. I slow-cook the broth for eight hours, adding the shellfish in stages for perfect texture. Don't skip the rouille — it's the soul of the dish.",
        ingredients: ['North Sea Lobster', 'Mussels', 'Plaice', 'King Shrimp', 'Saffron', 'Fennel', 'Tomato', 'Rouille', 'Gruyère'],
        chefRecommendation: "Start with a spoonful of broth alone, then work through the seafood. Each element is seasoned separately — together they create something extraordinary.",
        available: true, servingTime: 'Lunch & Dinner', prepTime: 25, servings: '1',
        dietary: { vegetarian: false, vegan: false, glutenFree: false, spicy: 0 },
        allergens: ['Fish', 'Shellfish', 'Gluten', 'Milk', 'Eggs'],
      },
      {
        id: 'sd-02', name: 'Black Angus Tomahawk', emoji: '🥩',
        category: 'Meat', price: 95.00,
        tags: ["Today's Highlight", 'Popular'],
        shortDescription: '1kg 45-day dry-aged tomahawk — the ultimate centrepiece',
        description: 'A magnificent 1kg dry-aged Black Angus tomahawk ribeye, seared in a cast-iron pan and finished in the oven to your exact preference. Served with roasted bone marrow butter, pommes dauphinoise, wild mushroom fricassée, and a rich red wine jus.',
        chefNotes: "The dry-ageing develops extraordinary depth — nutty, complex, with a perfect crust. Order medium-rare; it would be a crime to cook it further.",
        ingredients: ['Black Angus Tomahawk 1kg', 'Bone Marrow Butter', 'Pommes Dauphinoise', 'Wild Mushrooms', 'Red Wine Jus', 'Rosemary', 'Garlic', 'Thyme'],
        chefRecommendation: "This is for two to share. The bone marrow butter melts into the crust in the final minute of resting. Pair with the 2019 Barolo from our sommelier.",
        available: true, servingTime: 'Dinner only', prepTime: 35, servings: '1–2',
        dietary: { vegetarian: false, vegan: false, glutenFree: false, spicy: 0 },
        allergens: ['Milk', 'Gluten'],
      },
      {
        id: 'sd-03', name: 'Lobster Thermidor', emoji: '🦀',
        category: 'Seafood', price: 68.00,
        tags: ['Limited Time', 'Chef Special'],
        shortDescription: 'Half lobster, cognac cream, gruyère crust, hand-cut frites',
        description: 'A whole half-lobster split and pan-roasted, then topped with a cognac-spiked cream sauce and freshly grated gruyère, finished under the grill until bubbling gold. Served with hand-cut frites and watercress salad.',
        chefNotes: "Thermidor is a dish about restraint — too much sauce and you lose the lobster. I use just enough cognac cream to complement the sweetness of the shell, then let the gruyère do the rest.",
        ingredients: ['Canadian Lobster ½', 'Cognac', 'Heavy Cream', 'Gruyère', 'Shallots', 'Dijon Mustard', 'Tarragon', 'Hand-cut Frites'],
        chefRecommendation: "Order this with a glass of white Burgundy or dry Champagne. The richness of the sauce calls for something crisp and mineral to cut through it.",
        available: true, servingTime: 'Dinner only', prepTime: 30, servings: '1',
        dietary: { vegetarian: false, vegan: false, glutenFree: false, spicy: 0 },
        allergens: ['Shellfish', 'Milk', 'Gluten', 'Sulphites'],
      },
      {
        id: 'sd-04', name: 'Wagyu Tataki', emoji: '🥩',
        category: 'Japanese', price: 52.00,
        tags: ['New', 'Chef Special'],
        shortDescription: 'A5 Miyazaki Wagyu, barely seared, yuzu ponzu, white truffle',
        description: 'Exquisite A5 Miyazaki Wagyu beef lightly seared — just 10 seconds per side — sliced paper-thin and served with yuzu-ponzu dressing, micro shiso, crispy shallots, wasabi cream, and shaved white truffle.',
        chefNotes: "True A5 Wagyu needs almost no cooking. The fat marbling is so intense that heat alone releases the flavour. Let it rest 3 minutes, slice thin, and step back.",
        ingredients: ['A5 Miyazaki Wagyu', 'White Truffle', 'Yuzu Ponzu', 'Micro Shiso', 'Crispy Shallots', 'Wasabi Cream', 'Toasted Sesame', 'Nori'],
        chefRecommendation: "Eat this the moment it arrives. The residual heat from the sear continues to warm the meat gently. Don't add anything — eat it as it comes.",
        available: true, servingTime: 'Dinner only', prepTime: 15, servings: '1',
        dietary: { vegetarian: false, vegan: false, glutenFree: true, spicy: 1 },
        allergens: ['Fish', 'Sesame', 'Soy'],
      },
      {
        id: 'sd-05', name: 'Truffled Hen\'s Egg', emoji: '🥚',
        category: 'Vegetarian', price: 28.00,
        tags: ['Popular', 'Seasonal'],
        shortDescription: '63°C sous-vide egg, truffle, Parmesan foam, Oscietra caviar',
        description: "A single perfect 63°C hen's egg cooked sous-vide for 45 minutes, served over a silky potato velouté, topped with shaved black truffle, Parmesan foam, and Oscietra caviar. Finished with chive oil.",
        chefNotes: "The 63°C egg is our most technically precise dish. One degree too high and the yolk overcooks; one too low and it doesn't set. When it's right, the yolk flows like warm silk into the velouté.",
        ingredients: ["Free-range Hen's Egg", 'Black Truffle', 'Oscietra Caviar', 'Potato Velouté', 'Parmesan Foam', 'Chive Oil', 'Crème Fraîche'],
        chefRecommendation: "Pierce the yolk immediately and let it cascade into the velouté. The caviar provides a saline counterpoint to the richness of the truffle and egg.",
        available: true, servingTime: 'Lunch & Dinner', prepTime: 50, servings: '1',
        dietary: { vegetarian: true, vegan: false, glutenFree: true, spicy: 0 },
        allergens: ['Eggs', 'Milk', 'Fish'],
      },
      {
        id: 'sd-06', name: 'Hamburg Crab Linguine', emoji: '🦞',
        category: 'Pasta', price: 36.00,
        tags: ["Today's Highlight", 'Seasonal'],
        shortDescription: 'Hand-picked Danish crab, bronze-die linguine, chilli, lemon',
        description: 'Hand-picked brown and white crab meat from the Danish coast, tossed with bronze-die linguine, fresh red chilli, garlic, lemon zest, flat-leaf parsley, and dry white wine. Finished with a thread of extra-virgin olive oil.',
        chefNotes: "The crab arrives live each morning. We steam, pick, and dress the white and brown meat separately. The brown meat enriches the sauce; the white meat is folded in last to preserve its sweetness.",
        ingredients: ['Hand-picked White Crab', 'Brown Crab Butter', 'Bronze-die Linguine', 'Red Chilli', 'Garlic', 'Lemon Zest', 'Flat-leaf Parsley', 'White Wine'],
        chefRecommendation: "This is a dish where the pasta matters as much as the crab. The rough texture of bronze-die pasta holds the sauce. No cream — the crab fat is the richness.",
        available: true, servingTime: 'Lunch & Dinner', prepTime: 20, servings: '1',
        dietary: { vegetarian: false, vegan: false, glutenFree: false, spicy: 1 },
        allergens: ['Shellfish', 'Gluten', 'Sulphites'],
      },
    ]
  },
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------
const EVENTS_DATA = [
  {
    id: 'ev-01',
    emoji: '🎷',
    title: 'Sunday Jazz Brunch',
    category: 'Entertainment',
    venue: 'Elbe Terrace',
    date: '2026-04-14',
    time: '11:00',
    durationMinutes: 150,
    price: 39.00,
    priceNote: 'per person · includes brunch buffet',
    spotsTotal: 24,
    spotsLeft: 6,
    tags: ['Live Music', 'Brunch'],
    shortDescription: 'Live jazz quartet and a lavish brunch buffet overlooking the Elbe.',
    description: 'Start your Sunday the right way. Our resident jazz quartet performs a two-set programme while you enjoy an unlimited brunch buffet: oysters and smoked salmon, fresh pastries, eggs every style, and our signature Elbe Bloody Mary. The terrace opens directly onto the river — reserve a rail table for the best view.',
    highlights: ['Live 4-piece jazz quartet', 'Unlimited brunch buffet', 'Oysters & smoked salmon station', 'Free-flowing Prosecco option (+€18)'],
    dressCode: 'Smart casual',
    menu: [
      { course: 'Buffet Highlights', items: ['Freshly shucked oysters', 'House-smoked salmon', 'Eggs Benedict & Florentine', 'Charcuterie & cheese board', 'Seasonal pastries & breads'] },
      { course: 'Drinks', items: ['Filter coffee & specialty teas', 'Fresh-pressed juices', 'Elbe Bloody Mary'] },
    ],
    available: true,
  },
  {
    id: 'ev-02',
    emoji: '🍷',
    title: 'Wine & Sommelier Evening',
    category: 'Dining',
    venue: 'Elbe Restaurant',
    date: '2026-04-14',
    time: '19:30',
    durationMinutes: 120,
    price: 89.00,
    priceNote: 'per person · 6 wines + canapes',
    spotsTotal: 20,
    spotsLeft: 4,
    tags: ['Wine', 'Tasting'],
    shortDescription: 'Guided vertical tasting of six exceptional wines led by our head sommelier.',
    description: 'Head sommelier Luisa Becker leads an intimate tasting journey through six exceptional wines — from a crisp Mosel Riesling to a structured Barolo. Each wine is paired with a chef-designed canapé. Learn to read a wine label, understand regional character, and discover food-pairing principles you will use for life.',
    highlights: ['6 curated wines across 4 regions', 'Paired canapés for each wine', 'Tasting notes & take-home booklet', 'Meet the sommelier Q&A'],
    dressCode: 'Smart casual to formal',
    menu: [
      { course: 'Wines', items: ['2023 Weingut Loosen Riesling Spätlese (Mosel)', '2021 Domaine Leflaive Mâcon-Verzé (Burgundy)', '2019 Château Léoville-Barton (Saint-Julien)', '2020 Barolo DOCG Serralunga (Piedmont)', "2018 Château d'Yquem Sauternes (Bordeaux)", "2022 Graham's 10-Year Tawny Port (Douro)"] },
      { course: 'Canapés', items: ['Blini with Oscietra caviar & crème fraîche', 'Gougères with Gruyère', 'Foie gras torchon on brioche', 'Wagyu beef tartare on bone-marrow crisp', 'Aged Comté with fig chutney', 'Dark chocolate & sea-salt truffle'] },
    ],
    available: true,
  },
  {
    id: 'ev-03',
    emoji: '🧘',
    title: 'Elbe Sunrise Yoga',
    category: 'Wellness',
    venue: 'Rooftop Terrace',
    date: '2026-04-15',
    time: '07:00',
    durationMinutes: 60,
    price: 0,
    priceNote: 'complimentary for hotel guests',
    spotsTotal: 12,
    spotsLeft: 8,
    tags: ['Yoga', 'Wellness', 'Complimentary'],
    shortDescription: 'A 60-minute flow class on the rooftop as the sun rises over the Elbe.',
    description: 'Welcome Tuesday with a 60-minute Vinyasa flow on the rooftop as Hamburg wakes below you. Instructor Mia Hoffmann guides all levels — from complete beginners to experienced practitioners. Mats, blocks, and blankets provided. Finish with hot ginger tea and a clear head for the day.',
    highlights: ['All levels welcome', 'Mats & props provided', 'Post-class ginger tea', 'Panoramic Elbe sunrise views'],
    dressCode: 'Comfortable activewear',
    menu: [],
    available: true,
  },
  {
    id: 'ev-04',
    emoji: '⚓',
    title: 'Hamburg Harbour Boat Tour',
    category: 'Activity',
    venue: 'Hotel Jetty',
    date: '2026-04-15',
    time: '15:00',
    durationMinutes: 90,
    price: 45.00,
    priceNote: 'per person · welcome drink included',
    spotsTotal: 12,
    spotsLeft: 5,
    tags: ['Boat', 'Hamburg', 'Sightseeing'],
    shortDescription: "Private charter along the Elbe — the port, Speicherstadt, and Elbphilharmonie.",
    description: "Board a private charter from the hotel jetty and navigate Hamburg's iconic waterways. Your guide narrates the history of Europe's third-largest port as you glide past the Speicherstadt UNESCO quarter, the gleaming Elbphilharmonie, HafenCity, and the historic warehouse district. A welcome drink is served on departure.",
    highlights: ['Private charter boat', 'Knowledgeable English guide', 'Elbphilharmonie photo stop', 'Welcome drink on board'],
    dressCode: 'Casual — bring a jacket',
    menu: [],
    available: true,
  },
  {
    id: 'ev-05',
    emoji: '🍸',
    title: 'Cocktail Masterclass',
    category: 'Entertainment',
    venue: 'Elb Bar',
    date: '2026-04-16',
    time: '18:00',
    durationMinutes: 90,
    price: 35.00,
    priceNote: 'per person · 3 cocktails included',
    spotsTotal: 16,
    spotsLeft: 10,
    tags: ['Cocktails', 'Interactive'],
    shortDescription: 'Shake, stir, and sip — learn signature Elb Bar cocktail craft.',
    description: "Head bartender Finn Rädler reveals the craft behind three signature Elb Bar cocktails. You'll muddle, shake, stir, and garnish your own drinks, learning technique and flavour theory along the way. Leave with a personalised recipe card and a very satisfied palate.",
    highlights: ['Make 3 cocktails yourself', 'Technique & theory from head bartender', 'Personalised recipe cards', 'Bar snacks provided'],
    dressCode: 'Casual',
    menu: [
      { course: "Cocktails You'll Make", items: ['Elbe Negroni (gin, Campari, Elbe-vermouth)', 'Hamburg Sour (rye, local honey, lemon, egg white)', 'Hafen Mule (vodka, house-brewed ginger beer, lime)'] },
      { course: 'Bar Snacks', items: ['Spiced almonds', 'Rye bread with butter & salt flakes', 'House-pickled vegetables'] },
    ],
    available: true,
  },
  {
    id: 'ev-06',
    emoji: '👨‍🍳',
    title: "Chef's Table Dinner",
    category: 'Dining',
    venue: 'Private Kitchen',
    date: '2026-04-17',
    time: '19:30',
    durationMinutes: 180,
    price: 135.00,
    priceNote: 'per person · 7 courses · wines extra',
    spotsTotal: 8,
    spotsLeft: 3,
    tags: ['Exclusive', 'Fine Dining', 'Chef Special'],
    shortDescription: 'Seven-course tasting menu served at the pass by Executive Chef Lars Müller.',
    description: "The most intimate dining experience at Das Elb. Just eight guests sit at the kitchen pass as Executive Chef Lars Müller and his brigade prepare a seven-course tasting menu designed around the day's finest ingredients. Watch every plate leave the kitchen, ask anything, and dine in the beating heart of one of Hamburg's most talked-about kitchens.",
    highlights: ['7-course tasting menu', 'Seated at the kitchen pass', 'Direct interaction with Chef Lars', 'Optional wine pairing (+€75)'],
    dressCode: 'Smart to formal',
    menu: [
      { course: 'Menu', items: ['Amuse-bouche from the kitchen', 'Oscietra caviar, potato blini, dill crème', 'Hand-dived Orkney scallop, celery, truffle butter', 'North Sea turbot, smoked mussel nage, samphire', 'Wagyu beef cheek, bone marrow, horseradish', 'Artisan cheese from the trolley', 'Chocolate fondant, Elbe caramel, sea salt'] },
    ],
    available: true,
  },
  {
    id: 'ev-07',
    emoji: '🛁',
    title: 'Nordic Spa Ritual',
    category: 'Wellness',
    venue: 'Das Elb Spa',
    date: '2026-04-18',
    time: '10:00',
    durationMinutes: 120,
    price: 75.00,
    priceNote: 'per person · 2-hour private circuit',
    spotsTotal: 6,
    spotsLeft: 4,
    tags: ['Spa', 'Nordic', 'Wellness'],
    shortDescription: 'Private sauna circuit, ice plunge, and 60-minute massage at Das Elb Spa.',
    description: "The Nordic ritual is the spa's signature experience: a guided heat-and-cold circuit through the Finnish sauna, steam room, and 8°C ice plunge pool, followed by a 60-minute signature massage using oils hand-blended by our therapists. The circuit is reserved exclusively for your party for the full two hours.",
    highlights: ['Private 2-hour spa circuit', 'Finnish sauna & steam room', '8°C ice plunge pool', '60-minute signature massage'],
    dressCode: 'Provided robes & towels',
    menu: [],
    available: true,
  },
  {
    id: 'ev-08',
    emoji: '🚢',
    title: 'Elbe Sunset Cruise',
    category: 'Activity',
    venue: 'Hotel Jetty',
    date: '2026-04-19',
    time: '17:30',
    durationMinutes: 120,
    price: 55.00,
    priceNote: 'per person · Champagne & canapés',
    spotsTotal: 20,
    spotsLeft: 12,
    tags: ['Sunset', 'Cruise', 'Champagne'],
    shortDescription: 'Two-hour Elbe cruise at golden hour with Champagne and chef canapés.',
    description: 'Depart from the hotel jetty as the light turns golden over Hamburg. Two hours on the Elbe with a glass of Ruinart Blanc de Blancs in hand and a selection of chef canapés circulating the deck. Watch the city skyline shift from afternoon to evening and return refreshed, unhurried, and ready for dinner.',
    highlights: ['2-hour sunset river cruise', 'Ruinart Champagne service', 'Chef canapés on deck', 'Hamburg skyline at golden hour'],
    dressCode: 'Smart casual — jacket recommended',
    menu: [
      { course: 'Drinks', items: ['Ruinart Blanc de Blancs Champagne', 'Non-alcoholic elderflower spritz'] },
      { course: 'Canapés', items: ['Smoked salmon on rye crisp', 'Prawn & avocado bites', "Goat's cheese & roasted pepper", 'Dark chocolate & raspberry cups'] },
    ],
    available: true,
  },
]

export const eventsApi = {
  getEvents: async () => {
    await delay(400 + Math.random() * 300)
    return [...EVENTS_DATA]
  },
  reserveEvent: async ({ eventId, guestCount, specialRequests }) => {
    await delay(800 + Math.random() * 400)
    const event = EVENTS_DATA.find((e) => e.id === eventId)
    if (!event) throw new Error('Event not found')
    if (!event.available) throw new Error('This event is no longer available')
    if (guestCount > event.spotsLeft) throw new Error(`Only ${event.spotsLeft} spot${event.spotsLeft === 1 ? '' : 's'} remaining`)
    const confirmationNumber = `EV-${Date.now().toString(36).toUpperCase().slice(-6)}`
    return { confirmationNumber, eventId, guestCount, specialRequests }
  },
}

// ---------------------------------------------------------------------------
// Front Desk Requests
// Real API when VITE_HMS_API_URL is configured, otherwise falls back to mock.
// ---------------------------------------------------------------------------

// ── HMS API base URL ──────────────────────────────────────────────────────────
// Set VITE_HMS_API_URL=http://localhost:8000/api in .env.local to enable real mode.
const HMS_BASE = (import.meta.env.VITE_HMS_API_URL || '').replace(/\/$/, '')
const GUEST_API = HMS_BASE ? `${HMS_BASE}/guest` : null

// ── Guest token cache (in-memory, refreshed on login) ─────────────────────────
let _guestToken = null

async function _ensureGuestToken(booking) {
  if (_guestToken) return _guestToken
  if (!GUEST_API) return null
  const res = await fetch(`${GUEST_API}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      booking_id: booking.bookingNumber,
      last_name:  booking.guestLastName || booking.lastName || '',
    }),
  })
  if (!res.ok) return null
  const data = await res.json()
  _guestToken = data.access_token
  return _guestToken
}

function _authHeader(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

// ── Status → guest-facing shape mapping ───────────────────────────────────────
const HMS_STATUS_MAP = {
  pending:     'open',
  open:        'open',
  in_progress: 'in_progress',
  inspecting:  'in_progress',
  done:        'completed',
  cancelled:   'cancelled',
}

function _mapHmsTask(t) {
  const guestStatus = HMS_STATUS_MAP[t.status] ?? 'open'
  // Rebuild a timeline from available timestamps
  const timeline = [
    { status: 'open', label: 'Request submitted', time: t.submitted_at },
  ]
  if (t.status === 'in_progress' || t.status === 'done' || t.status === 'completed') {
    timeline.push({ status: 'in_progress', label: 'Staff attending', time: t.updated_at })
  }
  if (t.status === 'done' || t.status === 'completed') {
    timeline.push({ status: 'completed', label: 'Resolved', time: t.updated_at })
  }

  // Parse best_time from description if embedded
  const desc = t.description || ''
  const bestTimeMatch = desc.match(/\[Best time: ([^\]]+)\]/)
  const cleanDesc = desc.replace(/\n?\[Best time: [^\]]+\]/g, '').trim()
  const bestTime = bestTimeMatch ? bestTimeMatch[1] : null

  // Split staff notes from follow-up messages in the notes field
  const notes = t.notes || ''
  const guestMsgLines = notes.split('\n').filter(l => l.startsWith('[Guest '))
  const staffNotesLines = notes.split('\n').filter(l => !l.startsWith('[Guest ')).join('\n').trim()
  const messages = guestMsgLines.map((l, i) => {
    const timeMatch = l.match(/\[Guest (\d{2}:\d{2})\] (.+)/)
    return {
      id: i,
      role: 'guest',
      text: timeMatch ? timeMatch[2] : l,
      time: new Date().toISOString(),
    }
  })

  return {
    ticketId:      t.ticket_id,
    title:         t.title,
    category:      t.category,
    description:   cleanDesc || t.description,
    urgency:       t.urgency || 'normal',
    status:        guestStatus,
    hasUnread:     false,
    submittedAt:   t.submitted_at,
    timeline,
    staffNotes:    staffNotesLines || null,
    estimatedTime: t.estimated_time,
    messages,
    bestTime,
  }
}

// ── Mock fallback data ────────────────────────────────────────────────────────
let MOCK_REQUESTS = [
  {
    ticketId:    'FD-2B9X4K',
    guestId:     'g-001',
    title:       'Extra Towels',
    category:    'Housekeeping',
    description: 'Please bring 2 extra bath towels.',
    urgency:     'normal',
    bestTime:    null,
    status:      'completed',
    hasUnread:   false,
    submittedAt: new Date(Date.now() - 1000 * 60 * 60 * 18).toISOString(),
    timeline: [
      { status: 'open',         label: 'Request submitted',     time: new Date(Date.now() - 1000 * 60 * 60 * 18).toISOString() },
      { status: 'acknowledged', label: 'Acknowledged by staff',  time: new Date(Date.now() - 1000 * 60 * 60 * 17.5).toISOString() },
      { status: 'in_progress',  label: 'Housekeeper en route',  time: new Date(Date.now() - 1000 * 60 * 60 * 17).toISOString() },
      { status: 'completed',    label: 'Delivered to your room', time: new Date(Date.now() - 1000 * 60 * 60 * 16.5).toISOString() },
    ],
    staffNotes:    'Delivered 2 bath towels and 1 hand towel.',
    estimatedTime: null,
    messages:      [],
  },
  {
    ticketId:    'FD-7M3TQZ',
    guestId:     'g-001',
    title:       'Room Maintenance',
    category:    'Maintenance',
    description: 'The bathroom tap is dripping. Please send maintenance.',
    urgency:     'soon',
    bestTime:    '14:00',
    status:      'in_progress',
    hasUnread:   true,
    submittedAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    timeline: [
      { status: 'open',         label: 'Request submitted',    time: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString() },
      { status: 'acknowledged', label: 'Acknowledged by staff', time: new Date(Date.now() - 1000 * 60 * 60 * 2.5).toISOString() },
      { status: 'in_progress',  label: 'Technician assigned',  time: new Date(Date.now() - 1000 * 60 * 45).toISOString() },
    ],
    staffNotes:    'Technician Klaus is assigned. Will arrive around 14:00.',
    estimatedTime: '14:00 today',
    messages:      [],
  },
]

// ── API ───────────────────────────────────────────────────────────────────────
export const frontDeskApi = {
  /**
   * Exchange guest JWT for this session.
   * Call this after login so all subsequent requests are authenticated.
   */
  authenticate: async (booking) => {
    _guestToken = null
    return _ensureGuestToken(booking)
  },

  getRequestHistory: async (guestId, booking) => {
    if (GUEST_API && booking) {
      try {
        const token = await _ensureGuestToken(booking)
        if (token) {
          const res = await fetch(`${GUEST_API}/requests`, {
            headers: _authHeader(token),
          })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const data = await res.json()
          return data.map(_mapHmsTask)
        }
      } catch (err) {
        console.warn('[frontDeskApi] Real API failed, falling back to mock:', err)
      }
    }
    await delay(400 + Math.random() * 300)
    return MOCK_REQUESTS.filter((r) => r.guestId === guestId)
      .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
  },

  submitRequest: async ({ guestId, title, category, description, urgency, bestTime, booking }) => {
    if (GUEST_API && booking) {
      try {
        const token = await _ensureGuestToken(booking)
        if (token) {
          const res = await fetch(`${GUEST_API}/requests`, {
            method: 'POST',
            headers: _authHeader(token),
            body: JSON.stringify({ title, category, description, urgency, best_time: bestTime || null }),
          })
          if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            throw new Error(err.detail || `HTTP ${res.status}`)
          }
          return await res.json()
        }
      } catch (err) {
        console.warn('[frontDeskApi] Real API failed, falling back to mock:', err)
      }
    }
    // Mock fallback
    await delay(700 + Math.random() * 400)
    const ticketId = `FD-${Date.now().toString(36).toUpperCase().slice(-6)}`
    const now = new Date().toISOString()
    const etaMinutes = urgency === 'urgent' ? 10 : urgency === 'soon' ? 25 : 45
    const newRequest = {
      ticketId, guestId, title, category, description, urgency,
      bestTime: bestTime || null, status: 'open', hasUnread: false,
      submittedAt: now,
      timeline: [{ status: 'open', label: 'Request submitted', time: now }],
      staffNotes: null, estimatedTime: `~${etaMinutes} minutes`, messages: [],
    }
    MOCK_REQUESTS = [newRequest, ...MOCK_REQUESTS]
    return { success: true, ticket_id: ticketId, estimated_time: `~${etaMinutes} minutes` }
  },

  updateRequest: async ({ ticketId, message, booking }) => {
    if (GUEST_API && booking) {
      try {
        const token = await _ensureGuestToken(booking)
        if (token) {
          // ticketId is "FD-<numeric_id>" — extract numeric id
          const numericId = ticketId.replace(/^FD-/i, '')
          if (/^\d+$/.test(numericId)) {
            const res = await fetch(`${GUEST_API}/requests/${numericId}/message`, {
              method: 'PATCH',
              headers: _authHeader(token),
              body: JSON.stringify({ message }),
            })
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            return await res.json()
          }
        }
      } catch (err) {
        console.warn('[frontDeskApi] Real API failed, falling back to mock:', err)
      }
    }
    await delay(500 + Math.random() * 300)
    const req = MOCK_REQUESTS.find((r) => r.ticketId === ticketId)
    if (!req) throw new Error('Request not found')
    req.messages = [...(req.messages || []), {
      id: Date.now(), role: 'guest', text: message, time: new Date().toISOString(),
    }]
    return { success: true }
  },

  markRead: async (ticketId) => {
    await delay(200)
    const req = MOCK_REQUESTS.find((r) => r.ticketId === ticketId)
    if (req) req.hasUnread = false
    return { success: true }
  },
}
