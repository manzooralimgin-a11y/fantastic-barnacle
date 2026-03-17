export type UserRole = "admin" | "manager" | "staff";

export function getDefaultDashboardRoute(role: string | undefined, section: "gestronomy" | "management" = "gestronomy"): string {
  const userRole = (role || "staff") as UserRole;
  
  if (section === "management") {
    switch (userRole) {
      case "admin":
      case "manager":
        return "/hms/dashboard";
      case "staff":
      default:
        return "/hms/dashboard";
    }
  }

  // DEFAULT: Gestronomy (Restaurant) — always land on the main dashboard
  return "/";
}
