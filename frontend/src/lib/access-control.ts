import { buildDomainPath, resolveDomainFromPath, type AppDomain } from "@/lib/domain-config";

export type AppRole = "admin" | "manager" | "staff";

type RouteRule = {
  prefix: string;
  minRole?: AppRole;
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
  { prefix: buildDomainPath("hotel", "/agents"), minRole: "admin" },
  { prefix: buildDomainPath("hotel", "/finance"), minRole: "admin" },
  { prefix: buildDomainPath("hotel", "/security"), minRole: "admin" },
  { prefix: buildDomainPath("hotel", "/analytics"), minRole: "manager" },
  { prefix: buildDomainPath("hotel", "/channels"), minRole: "manager" },
  { prefix: buildDomainPath("hotel", "/comms"), minRole: "manager" },
  { prefix: buildDomainPath("hotel", "/email-inbox"), minRole: "manager" },
  { prefix: buildDomainPath("hotel", "/crm"), minRole: "manager" },
  { prefix: buildDomainPath("hotel", "/inventory"), minRole: "manager" },
  { prefix: buildDomainPath("hotel", "/maintenance"), minRole: "manager" },
  { prefix: buildDomainPath("hotel", "/marketing"), minRole: "manager" },
  { prefix: buildDomainPath("hotel", "/rates"), minRole: "manager" },
  { prefix: buildDomainPath("hotel", "/settings"), minRole: "manager" },
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

export function canAccessPath(pathname: string, role: string | undefined): boolean {
  const domain = resolveDomainFromPath(pathname);
  if (!domain) {
    return true;
  }
  if (!canAccessDomain(domain, role)) {
    return false;
  }
  return hasRoleAccess(role, findRouteRule(pathname, domain)?.minRole);
}
