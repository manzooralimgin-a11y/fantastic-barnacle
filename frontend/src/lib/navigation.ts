import {
  Bell,
  Bot,
  Building2,
  CalendarDays,
  Calculator,
  ChefHat,
  ClipboardList,
  FileText,
  Flame,
  FlaskConical,
  Heart,
  LayoutDashboard,
  Megaphone,
  Monitor,
  Package,
  Palette,
  QrCode,
  Receipt,
  Settings,
  ShieldCheck,
  Ticket,
  TrendingUp,
  Users,
  UtensilsCrossed,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { hasHotelPermission, hasRoleAccess, type AppRole, type HotelPermission } from "@/lib/access-control";
import { buildDomainPath, type AppDomain } from "@/lib/domain-config";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  minRole?: AppRole;
  hotelPermission?: HotelPermission;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export interface QuickAction {
  label: string;
  href: string;
  description: string;
  minRole?: AppRole;
}

const gastronomy = (pathname: string) => buildDomainPath("gastronomy", pathname);
const hotel = (pathname: string) => buildDomainPath("hotel", pathname);

export const gastronomyNavSections: NavSection[] = [
  {
    title: "Agents",
    items: [
      { label: "Dashboard", href: gastronomy("/"), icon: LayoutDashboard },
      { label: "Agents", href: gastronomy("/agents"), icon: Bot, minRole: "manager" },
      { label: "Alerts", href: gastronomy("/alerts"), icon: Bell },
    ],
  },
  {
    title: "Service",
    items: [
      { label: "Reservations", href: gastronomy("/reservations"), icon: CalendarDays },
      { label: "Waiter Station", href: gastronomy("/orders"), icon: ClipboardList },
      { label: "Kitchen Board", href: gastronomy("/kitchen-display"), icon: Flame },
      { label: "Billing & POS", href: gastronomy("/billing"), icon: Receipt },
      { label: "Vouchers & Cards", href: gastronomy("/vouchers"), icon: Ticket, minRole: "manager" },
      { label: "QR Ordering", href: "/kds", icon: QrCode },
    ],
  },
  {
    title: "Kitchen",
    items: [
      { label: "Kitchen", href: gastronomy("/kitchen"), icon: ChefHat },
      { label: "Menu", href: gastronomy("/menu"), icon: UtensilsCrossed },
      { label: "Menu Designer", href: gastronomy("/menu-designer"), icon: Palette, minRole: "manager" },
      { label: "Digital Signage", href: gastronomy("/signage"), icon: Monitor, minRole: "manager" },
      { label: "Safety", href: gastronomy("/safety"), icon: ShieldCheck, minRole: "manager" },
    ],
  },
  {
    title: "Inventory",
    items: [
      { label: "Inventory", href: gastronomy("/inventory"), icon: Package, minRole: "manager" },
      { label: "Forecasting", href: gastronomy("/forecasting"), icon: TrendingUp, minRole: "manager" },
      { label: "Maintenance", href: gastronomy("/maintenance"), icon: Wrench, minRole: "manager" },
    ],
  },
  {
    title: "Guests",
    items: [
      { label: "Guests", href: gastronomy("/guests"), icon: Heart },
      { label: "Marketing", href: gastronomy("/marketing"), icon: Megaphone, minRole: "manager" },
      { label: "Workforce", href: gastronomy("/workforce"), icon: Users, minRole: "manager" },
    ],
  },
  {
    title: "Finance",
    items: [
      { label: "Accounting", href: gastronomy("/accounting"), icon: Calculator, minRole: "admin" },
      { label: "Vouchers", href: gastronomy("/accounting/vouchers"), icon: Ticket, minRole: "manager" },
      { label: "Reports", href: gastronomy("/reports"), icon: FileText, minRole: "manager" },
      { label: "Franchise", href: gastronomy("/franchise"), icon: Building2, minRole: "admin" },
      { label: "Simulation", href: gastronomy("/simulation"), icon: FlaskConical, minRole: "admin" },
      { label: "Settings", href: gastronomy("/settings"), icon: Settings, minRole: "manager" },
    ],
  },
];

export const hotelNavSections: NavSection[] = [
  {
    title: "HMS Core",
    items: [
      { label: "Dashboard", href: hotel("/dashboard"), icon: LayoutDashboard, hotelPermission: "hotel.dashboard" },
      { label: "Front Desk", href: hotel("/front-desk"), icon: Monitor, hotelPermission: "hotel.front_desk" },
      { label: "Reservations", href: hotel("/reservations"), icon: CalendarDays, hotelPermission: "hotel.reservations" },
      { label: "Occupancy Board", href: hotel("/occupancy"), icon: Building2, hotelPermission: "hotel.front_desk" },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Housekeeping", href: hotel("/housekeeping"), icon: ClipboardList, hotelPermission: "hotel.housekeeping" },
      { label: "Tasks", href: hotel("/tasks"), icon: ClipboardList, hotelPermission: "hotel.housekeeping" },
      { label: "Maintenance", href: hotel("/maintenance"), icon: Wrench, minRole: "manager", hotelPermission: "hotel.maintenance" },
      { label: "Inventory", href: hotel("/inventory"), icon: Package, minRole: "manager", hotelPermission: "hotel.inventory" },
    ],
  },
  {
    title: "Guests",
    items: [
      { label: "CRM", href: hotel("/crm"), icon: Users, minRole: "manager", hotelPermission: "hotel.crm" },
      { label: "Documents", href: hotel("/documents"), icon: FileText, hotelPermission: "hotel.documents" },
      { label: "Marketing", href: hotel("/marketing"), icon: Megaphone, minRole: "manager", hotelPermission: "hotel.marketing" },
      { label: "Email Inbox", href: hotel("/email-inbox"), icon: Bell, minRole: "manager", hotelPermission: "hotel.email_inbox" },
    ],
  },
  {
    title: "Revenue",
    items: [
      { label: "Channels", href: hotel("/channels"), icon: Building2, minRole: "manager", hotelPermission: "hotel.channels" },
      { label: "Reports", href: hotel("/reports"), icon: FileText, minRole: "manager", hotelPermission: "hotel.reports" },
      { label: "Rate Manager", href: hotel("/rates"), icon: TrendingUp, minRole: "manager", hotelPermission: "hotel.rate_management" },
      { label: "Analytics", href: hotel("/analytics"), icon: Calculator, minRole: "manager", hotelPermission: "hotel.analytics" },
      { label: "Cash-Master", href: hotel("/cash-master"), icon: Receipt, hotelPermission: "hotel.folio" },
    ],
  },
  {
    title: "System",
    items: [
      { label: "AI Agents", href: hotel("/agents"), icon: Bot, minRole: "admin", hotelPermission: "hotel.agents" },
      { label: "Finance", href: hotel("/finance"), icon: Receipt, hotelPermission: "hotel.finance" },
      { label: "Security", href: hotel("/security"), icon: ShieldCheck, minRole: "admin", hotelPermission: "hotel.security" },
      { label: "Settings", href: hotel("/settings"), icon: Settings, minRole: "manager", hotelPermission: "hotel.settings" },
    ],
  },
];

export function getNavSections(domain: AppDomain): NavSection[] {
  return domain === "hotel" ? hotelNavSections : gastronomyNavSections;
}

export const navSections = gastronomyNavSections; // Fallback for backward compatibility

const gastronomyQuickActions: QuickAction[] = [
  {
    label: "New Reservation",
    href: gastronomy("/reservations?action=new-reservation"),
    description: "Create or assign a table in seconds",
  },
  {
    label: "Add Waitlist Entry",
    href: gastronomy("/reservations?action=new-waitlist"),
    description: "Add walk-ins instantly and manage estimated wait",
  },
  {
    label: "Create New Order",
    href: gastronomy("/orders"),
    description: "Open waiter station to take orders",
  },
  {
    label: "Open Active Orders",
    href: gastronomy("/orders"),
    description: "View and manage all active orders",
  },
  {
    label: "Low Stock Review",
    href: gastronomy("/inventory?tab=items&filter=low-stock"),
    description: "Review low stock and create purchase orders",
    minRole: "manager",
  },
  {
    label: "Create Purchase Order",
    href: gastronomy("/inventory?tab=orders&action=new-order"),
    description: "Open purchase order flow pre-focused on ordering",
    minRole: "manager",
  },
  {
    label: "Guest Recovery",
    href: gastronomy("/guests"),
    description: "Find VIP or at-risk guests and trigger offers",
  },
  {
    label: "Kitchen Queue",
    href: gastronomy("/kitchen-display"),
    description: "Monitor kitchen order board and prep status",
  },
  {
    label: "Reports",
    href: gastronomy("/reports"),
    description: "Review daily revenue, labor, and food cost trends",
    minRole: "manager",
  },
];

const hotelQuickActions: QuickAction[] = [
  {
    label: "Open Front Desk",
    href: hotel("/front-desk"),
    description: "Check arrivals, departures, and live room state",
  },
  {
    label: "New Hotel Reservation",
    href: hotel("/reservations"),
    description: "Create or update a guest booking",
  },
  {
    label: "Housekeeping Board",
    href: hotel("/housekeeping"),
    description: "Review rooms in turnover and housekeeping status",
  },
  {
    label: "Rate Manager",
    href: hotel("/rates"),
    description: "Adjust room pricing and availability controls",
    minRole: "manager",
  },
  {
    label: "Channel Review",
    href: hotel("/channels"),
    description: "Inspect OTA and channel connectivity",
    minRole: "manager",
  },
  {
    label: "Security Center",
    href: hotel("/security"),
    description: "Review access, audit, and security controls",
    minRole: "admin",
  },
];

export function getQuickActions(domain: AppDomain): QuickAction[] {
  return domain === "hotel" ? hotelQuickActions : gastronomyQuickActions;
}

export const quickActions = gastronomyQuickActions;

export { hasHotelPermission, hasRoleAccess };
