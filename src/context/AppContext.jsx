import { createContext, useContext, useReducer, useCallback } from 'react'
import { authApi } from '../services/api'
import { useSessionTimeout } from '../hooks/useSessionTimeout'
import { storage } from '../utils'
import { ROUTES } from '../constants'

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------
const initialState = {
  // Navigation
  currentRoute: ROUTES.SPLASH,
  routeParams:  {},

  // Auth
  guest:        storage.get('guest'),       // restored from localStorage
  booking:      storage.get('booking'),     // restored from localStorage
  accessToken:  storage.get('accessToken'),
  idVerified:   storage.get('idVerified', false),
  roomKey:      storage.get('roomKey', null),
  authLoading:  false,
  authError:    null,

  // Session
  sessionWarning: false,  // show "you'll be logged out soon" modal

  // UI
  darkMode:     storage.get('darkMode', false),
  notifications: [],
  unreadCount:  0,

  // Cart (room service)
  cart: [],

  // Active requests / orders (lightweight polling cache)
  activeOrders:   [],
  activeRequests: [],
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
const ACTIONS = {
  NAVIGATE:            'NAVIGATE',
  SET_AUTH_SUCCESS:    'SET_AUTH_SUCCESS',
  SET_AUTH_LOADING:    'SET_AUTH_LOADING',
  SET_AUTH_ERROR:      'SET_AUTH_ERROR',
  LOGOUT:              'LOGOUT',
  SET_SESSION_WARNING: 'SET_SESSION_WARNING',
  SET_ID_VERIFIED:     'SET_ID_VERIFIED',
  SET_ROOM_KEY:        'SET_ROOM_KEY',
  TOGGLE_DARK_MODE:    'TOGGLE_DARK_MODE',
  SET_NOTIFICATIONS:   'SET_NOTIFICATIONS',
  MARK_READ:           'MARK_READ',
  MARK_ALL_READ:       'MARK_ALL_READ',
  ADD_TO_CART:         'ADD_TO_CART',
  REMOVE_FROM_CART:    'REMOVE_FROM_CART',
  UPDATE_CART_QTY:     'UPDATE_CART_QTY',
  CLEAR_CART:          'CLEAR_CART',
  ADD_ACTIVE_ORDER:    'ADD_ACTIVE_ORDER',
  ADD_ACTIVE_REQUEST:  'ADD_ACTIVE_REQUEST',
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------
function reducer(state, action) {
  switch (action.type) {
    case ACTIONS.NAVIGATE:
      return { ...state, currentRoute: action.route, routeParams: action.params || {} }

    case ACTIONS.SET_AUTH_SUCCESS:
      return {
        ...state,
        guest:        action.guest,
        booking:      action.booking,
        accessToken:  action.token,
        authLoading:  false,
        authError:    null,
        sessionWarning: false,
      }

    case ACTIONS.SET_AUTH_LOADING:
      return { ...state, authLoading: action.loading }

    case ACTIONS.SET_AUTH_ERROR:
      return { ...state, authError: action.error, authLoading: false }

    case ACTIONS.LOGOUT: {
      // Reset everything except darkMode preference
      return {
        ...initialState,
        currentRoute:  ROUTES.LOGIN,
        accessToken:   null,
        guest:         null,
        booking:       null,
        sessionWarning: false,
        darkMode:      state.darkMode,
        // Reset restored localStorage values so they don't bleed
        notifications: [],
        unreadCount:   0,
        cart:          [],
        activeOrders:  [],
        activeRequests:[],
      }
    }

    case ACTIONS.SET_SESSION_WARNING:
      return { ...state, sessionWarning: action.show }

    case ACTIONS.SET_ID_VERIFIED:
      return { ...state, idVerified: action.verified }

    case ACTIONS.SET_ROOM_KEY:
      return { ...state, roomKey: action.roomKey }

    case ACTIONS.TOGGLE_DARK_MODE: {
      const darkMode = !state.darkMode
      storage.set('darkMode', darkMode)
      if (darkMode) document.documentElement.classList.add('dark')
      else          document.documentElement.classList.remove('dark')
      return { ...state, darkMode }
    }

    case ACTIONS.SET_NOTIFICATIONS: {
      const unread = action.notifications.filter((n) => !n.read).length
      return { ...state, notifications: action.notifications, unreadCount: unread }
    }

    case ACTIONS.MARK_READ: {
      const notifications = state.notifications.map((n) =>
        n.id === action.id ? { ...n, read: true } : n
      )
      return { ...state, notifications, unreadCount: notifications.filter((n) => !n.read).length }
    }

    case ACTIONS.MARK_ALL_READ: {
      const notifications = state.notifications.map((n) => ({ ...n, read: true }))
      return { ...state, notifications, unreadCount: 0 }
    }

    case ACTIONS.ADD_TO_CART: {
      const existing = state.cart.find((i) => i.id === action.item.id)
      const cart = existing
        ? state.cart.map((i) => i.id === action.item.id ? { ...i, quantity: i.quantity + 1 } : i)
        : [...state.cart, { ...action.item, quantity: 1 }]
      return { ...state, cart }
    }

    case ACTIONS.REMOVE_FROM_CART:
      return { ...state, cart: state.cart.filter((i) => i.id !== action.id) }

    case ACTIONS.UPDATE_CART_QTY: {
      const cart = action.quantity <= 0
        ? state.cart.filter((i) => i.id !== action.id)
        : state.cart.map((i) => i.id === action.id ? { ...i, quantity: action.quantity } : i)
      return { ...state, cart }
    }

    case ACTIONS.CLEAR_CART:
      return { ...state, cart: [] }

    case ACTIONS.ADD_ACTIVE_ORDER:
      return { ...state, activeOrders: [action.order, ...state.activeOrders] }

    case ACTIONS.ADD_ACTIVE_REQUEST:
      return { ...state, activeRequests: [action.request, ...state.activeRequests] }

    default:
      return state
  }
}

// ---------------------------------------------------------------------------
// Context + Provider
// ---------------------------------------------------------------------------
const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState, (init) => {
    if (init.darkMode) document.documentElement.classList.add('dark')
    return init
  })

  // -- Navigation
  const navigate = useCallback((route, params = {}) =>
    dispatch({ type: ACTIONS.NAVIGATE, route, params }), [])

  // -- Auth -------------------------------------------------------------------

  /**
   * Login: returns true on success so callers can run a success animation
   * before navigating. Navigation is NOT called here on purpose.
   */
  const login = useCallback(async (payload) => {
    dispatch({ type: ACTIONS.SET_AUTH_LOADING, loading: true })
    dispatch({ type: ACTIONS.SET_AUTH_ERROR, error: null })
    try {
      const { guest, booking, accessToken } = await authApi.login(payload)
      storage.set('accessToken', accessToken)
      storage.set('guest',       guest)
      storage.set('booking',     booking)
      dispatch({ type: ACTIONS.SET_AUTH_SUCCESS, guest, booking, token: accessToken })
      return true
    } catch (err) {
      dispatch({ type: ACTIONS.SET_AUTH_ERROR, error: err.message || 'Login failed. Please try again.' })
      return false
    }
  }, [])

  const logout = useCallback(async () => {
    await authApi.logout().catch(() => {})
    storage.remove('accessToken')
    storage.remove('guest')
    storage.remove('booking')
    storage.remove('idVerified')
    storage.remove('roomKey')
    dispatch({ type: ACTIONS.LOGOUT })
  }, [])

  // -- ID Verification -------------------------------------------------------
  const setIdVerified = useCallback((verified) => {
    storage.set('idVerified', verified)
    dispatch({ type: ACTIONS.SET_ID_VERIFIED, verified })
  }, [])

  // -- Room Key ---------------------------------------------------------------
  const setRoomKey = useCallback((roomKey) => {
    storage.set('roomKey', roomKey)
    dispatch({ type: ACTIONS.SET_ROOM_KEY, roomKey })
  }, [])

  // -- Session timeout -------------------------------------------------------
  const showSessionWarning = useCallback(() =>
    dispatch({ type: ACTIONS.SET_SESSION_WARNING, show: true }), [])

  const dismissSessionWarning = useCallback(() =>
    dispatch({ type: ACTIONS.SET_SESSION_WARNING, show: false }), [])

  const extendSession = useCallback(() => {
    // Dismissing the warning resets the inactivity timer (via onActivity)
    dispatch({ type: ACTIONS.SET_SESSION_WARNING, show: false })
  }, [])

  useSessionTimeout({
    isAuthenticated: !!state.guest,
    onWarning:  showSessionWarning,
    onExpire:   logout,
    onActivity: dismissSessionWarning,
  })

  // -- Dark mode
  const toggleDarkMode = useCallback(() =>
    dispatch({ type: ACTIONS.TOGGLE_DARK_MODE }), [])

  // -- Notifications
  const setNotifications = useCallback((notifications) =>
    dispatch({ type: ACTIONS.SET_NOTIFICATIONS, notifications }), [])

  const markRead = useCallback((id) =>
    dispatch({ type: ACTIONS.MARK_READ, id }), [])

  const markAllRead = useCallback(() =>
    dispatch({ type: ACTIONS.MARK_ALL_READ }), [])

  // -- Cart
  const addToCart      = useCallback((item) => dispatch({ type: ACTIONS.ADD_TO_CART, item }), [])
  const removeFromCart = useCallback((id)   => dispatch({ type: ACTIONS.REMOVE_FROM_CART, id }), [])
  const updateCartQty  = useCallback((id, quantity) => dispatch({ type: ACTIONS.UPDATE_CART_QTY, id, quantity }), [])
  const clearCart      = useCallback(() => dispatch({ type: ACTIONS.CLEAR_CART }), [])

  const addActiveOrder   = useCallback((order)   => dispatch({ type: ACTIONS.ADD_ACTIVE_ORDER,   order }),   [])
  const addActiveRequest = useCallback((request) => dispatch({ type: ACTIONS.ADD_ACTIVE_REQUEST, request }), [])

  const cartTotal = state.cart.reduce((sum, i) => sum + i.price * i.quantity, 0)
  const cartCount = state.cart.reduce((sum, i) => sum + i.quantity, 0)

  const value = {
    ...state,
    cartTotal,
    cartCount,
    navigate,
    login,
    logout,
    setIdVerified,
    setRoomKey,
    extendSession,
    toggleDarkMode,
    setNotifications,
    markRead,
    markAllRead,
    addToCart,
    removeFromCart,
    updateCartQty,
    clearCart,
    addActiveOrder,
    addActiveRequest,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useApp = () => {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
