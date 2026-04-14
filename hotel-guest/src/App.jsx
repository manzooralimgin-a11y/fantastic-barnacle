import { useEffect } from 'react'
import { AppProvider, useApp } from './context/AppContext'
import SessionTimeoutModal from './components/SessionTimeoutModal'
import { ROUTES } from './constants'

// Screens
import SplashScreen          from './screens/SplashScreen'
import LoginScreen           from './screens/LoginScreen'
import IDVerificationScreen  from './screens/IDVerificationScreen'
import RoomKeyScreen         from './screens/RoomKeyScreen'
import HomeScreen            from './screens/HomeScreen'
import RoomServiceScreen     from './screens/RoomServiceScreen'
import SpaScreen             from './screens/SpaScreen'
import HousekeepingScreen    from './screens/HousekeepingScreen'
import ConciergeScreen       from './screens/ConciergeScreen'
import NotificationsScreen   from './screens/NotificationsScreen'
import ProfileScreen         from './screens/ProfileScreen'
import CheckoutScreen        from './screens/CheckoutScreen'
import RoomDetailsScreen     from './screens/RoomDetailsScreen'
import DiningScreen          from './screens/DiningScreen'
import EventsScreen          from './screens/EventsScreen'
import FrontDeskScreen        from './screens/FrontDeskScreen'

// Routes that don't require authentication
const PUBLIC_ROUTES = new Set([ROUTES.SPLASH, ROUTES.LOGIN, ROUTES.ID_VERIFICATION])

function Router() {
  const { currentRoute, guest, navigate } = useApp()

  // Route protection: redirect unauthenticated users to login
  useEffect(() => {
    if (!PUBLIC_ROUTES.has(currentRoute) && !guest) {
      navigate(ROUTES.LOGIN)
    }
  }, [currentRoute, guest, navigate])

  // Don't render protected screens while redirecting
  if (!PUBLIC_ROUTES.has(currentRoute) && !guest) return null

  switch (currentRoute) {
    case ROUTES.SPLASH:          return <SplashScreen />
    case ROUTES.LOGIN:           return <LoginScreen />
    case ROUTES.ID_VERIFICATION: return <IDVerificationScreen />
    case ROUTES.ROOM_KEY:        return <RoomKeyScreen />
    case ROUTES.HOME:            return <HomeScreen />
    case ROUTES.ROOM_SERVICE:    return <RoomServiceScreen />
    case ROUTES.SPA:             return <SpaScreen />
    case ROUTES.HOUSEKEEPING:    return <HousekeepingScreen />
    case ROUTES.CONCIERGE:       return <ConciergeScreen />
    case ROUTES.NOTIFICATIONS:   return <NotificationsScreen />
    case ROUTES.PROFILE:         return <ProfileScreen />
    case ROUTES.CHECKOUT:        return <CheckoutScreen />
    case ROUTES.ROOM_DETAILS:    return <RoomDetailsScreen />
    case ROUTES.DINING:          return <DiningScreen />
    case ROUTES.EVENTS:          return <EventsScreen />
    case ROUTES.FRONT_DESK:      return <FrontDeskScreen />
    default:                     return <HomeScreen />
  }
}

export default function App() {
  return (
    <AppProvider>
      <Router />
      <SessionTimeoutModal />
    </AppProvider>
  )
}
