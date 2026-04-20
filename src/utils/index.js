/**
 * Format price to locale currency string
 */
export const formatPrice = (amount, currency = 'EUR') =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(amount)

/**
 * Format date/time
 */
export const formatTime = (date) =>
  new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(new Date(date))

export const formatDate = (date) =>
  new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(date))

/**
 * Simulate async API delay
 */
export const delay = (ms = 600) => new Promise((res) => setTimeout(res, ms))

/**
 * Clamp a number between min and max
 */
export const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

/**
 * Group array of objects by key
 */
export const groupBy = (array, key) =>
  array.reduce((acc, item) => {
    const group = item[key]
    if (!acc[group]) acc[group] = []
    acc[group].push(item)
    return acc
  }, {})

/**
 * Get initials from full name
 */
export const getInitials = (name = '') =>
  name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

/**
 * Persist to localStorage with error handling
 */
export const storage = {
  get: (key, fallback = null) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback }
    catch { return fallback }
  },
  set: (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)) }
    catch { /* quota exceeded */ }
  },
  remove: (key) => {
    try { localStorage.removeItem(key) }
    catch { /* ignore */ }
  },
}
