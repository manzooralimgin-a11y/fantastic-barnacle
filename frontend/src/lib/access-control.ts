import { buildDomainPath, resolveDomainFromPath, type AppDomain } from "@/lib/domain-config";

export type AppRole = "admin" | "manager" | "staff";
export type HotelPermission =
  | "hotel.dashboard"
  | "hotel.front_desk"
  | "hotel.reservations"
  | "hotel.folio"
  | "hotel.housekeeping"
  | "hotel.reports"
  | "hotel.documents"
  | "hotel.settings"
  | "hotel.rate_management"
  | "hotel.maintenance"
  | "hotel.inventory"
  | "hotel.crm"
  | "hotel.marketing"
  | "hotel.email_inbox"
  | "hotel.channels"
  | "hotel.analytics"
  | "hotel.finance"
  | "hotel.security"
  | "hotel.agents"
  | "hotel.comms";

type RouteRule = {
  prefix: string;
  minRole?: AppRole;
  hotelPermission?: HotelPermission;
};

const roleRank: Record<AppRole, number> = {
  staff: 1,
  manager: 2,
  admin: 3,
};

const gastronomyRouteRules: RouteRule[] = [
  { prefix: buildDomainPath("gastronomy", "/accounting"), minRole: "admin" },
  { prefix: buildDomainPath("gastronomy", "/franchise"), minRole: "admin" },
  { prefix: buildDomainPath("gastronomy", "/simulation"), minRole: "admin" },
  { prefix: buildDomainPath("gastronomy", "/agents"), minRole: "manager" },
  { prefix: buildDomainPath("gastronomy", "/forecasting"), minRole: "manager" },
  { prefix: buildDomainPath("gastronomy", "/inventory"), minRole: "manager" },
  { prefix: buildDomainPath("gastronomy", "/maintenance"), minRole: "manager" },
  { prefix: buildDomainPath("gastronomy", "/marketing"), minRole: "manager" },
  { prefix: buildDomainPath("gastronomy", "/menu-designer"), minRole: "manager" },
  { prefix: buildDomainPath("gastronomy", "/reports"), minRole: "manager" },
  { prefix: buildDomainPath("gastronomy", "/safety"), minRole: "manager" },
  { prefix: buildDomainPath("gastronomy", "/settings"), minRole: "manager" },
  { prefix: buildDomainPath("gastronomy", "/signage"), minRole: "manager" },
  { prefix: buildDomainPath("gastronomy", "/vouchers"), minRole: "manager" },
  { prefix: buildDomainPath("gastronomy", "/workforce"), minRole: "manager" },
];

const hotelRouteRules: RouteRule[] = [
  { prefix: buildDomainPath("hotel", "/dashboard"), hotelPermission: "hotel.dashboard" },
  { prefix: buildDomainPath("hotel", "/front-desk"), hotelPermission: "hotel.front_desk" },
  { prefix: buildDomainPath("hotel", "/reservations"), hotelPermission: "hotel.reservations" },
  { prefix: buildDomainPath("hotel", "/occupancy"), hotelPermission: "hotel.front_desk" },
  { prefix: buildDomainPath("hotel", "/housekeeping"), hotelPermission: "hotel.housekeeping" },
  { prefix: buildDomainPath("hotel", "/tasks"), hotelPermission: "hotel.housekeeping" },
  { prefix: buildDomainPath("hotel", "/inventory"), minRole: "manager", hotelPermission: "hotel.inventory" },
  { prefix: buildDomainPath("hotel", "/maintenance"), minRole: "manager", hotelPermission: "hotel.maintenance" },
  { prefix: buildDomainPath("hotel", "/crm"), minRole: "manager", hotelPermission: "hotel.crm" },
  { prefix: buildDomainPath("hotel", "/documents"), hotelPermission: "hotel.documents" },
  { prefix: buildDomainPath("hotel", "/marketing"), minRole: "manager", hotelPermission: "hotel.marketing" },
  { prefix: buildDomainPath("hotel", "/email-inbox"), minRole: "manager", hotelPermission: "hotel.email_inbox" },
  { prefix: buildDomainPath("hotel", "/channels"), minRole: "manager", hotelPermission: "hotel.channels" },
  { prefix: buildDomainPath("hotel", "/reports"), minRole: "manager", hotelPermission: "hotel.reports" },
  { prefix: buildDomainPath("hotel", "/rates"), minRole: "manager", hotelPermission: "hotel.rate_management" },
  { prefix: buildDomainPath("hotel", "/analytics"), minRole: "manager", hotelPermission: "hotel.analytics" },
  { prefix: buildDomainPath("hotel", "/cash-master"), hotelPermission: "hotel.folio" },
  { prefix: buildDomainPath("hotel", "/comms"), minRole: "manager", hotelPermission: "hotel.comms" },
  { prefix: buildDomainPath("hotel", "/agents"), minRole: "admin", hotelPermission: "hotel.agents" },
  { prefix: buildDomainPath("hotel", "/finance"), minRole: "admin", hotelPermission: "hotel.finance" },
  { prefix: buildDomainPath("hotel", "/security"), minRole: "admin", hotelPermission: "hotel.security" },
  { prefix: buildDomainPath("hotel", "/settings"), minRole: "manager", hotelPermission: "hotel.settings" },
];

