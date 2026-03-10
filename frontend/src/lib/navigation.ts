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

export type AppRole = "admin" | "manager" | "staff";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  minRole?: AppRole;
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

const roleRank: Record<AppRole, number> = {
  staff: 1,
  manager: 2,
  admin: 3,
};

export function hasRoleAccess(role: string | undefined, minRole?: AppRole): boolean {
  if (!minRole) {
    return true;
  }
  const currentRole = ((role || "staff") as AppRole);
  return roleRank[currentRole] >= roleRank[minRole];
}

export const navSections: NavSection[] = [
  {
    title: "Agents",
    items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard },
      { label: "Agents", href: "/agents", icon: Bot, minRole: "manager" },
      { label: "Alerts", href: "/alerts", icon: Bell },
    ],
  },
  {
    title: "Service",
    items: [
      { label: "Reservations", href: "/reservations", icon: CalendarDays },
      { label: "Waiter Station", href: "/orders", icon: ClipboardList },
      { label: "Kitchen Board", href: "/kitchen-display", icon: Flame },
      { label: "Billing & POS", href: "/billing", icon: Receipt },
      { label: "Vouchers & Cards", href: "/vouchers", icon: Ticket, minRole: "manager" },
      { label: "QR Ordering", href: "/kds", icon: QrCode },
    ],
  },
  {
    title: "Kitchen",
    items: [
      { label: "Kitchen", href: "/kitchen", icon: ChefHat },
      { label: "Menu", href: "/menu", icon: UtensilsCrossed },
      { label: "Menu Designer", href: "/menu-designer", icon: Palette, minRole: "manager" },
      { label: "Digital Signage", href: "/signage", icon: Monitor, minRole: "manager" },
      { label: "Safety", href: "/safety", icon: ShieldCheck, minRole: "manager" },
    ],
  },
  {
    title: "Inventory",
    items: [
      { label: "Inventory", href: "/inventory", icon: Package, minRole: "manager" },
      { label: "Forecasting", href: "/forecasting", icon: TrendingUp, minRole: "manager" },
      { label: "Maintenance", href: "/maintenance", icon: Wrench, minRole: "manager" },
    ],
  },
  {
    title: "Guests",
    items: [
      { label: "Guests", href: "/guests", icon: Heart },
      { label: "Marketing", href: "/marketing", icon: Megaphone, minRole: "manager" },
      { label: "Workforce", href: "/workforce", icon: Users, minRole: "manager" },
    ],
  },
  {
    title: "Finance",
    items: [
      { label: "Accounting", href: "/accounting", icon: Calculator, minRole: "admin" },
      { label: "Reports", href: "/reports", icon: FileText, minRole: "manager" },
      { label: "Franchise", href: "/franchise", icon: Building2, minRole: "admin" },
      { label: "Simulation", href: "/simulation", icon: FlaskConical, minRole: "admin" },
      { label: "Settings", href: "/settings", icon: Settings, minRole: "manager" },
    ],
  },
];

export const quickActions: QuickAction[] = [
  {
    label: "New Reservation",
    href: "/reservations?action=new-reservation",
    description: "Create or assign a table in seconds",
  },
  {
    label: "Add Waitlist Entry",
    href: "/reservations?action=new-waitlist",
    description: "Add walk-ins instantly and manage estimated wait",
  },
  {
    label: "Create New Order",
    href: "/orders",
    description: "Open waiter station to take orders",
  },
  {
    label: "Open Active Orders",
    href: "/orders",
    description: "View and manage all active orders",
  },
  {
    label: "Low Stock Review",
    href: "/inventory?tab=items&filter=low-stock",
    description: "Review low stock and create purchase orders",
    minRole: "manager",
  },
  {
    label: "Create Purchase Order",
    href: "/inventory?tab=orders&action=new-order",
    description: "Open purchase order flow pre-focused on ordering",
    minRole: "manager",
  },
  {
    label: "Guest Recovery",
    href: "/guests",
    description: "Find VIP or at-risk guests and trigger offers",
  },
  {
    label: "Kitchen Queue",
    href: "/kitchen-display",
    description: "Monitor kitchen order board and prep status",
  },
  {
    label: "Reports",
    href: "/reports",
    description: "Review daily revenue, labor, and food cost trends",
    minRole: "manager",
  },
];
