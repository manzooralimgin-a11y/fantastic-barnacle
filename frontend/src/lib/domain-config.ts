export type AppDomain = "gastronomy" | "hotel";

export interface DomainConfig {
  id: AppDomain;
  label: string;
  shortLabel: string;
  loginLabel: string;
  routeBase: string;
  dashboardHref: string;
  settingsHref: string;
  alertsHref: string;
}

const PUBLIC_APP_PREFIXES = ["/login", "/register", "/order", "/receipt", "/display", "/kds"];

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function ensureLeadingSlash(value: string): string {
  return value.startsWith("/") ? value : `/${value}`;
}

function normalizeRouteBase(value: string): string {
  const trimmed = stripTrailingSlash(String(value || "").trim());
  if (!trimmed || trimmed === "/") {
    return "";
  }
  return ensureLeadingSlash(trimmed);
}

function joinRouteBase(base: string, pathname: string): string {
  const normalizedBase = normalizeRouteBase(base);
  const trimmedPath = String(pathname || "").trim();

  if (!trimmedPath || trimmedPath === "/") {
    return normalizedBase || "/";
  }

  const normalizedPath = ensureLeadingSlash(trimmedPath);
  return normalizedBase ? `${normalizedBase}${normalizedPath}` : normalizedPath;
}

export function normalizeDomain(
  value: string | null | undefined,
  fallback: AppDomain = "gastronomy",
): AppDomain {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "hotel" || normalized === "management" || normalized === "hms") {
    return "hotel";
  }
  if (
    normalized === "gastronomy" ||
    normalized === "gestronomy" ||
    normalized === "restaurant"
  ) {
    return "gastronomy";
  }
  return fallback;
}

export function getDefaultDomain(env: NodeJS.ProcessEnv = process.env): AppDomain {
  return normalizeDomain(env.NEXT_PUBLIC_SAAS_DEFAULT_DOMAIN, "gastronomy");
}

export function getDomainConfig(
  domain: AppDomain,
  env: NodeJS.ProcessEnv = process.env,
): DomainConfig {
  const normalizedDomain = normalizeDomain(domain);
  const gastronomyBase = normalizeRouteBase(env.NEXT_PUBLIC_GASTRONOMY_ROUTE_BASE || "");
  const hotelBase = normalizeRouteBase(env.NEXT_PUBLIC_HOTEL_ROUTE_BASE || "/hms");

  if (normalizedDomain === "hotel") {
    return {
      id: "hotel",
      label: env.NEXT_PUBLIC_HOTEL_DOMAIN_LABEL || "Hotel Management",
      shortLabel: env.NEXT_PUBLIC_HOTEL_DOMAIN_SHORT_LABEL || "Hotel",
      loginLabel: env.NEXT_PUBLIC_HOTEL_LOGIN_LABEL || "Hotel Operations",
      routeBase: hotelBase,
      dashboardHref: joinRouteBase(hotelBase, "/dashboard"),
      settingsHref: joinRouteBase(hotelBase, "/settings"),
      alertsHref: joinRouteBase(hotelBase, "/email-inbox"),
    };
  }

  return {
    id: "gastronomy",
    label: env.NEXT_PUBLIC_GASTRONOMY_DOMAIN_LABEL || "Gastronomy Management",
    shortLabel: env.NEXT_PUBLIC_GASTRONOMY_DOMAIN_SHORT_LABEL || "Gastro",
    loginLabel: env.NEXT_PUBLIC_GASTRONOMY_LOGIN_LABEL || "Restaurant Operations",
    routeBase: gastronomyBase,
    dashboardHref: joinRouteBase(gastronomyBase, "/"),
    settingsHref: joinRouteBase(gastronomyBase, "/settings"),
    alertsHref: joinRouteBase(gastronomyBase, "/alerts"),
  };
}

export function buildDomainPath(
  domain: AppDomain,
  pathname: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return joinRouteBase(getDomainConfig(domain, env).routeBase, pathname);
}

export function getSaasBaseUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const baseUrl = stripTrailingSlash(String(env.NEXT_PUBLIC_SAAS_BASE_URL || "").trim());
  return baseUrl || null;
}

export function buildSaasUrl(
  pathname: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const baseUrl = getSaasBaseUrl(env);
  return baseUrl ? `${baseUrl}${normalizedPath}` : normalizedPath;
}

export function isPublicAppPath(pathname: string | null | undefined): boolean {
  if (!pathname) {
    return false;
  }
  return PUBLIC_APP_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function matchesRouteBase(pathname: string, routeBase: string): boolean {
  if (!routeBase) {
    return true;
  }
  return pathname === routeBase || pathname.startsWith(`${routeBase}/`);
}

export function resolveDomainFromPath(
  pathname: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): AppDomain | null {
  if (!pathname || isPublicAppPath(pathname)) {
    return null;
  }

  const hotelConfig = getDomainConfig("hotel", env);
  if (matchesRouteBase(pathname, hotelConfig.routeBase)) {
    return "hotel";
  }

  const gastronomyConfig = getDomainConfig("gastronomy", env);
  if (!gastronomyConfig.routeBase) {
    return "gastronomy";
  }

  return matchesRouteBase(pathname, gastronomyConfig.routeBase) ? "gastronomy" : null;
}

export function buildLoginPath(domain: AppDomain): string {
  return `/login?domain=${domain}`;
}