const routePermissionMatrix: Record<AppDomain, RouteRule[]> = {
  gastronomy: gastronomyRouteRules,
  hotel: hotelRouteRules,
};

function normalizePath(pathname: string): string {
  if (!pathname || pathname === "/") {
    return "/";
  }
  return pathname.replace(/\/+$/, "") || "/";
}

function prefixMatches(pathname: string, prefix: string): boolean {
  const normalizedPath = normalizePath(pathname);
  const normalizedPrefix = normalizePath(prefix);

  if (normalizedPrefix === "/") {
    return normalizedPath === "/";
  }

  return (
    normalizedPath === normalizedPrefix ||
    normalizedPath.startsWith(`${normalizedPrefix}/`)
  );
}

function findRouteRule(pathname: string, domain: AppDomain): RouteRule | null {
  const rules = routePermissionMatrix[domain]
    .slice()
    .sort((left, right) => right.prefix.length - left.prefix.length);

  return rules.find((rule) => prefixMatches(pathname, rule.prefix)) || null;
}

export function normalizeRole(role: string | undefined): AppRole {
  if (role === "admin" || role === "manager" || role === "staff") {
    return role;
  }
  return "staff";
}

export function hasRoleAccess(role: string | undefined, minRole?: AppRole): boolean {
  if (!minRole) {
    return true;
  }
  return roleRank[normalizeRole(role)] >= roleRank[minRole];
}

export function hasHotelPermission(
  permissions: readonly string[] | undefined,
  requiredPermission?: HotelPermission,
): boolean {
  if (!requiredPermission) {
    return true;
  }
  return (permissions || []).includes(requiredPermission);
}

export function canAccessDomain(domain: AppDomain, role: string | undefined): boolean {
  return hasRoleAccess(role, domain === "hotel" ? "staff" : "staff");
}

export function getRequiredRoleForPath(pathname: string): AppRole | undefined {
  const domain = resolveDomainFromPath(pathname);
  if (!domain) {
    return undefined;
  }
  return findRouteRule(pathname, domain)?.minRole;
}

export function getRequiredHotelPermissionForPath(pathname: string): HotelPermission | undefined {
  const domain = resolveDomainFromPath(pathname);
  if (domain !== "hotel") {
    return undefined;
  }
  return findRouteRule(pathname, domain)?.hotelPermission;
}

export function canAccessPath(
  pathname: string,
  role: string | undefined,
  hotelPermissions?: readonly string[],
): boolean {
  const domain = resolveDomainFromPath(pathname);
  if (!domain) {
    return true;
  }
  if (!canAccessDomain(domain, role)) {
    return false;
  }
  const rule = findRouteRule(pathname, domain);
  if (!hasRoleAccess(role, rule?.minRole)) {
    return false;
  }
  if (domain === "hotel" && !hasHotelPermission(hotelPermissions, rule?.hotelPermission)) {
    return false;
  }
  return true;
}
