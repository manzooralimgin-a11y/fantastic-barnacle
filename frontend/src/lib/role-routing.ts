import { canAccessPath, normalizeRole, type AppRole } from "@/lib/access-control";
import {
  buildDomainPath,
  getDefaultDomain,
  normalizeDomain,
  resolveDomainFromPath,
  type AppDomain,
} from "@/lib/domain-config";

export type UserRole = AppRole;

export function getDefaultDashboardRoute(
  role: string | undefined,
  domain: AppDomain = getDefaultDomain(),
): string {
  const userRole = normalizeRole(role);

  if (normalizeDomain(domain) === "hotel") {
    return userRole === "staff"
      ? buildDomainPath("hotel", "/front-desk")
      : buildDomainPath("hotel", "/dashboard");
  }

  return buildDomainPath("gastronomy", "/");
}

export function resolveAuthorizedRoute(
  pathname: string | null | undefined,
  role: string | undefined,
  fallbackDomain: AppDomain = getDefaultDomain(),
  hotelPermissions?: readonly string[],
): string {
  if (!pathname) {
    return getDefaultDashboardRoute(role, fallbackDomain);
  }

  if (canAccessPath(pathname, role, hotelPermissions)) {
    return pathname;
  }

  return getDefaultDashboardRoute(role, resolveDomainFromPath(pathname) || fallbackDomain);
}
